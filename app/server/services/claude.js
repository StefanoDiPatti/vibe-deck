const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const config = require('../config');
const paths = require('../paths');
const common = require('../platform/common');
const claudecode = require('./claudecode');
const log = require('../log');

const STORE = path.join(paths.DATA_DIR, 'claude-chats.json');
const MAX_CHATS = 60;
const MAX_API_MESSAGES = 80;
let client = null;
let AnthropicMod = null;
let chats = null;
const jobs = {};
const busy = {};

function settings() {
  const s = (config.get('services').claude) || {};
  return {
    backend: s.backend || 'auto',
    model: s.model || 'claude-opus-5-5',
    effort: s.effort || 'low',
    maxTokens: s.maxTokens || 16000,
    system: s.system || 'Rispondi in italiano, in modo conciso: il testo viene letto su un tablet piccolo. Evita tabelle larghe.',
    cliModel: s.cliModel || '',
    cliCwd: s.cliCwd || '~',
    cliTimeoutMs: s.cliTimeoutMs || 900000,
    cliPermissionMode: s.cliPermissionMode || '',
    remoteTargets: Array.isArray(s.remoteTargets) ? s.remoteTargets : [
      { label: 'Finestra attiva', focus: '' },
      { label: 'Claude (app)', focus: 'claude' },
      { label: 'VS Code', focus: 'Code' },
      { label: 'Terminale', focus: 'WindowsTerminal' },
      { label: 'PowerShell', focus: 'powershell' }
    ]
  };
}

function hasCli() { return !!common.which('claude'); }

function resolveBackend() {
  const s = settings();
  const hasKey = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  if (s.backend === 'api') return hasKey ? 'api' : null;
  if (s.backend === 'cli') return hasCli() ? 'cli' : null;
  if (hasKey) return 'api';
  if (hasCli()) return 'cli';
  return null;
}

function info() {
  const s = settings();
  const backend = resolveBackend();
  return {
    available: !!backend,
    backend: backend,
    model: backend === 'api' ? s.model : (s.cliModel || 'predefinito di Claude Code'),
    codeAvailable: hasCli(),
    remoteTargets: s.remoteTargets.map(function (t) { return { label: String(t.label || ''), focus: String(t.focus || '') }; }),
    hint: backend ? null : 'Imposta ANTHROPIC_API_KEY nel .env oppure installa Claude Code (comando "claude")'
  };
}

function load() {
  if (chats) return chats;
  try { chats = JSON.parse(fs.readFileSync(STORE, 'utf8')).chats || {}; } catch (e) { chats = {}; }
  return chats;
}

function save() {
  const list = Object.keys(chats).map(function (k) { return chats[k]; })
    .sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  list.slice(MAX_CHATS).forEach(function (c) { delete chats[c.id]; });
  if (!fs.existsSync(paths.DATA_DIR)) fs.mkdirSync(paths.DATA_DIR, { recursive: true });
  const tmp = STORE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ chats: chats }));
  fs.renameSync(tmp, STORE);
}

