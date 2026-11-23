const fs = require('fs');
const os = require('os');
const path = require('path');
const platform = require('../../../server/platform');
const claudecode = require('./claudecode');
const log = require('../../../server/log');

const LIST_TTL = 3000;
const WAIT_IDLE_MS = 20 * 60000;
let listCache = { at: 0, data: null };
const queue = {};

function appDirs() {
  const home = os.homedir();
  const out = [];
  const add = function (d) { try { if (fs.existsSync(path.join(d, 'claude-code-sessions'))) out.push(d); } catch (e) { } };
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    try { fs.readdirSync(path.join(local, 'Claude-Data')).forEach(function (n) { add(path.join(local, 'Claude-Data', n)); }); } catch (e) { }
    add(path.join(roaming, 'Claude'));
    try {
      fs.readdirSync(path.join(local, 'Packages')).filter(function (n) { return /^Claude_/i.test(n); })
        .forEach(function (n) { add(path.join(local, 'Packages', n, 'LocalCache', 'Roaming', 'Claude')); });
    } catch (e) { }
  } else if (process.platform === 'darwin') {
    add(path.join(home, 'Library', 'Application Support', 'Claude'));
  } else {
    add(path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Claude'));
  }
  return out;
}

function locate() {
  let best = null;
  appDirs().forEach(function (app) {
    const base = path.join(app, 'claude-code-sessions');
    let accounts = [];
    try { accounts = fs.readdirSync(base); } catch (e) { return; }
    accounts.forEach(function (a) {
      let orgs = [];
      try { orgs = fs.readdirSync(path.join(base, a)); } catch (e) { return; }
      orgs.forEach(function (o) {
        const dir = path.join(base, a, o);
        let m = 0;
        try { m = fs.statSync(dir).mtimeMs; } catch (e) { return; }
        if (!best || m > best.m) best = { app: app, scope: a + '/' + o, dir: dir, m: m };
      });
    });
  });
  return best;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}

function sidebar(loc) {
  const cfg = readJson(path.join(loc.app, 'claude_desktop_config.json')) || {};
  const prefs = ((cfg.preferences || {}).epitaxyPrefs) || {};
  const g = (prefs['dframe-group-scopes'] || {})[loc.scope] || {};
  const sec = ((prefs['dframe-code-sections'] || {})[loc.scope] || {}).sections || [];
  const names = {};
  (g.groups || []).forEach(function (x) { names[x.id] = x.name; });
  const order = sec.filter(function (s) { return s.kind === 'manual' && s.shown !== false; })
    .sort(function (a, b) { return a.order - b.order; }).map(function (s) { return s.id; });
  (g.groups || []).forEach(function (x) { if (order.indexOf(x.id) < 0) order.push(x.id); });
  return { names: names, order: order, assignments: g.assignments || {} };
}

function projectOf(cwd) { return path.basename(String(cwd || '').replace(/[\\/]+$/, '')) || cwd || '?'; }

function sessions() {
  const loc = locate();
  if (!loc) return null;
  const out = [];
  let files = [];
  try { files = fs.readdirSync(loc.dir).filter(function (n) { return /^local_[\w-]+\.json$/.test(n); }); } catch (e) { return null; }
  files.forEach(function (n) {
    const s = readJson(path.join(loc.dir, n));
    if (!s || s.isArchived || !s.sessionId) return;
    out.push({
      id: String(s.sessionId),
      cli: s.cliSessionId ? String(s.cliSessionId) : '',
      title: String(s.title || 'Sessione senza titolo'),
      cwd: String(s.cwd || ''),
      project: projectOf(s.cwd),
      permissionMode: s.permissionMode || '',
      updatedAt: Number(s.lastActivityAt || s.createdAt || 0)
    });
  });
  return { loc: loc, list: out };
}

