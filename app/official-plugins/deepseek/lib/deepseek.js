'use strict';
const crypto = require('crypto');
const { DeepSeekApi } = require('./api');

const FALLBACK_MODELS = ['deepseek-v4-flash', 'deepseek-v4-pro'];
const DEFAULT_SYSTEM = 'Rispondi in italiano, in modo conciso: il testo viene letto su un tablet piccolo. Evita tabelle larghe.';
const MAX_MESSAGES = 40;
const MAX_SESSIONS = 30;
const MAX_TEXT = 12000;
const JOB_TTL_MS = 3600000;
const CACHE_MS = 60000;

function fail(message, code) { return Object.assign(new Error(message), { code: code || 'BAD_REQUEST' }); }
function id() { return crypto.randomBytes(8).toString('hex'); }

class SessionStore {
  constructor(max) { this.max = max; this.items = new Map(); }
  get(sid) {
    const s = sid ? this.items.get(String(sid)) : null;
    if (s) s.touched = Date.now();
    return s || null;
  }
  create(model) {
    if (this.items.size >= this.max) {
      const oldest = Array.from(this.items.values()).sort(function (a, b) { return a.touched - b.touched; })[0];
      this.items.delete(oldest.id);
    }
    const s = { id: id(), model: model, messages: [], touched: Date.now(), job: null };
    this.items.set(s.id, s);
    return s;
  }
  clear() { this.items.clear(); }
}

class Job {
  constructor(session) {
    this.id = id();
    this.sessionId = session.id;
    this.model = session.model;
    this.status = 'running';
    this.phase = 'waiting';
    this.text = '';
    this.error = null;
    this.usage = null;
    this.startedAt = Date.now();
    this.endedAt = 0;
    this.controller = new AbortController();
  }
  view() {
    return {
      id: this.id, sessionId: this.sessionId, model: this.model, status: this.status, phase: this.phase,
      text: this.text, error: this.error, usage: this.usage,
      elapsed: Math.round(((this.endedAt || Date.now()) - this.startedAt) / 1000)
    };
  }
}

class DeepSeek {
  constructor(opts) {
    const o = opts || {};
    this.secrets = o.secrets;
    this.file = o.file;
    this.log = o.log || { info: function () {}, warn: function () {} };
    this.apiFactory = o.apiFactory || function (key) { return new DeepSeekApi({ key: key }); };
    this.sessions = new SessionStore(MAX_SESSIONS);
    this.jobs = new Map();
    this.cache = { models: null, modelsAt: 0, balance: null, balanceAt: 0, error: '' };
  }

  settings() {
    const s = (this.secrets && this.file && this.secrets.loadJson(this.file, this.log)) || {};
    return {
      key: String(s.key || ''),
      model: String(s.model || ''),
      system: s.system === undefined ? DEFAULT_SYSTEM : String(s.system),
      maxTokens: parseInt(s.maxTokens, 10) || 4000
    };
  }

  client() { return this.apiFactory(this.settings().key); }

  save(input) {
    const b = input || {};
    const old = this.settings();
    const key = b.key === undefined || b.key === '' ? old.key : String(b.key).trim();
    if (key && !/^[\x21-\x7e]{8,200}$/.test(key)) throw fail('La chiave API sembra sbagliata');
    const next = {
      key: b.removeKey ? '' : key,
      model: b.model === undefined ? old.model : String(b.model || '').trim().slice(0, 80),
      system: b.system === undefined ? old.system : String(b.system).slice(0, 2000),
      maxTokens: old.maxTokens
    };
    this.secrets.writeJson(this.file, next);
    this.cache = { models: null, modelsAt: 0, balance: null, balanceAt: 0, error: '' };
    return this.check();
  }

  async check() {
    const s = this.settings();
    if (!s.key) { this.cache.error = ''; return this.panelInfo(); }
    try {
      await this.models(true);
      await this.balance(true);
      this.cache.error = '';
    } catch (e) {
      this.cache.error = e.message;
    }
    return this.panelInfo();
  }

  panelInfo() {
    const s = this.settings();
    const b = this.cache.balance;
    return {
      configured: !!s.key,
      status: !s.key ? 'setup' : this.cache.error ? 'error' : this.cache.modelsAt ? 'ready' : 'unknown',
      message: this.cache.error,
      model: s.model,
      system: s.system,
      models: this.cache.models || FALLBACK_MODELS,
      balance: b
    };
  }