function newChat(backend, firstText) {
  load();
  const id = crypto.randomBytes(6).toString('hex');
  chats[id] = {
    id: id,
    title: String(firstText || 'Nuova chat').replace(/\s+/g, ' ').slice(0, 70),
    backend: backend,
    cliSessionId: null,
    api: [],
    display: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  return chats[id];
}

function sdk() {
  if (!AnthropicMod) {
    const mod = require('@anthropic-ai/sdk');
    AnthropicMod = mod.Anthropic || mod.default || mod;
  }
  if (!client) client = new AnthropicMod();
  return client;
}

function apiErrorMessage(e) {
  const A = AnthropicMod;
  if (A && e instanceof A.AuthenticationError) return 'Chiave API non valida (ANTHROPIC_API_KEY)';
  if (A && e instanceof A.PermissionDeniedError) return 'La chiave API non ha accesso a questo modello';
  if (A && e instanceof A.NotFoundError) return 'Modello non trovato: controlla services.json';
  if (A && e instanceof A.RateLimitError) return 'Limite di richieste raggiunto, riprova tra poco';
  if (A && e instanceof A.BadRequestError) return 'Richiesta rifiutata: ' + e.message;
  if (A && e instanceof A.APIConnectionError) return 'Impossibile raggiungere l\'API di Claude (connessione Internet?)';
  if (A && e instanceof A.APIError) return 'Errore API ' + (e.status || '') + ': ' + e.message;
  return e.message;
}

async function runApi(chat, text) {
  const s = settings();
  if (chat.api.length >= MAX_API_MESSAGES) throw new Error('Conversazione troppo lunga: inizia una nuova chat');
  chat.api.push({ role: 'user', content: String(text) });
  try {
    const resp = await sdk().beta.messages.create({
      model: s.model,
      max_tokens: s.maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: s.effort },
      system: s.system,
      messages: chat.api
    });
    if (resp.stop_reason === 'refusal') throw Object.assign(new Error('Claude ha rifiutato questa richiesta'), { refused: true });
    chat.api.push({ role: 'assistant', content: resp.content });
    const reply = resp.content.filter(function (b) { return b.type === 'text'; })
      .map(function (b) { return b.text; }).join('\n').trim();
    return (reply || '(risposta vuota)') + (resp.stop_reason === 'max_tokens' ? '\n\n(risposta troncata)' : '');
  } catch (e) {
    if (chat.api.length && chat.api[chat.api.length - 1].role === 'user') chat.api.pop();
    if (e.refused) throw e;
    log.warn('claude', e.message);
    throw new Error(apiErrorMessage(e));
  }
}