function list() {
  if (listCache.data && Date.now() - listCache.at < LIST_TTL) return listCache.data;
  const found = sessions();
  if (!found) {
    listCache = { at: Date.now(), data: { available: false, sections: [] } };
    return listCache.data;
  }
  const bar = sidebar(found.loc);
  const groups = {};
  const loose = {};
  found.list.forEach(function (s) {
    const state = s.cli ? claudecode.state(s.cli) : 'idle';
    const q = queue[s.id];
    const row = Object.assign({}, s, { busy: state === 'busy', queued: !!(q && q.state === 'waiting') });
    const gid = bar.assignments['code:' + s.id];
    if (gid && bar.names[gid]) (groups[gid] = groups[gid] || []).push(row);
    else (loose[s.project] = loose[s.project] || []).push(row);
  });
  const byRecent = function (a, b) { return b.updatedAt - a.updatedAt; };
  const sections = [];
  bar.order.forEach(function (gid) {
    if (groups[gid]) sections.push({ id: gid, name: bar.names[gid], sessions: groups[gid].sort(byRecent) });
  });
  Object.keys(loose).map(function (p) { return { id: 'p:' + p, name: p, project: true, sessions: loose[p].sort(byRecent) }; })
    .sort(function (a, b) { return b.sessions[0].updatedAt - a.sessions[0].updatedAt; })
    .forEach(function (s) { sections.push(s); });
  listCache = { at: Date.now(), data: { available: true, appUi: typeof platform.claudeView === 'function', sections: sections } };
  return listCache.data;
}

function find(id) {
  const found = sessions();
  if (!found) return null;
  return found.list.filter(function (s) { return s.id === String(id); })[0] || null;
}

function get(id) {
  const s = find(id);
  if (!s) throw Object.assign(new Error('Sessione non trovata (archiviata o cancellata?)'), { code: 'NOT_FOUND' });
  const t = s.cli ? claudecode.transcript(s.cli, 60) : null;
  const q = queue[s.id];
  return {
    id: s.id,
    title: s.title,
    project: s.project,
    cwd: s.cwd,
    permissionMode: s.permissionMode,
    messages: t ? t.messages : [],
    busy: s.cli ? claudecode.state(s.cli) === 'busy' : false,
    queue: q ? { state: q.state, text: q.text, error: q.error || '' } : null,
    appUi: typeof platform.claudeView === 'function'
  };
}

function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function openInApp(id) {
  return platform.open('claude://code/continue?session=' + encodeURIComponent(id));
}

async function showSession(s) {
  await openInApp(s.id);
  for (let i = 0; i < 16; i++) {
    await wait(500);
    const v = await platform.claudeView();
    if (!v.app) continue;
    if (v.trustDialog) {
      await platform.claudeCloseTrust().catch(function () {});
      throw Object.assign(new Error('La cartella non è segnata come attendibile: apri la sessione una volta sul PC'), { code: 'UNAVAILABLE' });
    }
    if (v.composer && (v.titles || []).indexOf(s.title) >= 0) return v;
  }
  throw Object.assign(new Error('L\'app di Claude non ha aperto la sessione'), { code: 'UNAVAILABLE' });
}

async function confirmed(s, text, before) {
  const needle = text.trim().slice(0, 40);
  for (let i = 0; i < 20; i++) {
    await wait(750);
    const t = claudecode.transcript(s.cli, 8);
    if (t && t.messages.some(function (m) { return m.role === 'user' && m.at && Date.parse(m.at) >= before - 2000 && m.text.indexOf(needle) >= 0; })) return true;
  }
  return false;
}

async function deliver(s, item) {
  const deadline = Date.now() + WAIT_IDLE_MS;
  for (;;) {
    if (item.cancelled) return;
    if (s.cli && claudecode.state(s.cli) === 'busy') {
      if (Date.now() > deadline) throw new Error('Claude è ancora al lavoro da troppo tempo: messaggio non inviato');
      await wait(3000);
      continue;
    }
    const v = await showSession(s);
    if (v.draft) throw Object.assign(new Error('Sul PC c\'è già del testo scritto in questa sessione: invialo o cancellalo prima'), { code: 'BUSY' });
    if (v.busy) {
      if (Date.now() > deadline) throw new Error('Claude è ancora al lavoro da troppo tempo: messaggio non inviato');
      await wait(3000);
      continue;
    }
    const before = Date.now();
    try {
      await platform.claudeSend(s.title, item.text);
    } catch (e) {
      if (/occupata/.test(e.message)) { await wait(3000); continue; }
      throw e;
    }
    if (s.cli && !(await confirmed(s, item.text, before))) log.warn('claude-app', 'invio non confermato dal transcript per ' + s.title);
    return;
  }
}

function deliverCli(s, item) {
  const claude = require('./claude');
  return claude.resumeCode(s.cli, item.text, s.cwd, s.permissionMode);
}