  async models(refresh) {
    const s = this.settings();
    if (!s.key) return { configured: false, models: [], defaultModel: '', error: 'Inserisci la chiave API di DeepSeek nel pannello del PC' };
    if (refresh || !this.cache.models || Date.now() - this.cache.modelsAt > CACHE_MS * 10) {
      const list = await this.client().models();
      this.cache.models = list.length ? list : FALLBACK_MODELS.slice();
      this.cache.modelsAt = Date.now();
    }
    const list = this.cache.models;
    const def = list.indexOf(s.model) >= 0 ? s.model : (list.indexOf(FALLBACK_MODELS[0]) >= 0 ? FALLBACK_MODELS[0] : list[0]);
    return { configured: true, models: list, defaultModel: def, error: '' };
  }

  async safeModels() {
    try { return await this.models(false); } catch (e) {
      return { configured: !!this.settings().key, models: [], defaultModel: '', error: e.message };
    }
  }

  async balance(refresh) {
    if (!this.settings().key) throw fail('Inserisci la chiave API di DeepSeek nel pannello del PC', 'SETUP');
    if (refresh || !this.cache.balance || Date.now() - this.cache.balanceAt > CACHE_MS) {
      this.cache.balance = await this.client().balance();
      this.cache.balanceAt = Date.now();
    }
    return this.cache.balance;
  }

  send(sessionId, model, text) {
    const s = this.settings();
    const t = String(text || '').trim().slice(0, MAX_TEXT);
    if (!t) throw fail('Messaggio vuoto');
    if (!s.key) throw fail('Inserisci la chiave API di DeepSeek nel pannello del PC', 'SETUP');
    const m = String(model || s.model || FALLBACK_MODELS[0]).trim();
    if (!/^[A-Za-z0-9._:-]{1,80}$/.test(m)) throw fail('Modello non valido');
    let session = this.sessions.get(sessionId);
    if (!session || session.model !== m) session = this.sessions.create(m);
    if (session.job && session.job.status === 'running') throw fail('Sto ancora rispondendo al messaggio precedente', 'BUSY');
    if (session.messages.length >= MAX_MESSAGES) throw fail('Conversazione troppo lunga: premi NUOVA', 'TOO_LONG');
    session.messages.push({ role: 'user', content: t });
    const job = new Job(session);
    session.job = job;
    this.jobs.set(job.id, job);
    this.prune();
    this.run(session, job, s);
    return { jobId: job.id, sessionId: session.id, model: m };
  }

  run(session, job, s) {
    const self = this;
    const messages = (s.system ? [{ role: 'system', content: s.system }] : []).concat(session.messages);
    this.apiFactory(s.key).stream({ model: session.model, messages: messages, max_tokens: s.maxTokens }, {
      signal: job.controller.signal,
      onThinking: function () { if (job.phase === 'waiting') job.phase = 'thinking'; },
      onText: function (piece) { job.phase = 'writing'; job.text += piece; }
    }).then(function (r) {
      const reply = job.text.trim() || '(risposta vuota)';
      job.text = reply + (r.finish === 'length' ? '\n\n(risposta troncata)' : '');
      job.usage = r.usage ? { input: r.usage.prompt_tokens || 0, output: r.usage.completion_tokens || 0 } : null;
      session.messages.push({ role: 'assistant', content: job.text });
      job.status = 'done';
      self.cache.balanceAt = 0;
    }).catch(function (e) {
      if (e.code === 'STOPPED' && job.text.trim()) {
        job.text = job.text.trim() + '\n\n(fermata)';
        session.messages.push({ role: 'assistant', content: job.text });
        job.status = 'done';
        return;
      }
      session.messages.pop();
      job.status = e.code === 'STOPPED' ? 'stopped' : 'error';
      job.error = e.message;
      if (e.code !== 'STOPPED') self.log.warn('deepseek: ' + e.message);
    }).then(function () {
      job.phase = 'end';
      job.endedAt = Date.now();
    });
  }

  job(jobId) {
    const j = this.jobs.get(String(jobId || ''));
    if (!j) throw fail('Risposta non trovata (dock riavviata?)', 'NOT_FOUND');
    return j.view();
  }

  stop(jobId) {
    const j = this.jobs.get(String(jobId || ''));
    if (!j) throw fail('Risposta non trovata', 'NOT_FOUND');
    if (j.status === 'running') j.controller.abort();
    return { stopped: true };
  }

  prune() {
    const now = Date.now();
    this.jobs.forEach(function (j, k, map) { if (j.endedAt && now - j.endedAt > JOB_TTL_MS) map.delete(k); });
  }
}

module.exports = { DeepSeek: DeepSeek, SessionStore: SessionStore, FALLBACK_MODELS: FALLBACK_MODELS, DEFAULT_SYSTEM: DEFAULT_SYSTEM };
