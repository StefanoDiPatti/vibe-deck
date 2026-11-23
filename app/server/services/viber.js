'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const platform = require('../platform');
const keys = require('../platform/keys');
const log = require('../log');

const PANELS = ['terminal', 'git', 'browser', 'chat', 'tasks', 'files', 'team', 'notes', 'pr', 'deploy', 'debug', 'simulator'];
const LAYOUTS = ['default', 'debug', 'review', 'fullscreen'];
const VIEWS = { tabs: '1', agents: '2', focus: '3' };
const URGENCY = { question: 3, working: 2, completed: 1, idle: 0 };
const ALIAS = { 'git-diff': 'git', 'git-graph': 'git', todos: 'tasks' };
function panelId(p) { const id = String(p).split(':')[0]; return ALIAS[id] || id; }

function configPath() {
  return process.env.VIBER_MCP_ENDPOINT || path.join(os.homedir(), '.viber', 'browser-mcp.json');
}
function readConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    return typeof c.port === 'number' && typeof c.token === 'string' ? c : null;
  } catch (e) { return null; }
}

function err(msg, code) { return Object.assign(new Error(msg), { code: code || 'UNAVAILABLE' }); }

function friendly(msg) {
  if (/is not open in this layout/i.test(msg)) return 'Questo pannello non è tra le schede aperte in Viber';
  if (/is hidden for this project/i.test(msg)) return 'Questo pannello è nascosto in Viber per questo progetto';
  return 'Viber: ' + msg;
}

function call(endpoint, body, timeout) {
  const cfg = readConfig();
  if (!cfg) return Promise.reject(err('Viber non è aperto (o non ha mai avviato i suoi strumenti) su questo PC'));
  return new Promise(function (resolve, reject) {
    const data = body !== undefined ? JSON.stringify(body) : '';
    const req = http.request({
      host: '127.0.0.1', port: cfg.port, path: endpoint, method: body !== undefined ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: timeout || 8000
    }, function (res) {
      let b = '';
      res.on('data', function (c) { b += c; });
      res.on('end', function () {
        let j = null;
        try { j = JSON.parse(b); } catch (e) { }
        if (res.statusCode >= 400 || !j) return reject(err('Viber: ' + ((j && j.error) || ('errore ' + res.statusCode))));
        if (j.error) return reject(err(friendly(String(j.error))));
        resolve(j);
      });
    });
    req.on('timeout', function () { req.destroy(); reject(err('Viber non risponde')); });
    req.on('error', function (e) {
      reject(err(e.code === 'ECONNREFUSED' ? 'Viber non è aperto su questo PC' : 'Viber: ' + e.message));
    });
    req.end(data);
  });
}

function summarize(st) {
  const leaves = (st && st.layout && st.layout.leaves) || [];
  const open = {};
  let active = '';
  leaves.forEach(function (l) {
    (l.panels || []).forEach(function (p) { open[panelId(p)] = true; });
    if (!active && l.activePanel) active = panelId(l.activePanel);
  });
  return {
    project: st && st.worktree ? st.worktree.path : '',
    name: st && st.worktree ? path.basename(String(st.worktree.path).replace(/[\\/]+$/, '')) : '',
    active: active,
    open: Object.keys(open)
  };
}

async function state() {
  try {
    const st = await call('/viber/state');
    return Object.assign({ online: true, panels: PANELS }, summarize(st));
  } catch (e) {
    return { online: false, message: e.message, panels: PANELS };
  }
}

async function bringFront() {
  try { await platform.focus('Viber'); } catch (e) { log.debug('viber', 'primo piano: ' + e.message); }
}

async function focusPanel(panel) {
  if (PANELS.indexOf(panel) < 0) throw err('Pannello non valido', 'BAD_REQUEST');
  await call('/viber/focus-panel', { panel: panel });
  await bringFront();
  return state();
}

