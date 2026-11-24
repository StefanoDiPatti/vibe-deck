const fs = require('fs');
const os = require('os');
const path = require('path');

const HEAD = 256 * 1024;
const TAIL = 512 * 1024;
const TRANSCRIPT_TAIL = 3 * 1024 * 1024;
const cache = {};

function root() {
  return process.env.CLAUDE_CONFIG_DIR
    ? path.join(process.env.CLAUDE_CONFIG_DIR, 'projects')
    : path.join(os.homedir(), '.claude', 'projects');
}

function readSlice(file, start, length) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(length);
    const n = fs.readSync(fd, buf, 0, length, start);
    return buf.slice(0, n).toString('utf8');
  } finally { fs.closeSync(fd); }
}

function parseLines(text, dropFirst) {
  const lines = text.split('\n');
  if (dropFirst) lines.shift();
  const out = [];
  lines.forEach(function (l) {
    if (!l.trim()) return;
    try { out.push(JSON.parse(l)); } catch (e) { }
  });
  return out;
}

const REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g;

function cleanUserText(t) {
  return String(t || '')
    .replace(REMINDER, '')
    .replace(/<(command-message|command-args|local-command-stdout|local-command-stderr)>[\s\S]*?<\/\1>/g, '')
    .replace(/<command-name>([\s\S]*?)<\/command-name>/g, '$1')
    .replace(/<\/?[a-z-]+-(context|event|notification)[^>]*>/g, '')
    .trim();
}

function messageText(entry) {
  const m = entry.message || {};
  const c = m.content;
  if (entry.type === 'user') {
    if (typeof c === 'string') return cleanUserText(c) || null;
    if (!Array.isArray(c)) return null;
    const parts = c.filter(function (b) { return b.type === 'text'; }).map(function (b) { return cleanUserText(b.text); }).filter(Boolean);
    return parts.length ? parts.join('\n') : null;
  }
  if (entry.type === 'assistant' && Array.isArray(c)) {
    const parts = [];
    c.forEach(function (b) {
      if (b.type === 'text' && b.text && b.text.trim()) parts.push(b.text.trim());
      else if (b.type === 'tool_use') parts.push('[ ' + b.name + ' ]');
    });
    return parts.length ? parts.join('\n') : null;
  }
  return null;
}

function projectName(cwd) {
  if (!cwd) return '?';
  if (/scratch-workspaces/i.test(cwd)) return 'Claude (senza cartella)';
  return path.basename(cwd) || cwd;
}

function sessionInfo(file) {
  const st = fs.statSync(file);
  const hit = cache[file];
  if (hit && hit.mtime === st.mtimeMs) return hit.info;
  const head = parseLines(readSlice(file, 0, Math.min(HEAD, st.size)), false);
  const tail = st.size > HEAD ? parseLines(readSlice(file, Math.max(0, st.size - TAIL), Math.min(TAIL, st.size)), true) : head;
  let title = '';
  let cwd = '';
  let firstPrompt = '';
  let lastPrompt = '';
  head.concat(tail).forEach(function (e) {
    if (e.type === 'custom-title' && e.customTitle) title = e.customTitle;
    else if (e.type === 'agent-name' && e.agentName && !title) title = e.agentName;
    else if (e.type === 'last-prompt' && e.lastPrompt) lastPrompt = e.lastPrompt;
    if (!cwd && e.cwd) cwd = e.cwd;
    if (!firstPrompt && e.type === 'user' && !e.isSidechain && !e.isMeta) {
      const t = messageText(e);
      if (t && t[0] !== '[') firstPrompt = t;
    }
  });
  const info = {
    id: path.basename(file, '.jsonl'),
    title: (title || firstPrompt || lastPrompt || 'Sessione senza titolo').split('\n')[0].slice(0, 90),
    lastPrompt: lastPrompt.slice(0, 160),
    cwd: cwd,
    project: projectName(cwd),
    cwdExists: !!cwd && fs.existsSync(cwd),
    updatedAt: st.mtimeMs,
    sizeKb: Math.round(st.size / 1024)
  };
  cache[file] = { mtime: st.mtimeMs, info: info };
  return info;
}