function send(id, text) {
  text = String(text || '').trim();
  if (!text) throw Object.assign(new Error('Messaggio vuoto'), { code: 'BAD_REQUEST' });
  if (text.length > 20000) throw Object.assign(new Error('Messaggio troppo lungo'), { code: 'BAD_REQUEST' });
  const s = find(id);
  if (!s) throw Object.assign(new Error('Sessione non trovata'), { code: 'NOT_FOUND' });
  if (queue[s.id] && queue[s.id].state === 'waiting') throw Object.assign(new Error('C\'è già un messaggio in attesa per questa sessione'), { code: 'BUSY' });
  const item = { text: text, state: 'waiting', at: Date.now() };
  queue[s.id] = item;
  listCache.at = 0;
  const useApp = typeof platform.claudeView === 'function';
  (async function () {
    try {
      const v = useApp ? await platform.claudeView().catch(function () { return { app: false }; }) : { app: false };
      if (v.app) await deliver(s, item);
      else if (s.cli) await deliverCli(s, item);
      else throw new Error('Apri l\'app di Claude sul PC');
      item.state = 'sent';
      log.info('claude-app', 'messaggio inviato a "' + s.title + '"' + (v.app ? '' : ' (riga di comando)'));
    } catch (e) {
      item.state = 'error';
      item.error = e.message;
      log.warn('claude-app', '"' + s.title + '": ' + e.message);
    } finally {
      listCache.at = 0;
      setTimeout(function () { if (queue[s.id] === item) delete queue[s.id]; }, 60000);
    }
  })();
  return { queued: true };
}

function cancel(id) {
  const q = queue[String(id)];
  if (q && q.state === 'waiting') { q.cancelled = true; q.state = 'error'; q.error = 'Annullato'; }
  return { cancelled: !!q };
}

async function stop(id) {
  const s = find(id);
  if (!s) throw Object.assign(new Error('Sessione non trovata'), { code: 'NOT_FOUND' });
  if (typeof platform.claudeView !== 'function') throw Object.assign(new Error('Fermare Claude dal tablet funziona solo su Windows'), { code: 'UNSUPPORTED' });
  await showSession(s);
  const r = await platform.claudeStop(s.title);
  return { stopped: !!r.stopped };
}

const NEW_TITLES = ['Nuova sessione', 'New session'];
async function create(sectionId, text) {
  text = String(text || '').trim();
  if (!text) throw Object.assign(new Error('Scrivi il primo messaggio'), { code: 'BAD_REQUEST' });
  if (typeof platform.claudeView !== 'function') throw Object.assign(new Error('Le nuove sessioni dal tablet funzionano solo su Windows'), { code: 'UNSUPPORTED' });
  const sec = (list().sections || []).filter(function (s) { return s.id === String(sectionId); })[0];
  if (!sec) throw Object.assign(new Error('Sezione non trovata'), { code: 'BAD_REQUEST' });
  const v0 = await platform.claudeView();
  if (!v0.app) throw Object.assign(new Error('Apri l\'app di Claude sul PC'), { code: 'UNAVAILABLE' });
  await platform.claudeNewIn(sec.project ? '' : sec.name, sec.project ? sec.name : '');
  const cwd = sec.sessions[0] ? sec.sessions[0].cwd : sec.name;
  let title = '';
  for (let i = 0; i < 16 && !title; i++) {
    await wait(500);
    const v = await platform.claudeView();
    if (v.trustDialog) {
      await platform.claudeCloseTrust().catch(function () {});
      throw Object.assign(new Error('La cartella non è segnata come attendibile: apri una sessione lì dal PC'), { code: 'UNAVAILABLE' });
    }
    const titles = v.titles || [];
    if (v.composer && !v.draft && !v.busy && (!titles.length || titles.some(function (t) { return NEW_TITLES.indexOf(t) >= 0; }))) title = 'new';
  }
  if (!title) throw Object.assign(new Error('L\'app di Claude non ha aperto una nuova sessione'), { code: 'UNAVAILABLE' });
  await platform.claudeSend('', text);
  listCache.at = 0;
  log.info('claude-app', 'nuova sessione in ' + projectOf(cwd));
  return { created: true };
}

async function openOnPc(id) {
  const s = find(id);
  if (!s) throw Object.assign(new Error('Sessione non trovata'), { code: 'NOT_FOUND' });
  await openInApp(s.id);
  return { opened: true };
}

module.exports = { list: list, get: get, send: send, cancel: cancel, stop: stop, create: create, openOnPc: openOnPc, _sidebar: sidebar, _locate: locate };