function runCli(opts) {
  const s = settings();
  const args = ['-p', '--output-format', 'json'];
  if (opts.appendSystem) args.push('--append-system-prompt', s.system);
  if (s.cliModel) args.push('--model', s.cliModel);
  const mode = opts.permissionMode || s.cliPermissionMode || (opts.resumeId || opts.cwd ? 'auto' : '');
  if (mode) args.push('--permission-mode', mode);
  if (opts.resumeId) args.push('--resume', opts.resumeId);
  const cwd = common.expandPath(opts.cwd || s.cliCwd) || os.homedir();
  if (!fs.existsSync(cwd)) return Promise.reject(new Error('La cartella della sessione non esiste più: ' + cwd));
  return new Promise(function (resolve, reject) {
    const proc = spawn(common.which('claude'), args, { cwd: cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    const timer = setTimeout(function () { proc.kill(); reject(new Error('Claude Code ci sta mettendo troppo (timeout)')); }, s.cliTimeoutMs);
    proc.stdout.on('data', function (d) { out += d; });
    proc.stderr.on('data', function (d) { err += d; });
    proc.on('error', function (e) { clearTimeout(timer); reject(new Error('Impossibile avviare Claude Code: ' + e.message)); });
    proc.on('close', function () {
      clearTimeout(timer);
      let data = null;
      try { data = JSON.parse(out.trim().split('\n').pop()); } catch (e) { data = null; }
      if (!data) {
        log.warn('claude', 'risposta CLI non valida: ' + common.stripAnsi(err || out).slice(0, 300));
        return reject(new Error('Claude Code non ha risposto: ' + (common.stripAnsi(err).trim().split('\n')[0] || 'output vuoto')));
      }
      if (data.is_error) return reject(new Error(String(data.result || 'Errore di Claude Code')));
      resolve({ reply: String(data.result || '').trim() || '(risposta vuota)', sessionId: data.session_id || opts.resumeId || null });
    });
    proc.stdin.end(String(opts.text));
  });
}

function makeJob(kind, chatId) {
  const id = crypto.randomBytes(6).toString('hex');
  jobs[id] = { id: id, kind: kind, chatId: chatId, status: 'running', startedAt: Date.now() };
  Object.keys(jobs).forEach(function (k) { if (Date.now() - jobs[k].startedAt > 3600000) delete jobs[k]; });
  return jobs[id];
}

function finish(job, err, reply, chatId) {
  job.status = err ? 'error' : 'done';
  job.error = err ? err.message : null;
  job.reply = reply || null;
  if (chatId) job.chatId = chatId;
  job.endedAt = Date.now();
}

function bad(msg, code) { return Object.assign(new Error(msg), { code: code || 'BAD_REQUEST' }); }

function send(kind, id, text, cwd) {
  text = String(text || '').trim();
  if (!text) throw bad('Messaggio vuoto');
  if (kind === 'dock') return sendDock(id, text);
  if (kind === 'code') return sendCode(id, text, cwd);
  throw bad('Tipo di chat sconosciuto');
}

function sendDock(id, text) {
  load();
  let chat = id ? chats[id] : null;
  if (id && !chat) throw bad('Chat non trovata', 'NOT_FOUND');
  const backend = chat ? chat.backend : resolveBackend();
  if (!backend) throw bad(info().hint, 'UNAVAILABLE');
  if (backend === 'api' && !resolveBackend()) throw bad('Chiave API non più configurata', 'UNAVAILABLE');
  if (!chat) chat = newChat(backend, text);
  const lock = 'dock:' + chat.id;
  if (busy[lock]) throw bad('Sto ancora rispondendo al messaggio precedente', 'BUSY');
  busy[lock] = true;
  chat.display.push({ role: 'user', text: text, at: Date.now() });
  chat.updatedAt = Date.now();
  save();
  const job = makeJob('dock', chat.id);
  const run = chat.backend === 'api'
    ? runApi(chat, text)
    : runCli({ text: text, resumeId: chat.cliSessionId, appendSystem: true }).then(function (r) {
      chat.cliSessionId = r.sessionId;
      return r.reply;
    });
  run.then(function (reply) {
    chat.display.push({ role: 'assistant', text: reply, at: Date.now() });
    finish(job, null, reply);
  }).catch(function (e) {
    chat.display.push({ role: 'assistant', text: e.message, error: true, at: Date.now() });
    finish(job, e);
  }).then(function () {
    chat.updatedAt = Date.now();
    delete busy[lock];
    save();
  });
  return { jobId: job.id, kind: 'dock', chatId: chat.id };
}

function sendCode(id, text, cwd) {
  if (!hasCli()) throw bad('Claude Code non è installato su questo PC', 'UNAVAILABLE');
  let session = null;
  if (id) {
    session = claudecode.get(id);
    if (!session) throw bad('Sessione non trovata', 'NOT_FOUND');
    if (!session.cwdExists) throw bad('La cartella di questa sessione non esiste più', 'NOT_FOUND');
    cwd = session.cwd;
  } else if (!cwd || !fs.existsSync(common.expandPath(cwd))) {
    throw bad('Scegli una cartella di progetto esistente');
  }
  const lock = 'code:' + (id || cwd);
  if (busy[lock]) throw bad('Claude Code sta ancora lavorando su questa sessione', 'BUSY');
  busy[lock] = true;
  const job = makeJob('code', id || null);
  job.prompt = text;
  runCli({ text: text, resumeId: id || null, cwd: cwd, permissionMode: desktopMode(id) }).then(function (r) {
    finish(job, null, r.reply, r.sessionId);
  }).catch(function (e) {
    finish(job, e);
  }).then(function () { delete busy[lock]; });
  return { jobId: job.id, kind: 'code', chatId: id || null };
}

function desktopMode(cliId) {
  if (!cliId) return '';
  try {
    const all = require('./desktopcode').list().sections || [];
    for (const sec of all) for (const x of sec.sessions) if (x.cli === cliId) return x.permissionMode || '';
  } catch (e) { }
  return '';
}

function resumeCode(cliId, text, cwd, permissionMode) {
  if (!hasCli()) return Promise.reject(bad('Claude Code non è installato su questo PC', 'UNAVAILABLE'));
  const lock = 'code:' + cliId;
  if (busy[lock]) return Promise.reject(bad('Claude Code sta ancora lavorando su questa sessione', 'BUSY'));
  busy[lock] = true;
  return runCli({ text: text, resumeId: cliId, cwd: cwd, permissionMode: permissionMode || '' })
    .finally(function () { delete busy[lock]; });
}

function getJob(id) {
  const j = jobs[id];
  if (!j) throw bad('Operazione non trovata (server riavviato?)', 'NOT_FOUND');
  return {
    id: j.id, kind: j.kind, chatId: j.chatId, status: j.status, reply: j.reply, error: j.error,
    elapsed: Math.round(((j.endedAt || Date.now()) - j.startedAt) / 1000)
  };
}

function listChats() {
  load();
  const linked = {};
  const dock = Object.keys(chats).map(function (k) {
    const c = chats[k];
    if (c.cliSessionId) linked[c.cliSessionId] = true;
    return { id: c.id, title: c.title, backend: c.backend, updatedAt: c.updatedAt, count: c.display.length, busy: !!busy['dock:' + c.id] };
  }).sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  let code = [];
  const projects = {};
  if (hasCli()) {
    code = claudecode.list(40).filter(function (s) { return !linked[s.id]; }).map(function (s) {
      if (s.cwdExists && !/scratch-workspaces/i.test(s.cwd)) projects[s.cwd] = s.project;
      return { id: s.id, title: s.title, project: s.project, cwd: s.cwd, cwdExists: s.cwdExists, updatedAt: s.updatedAt, busy: !!busy['code:' + s.id] };
    });
  }
  return {
    dock: dock,
    code: code,
    projects: Object.keys(projects).map(function (k) { return { cwd: k, name: projects[k] }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); })
  };
}

function getChat(kind, id) {
  if (kind === 'dock') {
    load();
    const c = chats[id];
    if (!c) throw bad('Chat non trovata', 'NOT_FOUND');
    return { kind: 'dock', id: c.id, title: c.title, subtitle: c.backend === 'api' ? 'Claude API' : 'Claude Code', messages: c.display.slice(-80), busy: !!busy['dock:' + c.id] };
  }
  if (kind === 'code') {
    const t = claudecode.transcript(id, 60);
    if (!t) throw bad('Sessione non trovata', 'NOT_FOUND');
    return {
      kind: 'code', id: id, title: t.info.title, subtitle: t.info.project + (t.info.cwdExists ? '' : ' (cartella non trovata)'),
      cwd: t.info.cwd, canSend: t.info.cwdExists && hasCli(), messages: t.messages, busy: !!busy['code:' + id]
    };
  }
  throw bad('Tipo di chat sconosciuto');
}

function deleteChat(id) {
  load();
  if (!chats[id]) throw bad('Chat non trovata', 'NOT_FOUND');
  delete chats[id];
  save();
  return { deleted: id };
}

async function chatSync(sessionId, text) {
  const r = sendDock(sessionId, text);
  for (let i = 0; i < 900; i++) {
    const j = jobs[r.jobId];
    if (j.status !== 'running') {
      if (j.status === 'error') throw new Error(j.error);
      return { sessionId: r.chatId, reply: j.reply, backend: chats[r.chatId].backend };
    }
    await new Promise(function (res) { setTimeout(res, 1000); });
  }
  throw new Error('Timeout');
}

module.exports = {
  info: info,
  send: send,
  resumeCode: resumeCode,
  getJob: getJob,
  listChats: listChats,
  getChat: getChat,
  deleteChat: deleteChat,
  chat: chatSync,
  _reset: function () { chats = {}; }
};