function allFiles() {
  const dir = root();
  let out = [];
  try {
    fs.readdirSync(dir).forEach(function (p) {
      const pd = path.join(dir, p);
      let names = [];
      try { names = fs.readdirSync(pd); } catch (e) { return; }
      names.forEach(function (n) { if (/\.jsonl$/.test(n)) out.push(path.join(pd, n)); });
    });
  } catch (e) { return []; }
  return out;
}

function list(limit) {
  const files = allFiles().map(function (f) {
    try { return { f: f, m: fs.statSync(f).mtimeMs }; } catch (e) { return null; }
  }).filter(Boolean).sort(function (a, b) { return b.m - a.m; }).slice(0, limit || 40);
  const out = [];
  files.forEach(function (x) {
    try { out.push(sessionInfo(x.f)); } catch (e) { }
  });
  return out;
}

function findFile(id) {
  if (!/^[0-9a-f-]{8,64}$/i.test(String(id))) return null;
  const files = allFiles();
  for (let i = 0; i < files.length; i++) if (path.basename(files[i], '.jsonl') === id) return files[i];
  return null;
}

function get(id) {
  const f = findFile(id);
  return f ? sessionInfo(f) : null;
}

function transcript(id, max) {
  const f = findFile(id);
  if (!f) return null;
  const st = fs.statSync(f);
  let res = readTranscript(f, st, TRANSCRIPT_TAIL, max);
  if (res.length < 6 && st.size > TRANSCRIPT_TAIL) res = readTranscript(f, st, TRANSCRIPT_TAIL * 5, max);
  return { info: sessionInfo(f), messages: res };
}

function readTranscript(f, st, bytes, max) {
  const entries = parseLines(readSlice(f, Math.max(0, st.size - bytes), Math.min(bytes, st.size)), st.size > bytes);
  const out = [];
  const byMsgId = {};
  entries.forEach(function (e) {
    if ((e.type !== 'user' && e.type !== 'assistant') || e.isSidechain || e.isMeta) return;
    const text = messageText(e);
    if (!text) return;
    const mid = e.type === 'assistant' && e.message && e.message.id;
    if (mid && byMsgId[mid]) { byMsgId[mid].text += '\n' + text; return; }
    const item = { role: e.type, text: text, at: e.timestamp };
    if (mid) byMsgId[mid] = item;
    out.push(item);
  });
  const compact = [];
  out.forEach(function (m) {
    const prev = compact[compact.length - 1];
    if (prev && prev.role === 'assistant' && m.role === 'assistant') prev.text += '\n' + m.text;
    else compact.push(m);
  });
  compact.forEach(function (m) {
    if (m.role === 'assistant') m.text = m.text.replace(/(\[ [^\]\n]+ \]\n?){4,}/g, function (block) {
      const n = block.trim().split('\n').length;
      return '[ ' + n + ' operazioni con gli strumenti ]\n';
    }).trim();
    if (m.text.length > 6000) m.text = m.text.slice(0, 6000) + '\n…';
  });
  return compact.slice(-(max || 60));
}

const stateCache = {};
function state(id) {
  const f = findFile(id);
  if (!f) return 'idle';
  let st;
  try { st = fs.statSync(f); } catch (e) { return 'idle'; }
  const hit = stateCache[f];
  const age = Date.now() - st.mtimeMs;
  if (hit && hit.mtime === st.mtimeMs) return hit.open && age < 10 * 60000 ? 'busy' : 'idle';
  const lines = parseLines(readSlice(f, Math.max(0, st.size - 64 * 1024), Math.min(64 * 1024, st.size)), st.size > 64 * 1024);
  let open = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    const e = lines[i];
    if (e.isSidechain || (e.type !== 'user' && e.type !== 'assistant')) continue;
    open = !(e.type === 'assistant' && e.message && e.message.stop_reason === 'end_turn');
    break;
  }
  stateCache[f] = { mtime: st.mtimeMs, open: open };
  return open && age < 10 * 60000 ? 'busy' : 'idle';
}

module.exports = { list: list, get: get, transcript: transcript, state: state, _internals: { messageText: messageText, cleanUserText: cleanUserText } };