async function setLayout(preset) {
  if (LAYOUTS.indexOf(preset) < 0) throw err('Disposizione non valida', 'BAD_REQUEST');
  const body = { preset: preset };
  if (preset === 'fullscreen') {
    const st = await state();
    if (st.online && PANELS.indexOf(st.active) >= 0) body.panel = st.active;
  }
  await call('/viber/set-layout', body);
  await bringFront();
  return state();
}

async function front() {
  const st = await state();
  if (!st.online) throw err(st.message);
  try { await platform.focus('Viber'); } catch (e) { throw err('Non riesco a portare Viber in primo piano'); }
  return st;
}

async function view(mode) {
  if (!Object.prototype.hasOwnProperty.call(VIEWS, mode)) throw err('Vista non valida', 'BAD_REQUEST');
  const st = await front();
  await platform.sendKeys(['CTRL', 'ALT', VIEWS[mode]]);
  return st;
}

function settingsPath() {
  if (process.env.VIBER_SETTINGS_FILE) return process.env.VIBER_SETTINGS_FILE;
  const base = process.platform === 'win32' ? (process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
    : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support')
      : (process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'));
  return path.join(base, '@viber', 'desktop', 'app-settings.json');
}

function comboOf(sc) {
  if (!sc || typeof sc.key !== 'string') return null;
  const k = keys.canonical(sc.key);
  if (!k) return null;
  const c = [];
  if (sc.ctrl) c.push('CTRL');
  if (sc.alt) c.push('ALT');
  if (sc.shift) c.push('SHIFT');
  if (sc.meta) c.push('WIN');
  c.push(k);
  return c;
}
function label(sc) {
  if (!sc) return '?';
  return (sc.ctrl ? 'Ctrl+' : '') + (sc.alt ? 'Alt+' : '') + (sc.shift ? 'Shift+' : '') + (sc.meta ? 'Win+' : '') + sc.key;
}
function cycleShortcuts() {
  let s = {};
  try { s = (JSON.parse(fs.readFileSync(settingsPath(), 'utf8')).keyboardShortcuts) || {}; } catch (e) { s = {}; }
  const mac = process.platform === 'darwin';
  return {
    next: s.cycleProjectNext || { key: ']', ctrl: !mac, meta: mac },
    prev: s.cycleProjectPrev || { key: '[', ctrl: !mac, meta: mac }
  };
}

function norm(p) { return String(p || '').replace(/[\\/]+$/, '').toLowerCase(); }
function projectOf(dir, list) {
  const d = norm(dir);
  let best = null;
  list.forEach(function (p) {
    const n = norm(p);
    if ((d === n || d.indexOf(n) === 0) && (!best || n.length > norm(best).length)) best = p;
  });
  return best;
}

async function projects() {
  const res = await Promise.all([call('/agents/projects', {}), call('/agents/list', {}).catch(function () { return []; }), call('/viber/state')]);
  const list = (res[0] && res[0].projects) || [];
  const agents = Array.isArray(res[1]) ? res[1] : [];
  const current = projectOf(summarize(res[2]).project, list);
  return {
    projects: list.map(function (p) {
      const mine = agents.filter(function (a) { return projectOf(a.agent, list) === p; });
      let st = 'idle';
      mine.forEach(function (a) { if ((URGENCY[a.state] || 0) > URGENCY[st]) st = a.state; });
      const top = mine.filter(function (a) { return a.state === st; })[0];
      return {
        path: p, name: path.basename(String(p).replace(/[\\/]+$/, '')), active: p === current,
        state: st, agents: mine.length, title: top ? top.title || '' : ''
      };
    })
  };
}

async function project(target) {
  const info = await projects();
  const list = info.projects;
  if (list.length < 2) throw err('In Viber c\'è un solo progetto aperto', 'BAD_REQUEST');
  let cur = -1;
  list.forEach(function (p, i) { if (p.active) cur = i; });
  if (cur < 0) throw err('Non so quale progetto mostra Viber');
  let steps, dir;
  if (target === 'next' || target === 'prev') { steps = 1; dir = target; } else {
    let to = -1;
    list.forEach(function (p, i) { if (norm(p.path) === norm(target)) to = i; });
    if (to < 0) throw err('Progetto non aperto in Viber', 'BAD_REQUEST');
    if (to === cur) return info;
    const fwd = (to - cur + list.length) % list.length;
    dir = fwd <= list.length - fwd ? 'next' : 'prev';
    steps = dir === 'next' ? fwd : list.length - fwd;
  }
  const sc = cycleShortcuts()[dir];
  const combo = comboOf(sc);
  if (!combo) throw err('La scorciatoia di Viber per cambiare progetto (' + label(sc) + ') non si può premere dal tablet', 'UNSUPPORTED');
  await front();
  let at = cur;
  for (let i = 0; i < steps; i++) {
    await platform.sendKeys(combo);
    const want = list[(at + (dir === 'next' ? 1 : list.length - 1)) % list.length].path;
    let now = null;
    for (let t = 0; t < 8 && now !== want; t++) {
      await new Promise(function (r) { setTimeout(r, 150); });
      now = projectOf(summarize(await call('/viber/state')).project, list.map(function (p) { return p.path; }));
    }
    if (now !== want) {
      throw err('Viber non ha cambiato progetto: la scorciatoia ' + label(sc) + ' forse non si può premere con la tua tastiera. ' +
        'In Viber > Impostazioni > Scorciatoie scegline una con tasti che hai (es. Ctrl+PagGiù / Ctrl+PagSu)');
    }
    at = (at + (dir === 'next' ? 1 : list.length - 1)) % list.length;
  }
  return projects();
}

async function action(a) {
  if (a.panel) return focusPanel(String(a.panel));
  if (a.layout) return setLayout(String(a.layout));
  if (a.view) return view(String(a.view));
  if (a.project) return project(String(a.project));
  throw err('Azione Viber senza "panel", "layout", "view" o "project"', 'BAD_CONFIG');
}

async function tasks() {
  const st = summarize(await call('/viber/state'));
  if (!st.project) return { project: '', tasks: [] };
  let project = st.project;
  try {
    const p = await call('/tasks/projects', {});
    const list = (p && p.projects) || [];
    const norm = function (s) { return String(s).replace(/[\\/]+$/, '').toLowerCase(); };
    const exact = list.filter(function (x) { return norm(x) === norm(st.project); })[0];
    const inside = list.filter(function (x) { return norm(st.project).indexOf(norm(x) + path.sep.toLowerCase()) === 0; })[0];
    project = exact || inside || project;
  } catch (e) { }
  const r = await call('/tasks/list', { projectPath: project, includeDone: false });
  const all = (r && r.tasks) || [];
  const byParent = {};
  all.forEach(function (t) { if (t.parentId) (byParent[t.parentId] = byParent[t.parentId] || []).push(t); });
  const out = all.filter(function (t) { return !t.parentId; }).map(function (t) {
    return {
      id: t.id, text: t.text, status: t.status,
      branch: t.assignee ? t.assignee.branch || '' : '',
      steps: (byParent[t.id] || []).map(function (s) { return { id: s.id, text: s.text, status: s.status }; })
    };
  });
  out.sort(function (a, b) { return (a.status === 'in_progress' ? 0 : 1) - (b.status === 'in_progress' ? 0 : 1); });
  return { project: path.basename(project), tasks: out };
}

module.exports = {
  state: state, focusPanel: focusPanel, setLayout: setLayout, view: view, projects: projects, project: project,
  tasks: tasks, action: action, PANELS: PANELS, LAYOUTS: LAYOUTS, VIEWS: VIEWS,
  _summarize: summarize, _comboOf: comboOf, _projectOf: projectOf
};
