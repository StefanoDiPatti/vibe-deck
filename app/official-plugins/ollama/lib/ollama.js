'use strict';
const crypto = require('crypto');

const MAX_MESSAGES = 40;
const MAX_SESSIONS = 30;
const sessions = {};

let readSettings = function () { return {}; };
function configure(fn) { readSettings = fn; }

function newSession(model) {
  const ids = Object.keys(sessions);
  if (ids.length >= MAX_SESSIONS) {
    ids.sort(function (a, b) { return sessions[a].touched - sessions[b].touched; });
    delete sessions[ids[0]];
  }
  const id = crypto.randomBytes(8).toString('hex');
  sessions[id] = { id: id, model: model, messages: [], touched: Date.now(), busy: false };
  return sessions[id];
}

function session(id) {
  const s = id && sessions[id];
  if (s) s.touched = Date.now();
  return s || null;
}

async function fetchJson(url, opts) {
  opts = opts || {};
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, opts.timeout || 5000);
  try {
    const res = await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    return { ok: res.ok, status: res.status, data: data };
  } finally {
    clearTimeout(timer);
  }
}

function settings() {
  const s = readSettings() || {};
  return {
    url: (process.env.OLLAMA_URL || s.url || 'http://127.0.0.1:11434').replace(/\/+$/, ''),
    defaultModel: s.defaultModel || '',
    timeoutMs: s.timeoutMs || 180000,
    system: s.system || '',
    keepAlive: s.keepAlive || '10m'
  };
}

async function models() {
  const s = settings();
  try {
    const r = await fetchJson(s.url + '/api/tags', { timeout: 3000 });
    if (!r.ok) return { running: false, models: [], error: 'Ollama ha risposto ' + r.status };
    const list = ((r.data && r.data.models) || []).map(function (m) {
      return { name: m.name, sizeGb: m.size ? Math.round((m.size / 1073741824) * 10) / 10 : null };
    });
    list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    let def = s.defaultModel;
    if (!def || !list.some(function (m) { return m.name === def; })) def = list.length ? list[0].name : '';
    return { running: true, models: list, defaultModel: def };
  } catch (e) {
    return { running: false, models: [], error: 'Ollama non è in esecuzione (' + s.url + ')' };
  }
}

function stripThinking(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

async function chat(sessionId, model, text) {
  const s = settings();
  if (!model) throw Object.assign(new Error('Scegli un modello'), { code: 'BAD_REQUEST' });
  let current = session(sessionId);
  if (!current || current.model !== model) current = newSession(model);
  if (current.busy) throw Object.assign(new Error('Sto ancora rispondendo al messaggio precedente'), { code: 'BUSY' });
  if (current.messages.length >= MAX_MESSAGES) {
    throw Object.assign(new Error('Conversazione troppo lunga: premi NUOVA'), { code: 'TOO_LONG' });
  }

  const messages = [];
  if (s.system) messages.push({ role: 'system', content: s.system });
  current.messages.push({ role: 'user', content: String(text) });
  current.busy = true;
  try {
    const r = await fetchJson(s.url + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model, messages: messages.concat(current.messages), stream: false, keep_alive: s.keepAlive }),
      timeout: s.timeoutMs
    });
    if (!r.ok) throw new Error((r.data && r.data.error) || ('Ollama ha risposto ' + r.status));
    const reply = stripThinking(r.data && r.data.message && r.data.message.content);
    current.messages.push({ role: 'assistant', content: reply });
    return { sessionId: current.id, model: model, reply: reply };
  } catch (e) {
    current.messages.pop();
    if (e.name === 'AbortError') throw new Error('Ollama ci sta mettendo troppo: riprova o usa un modello più piccolo');
    if (/fetch failed|ECONNREFUSED/i.test(e.message)) throw new Error('Ollama non è in esecuzione');
    throw e;
  } finally {
    current.busy = false;
  }
}

module.exports = { configure: configure, models: models, chat: chat, stripThinking: stripThinking, settings: settings };
