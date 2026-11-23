'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const mcp = require('./mcp');

const PANELS = ['terminal', 'git', 'browser', 'chat', 'tasks', 'files', 'team', 'notes', 'pr', 'deploy', 'debug', 'simulator'];
const LAYOUTS = ['default', 'debug', 'review', 'fullscreen'];
const VIEWS = { tabs: '1', agents: '2', focus: '3' };
const URGENCY = { question: 3, working: 2, completed: 1, idle: 0 };
const ALIAS = { 'git-diff': 'git', 'git-graph': 'git', todos: 'tasks' };
const UI_TIMEOUT = 8000;

const err = mcp.err;

function panelId(p) { const id = String(p).split(':')[0]; return ALIAS[id] || id; }
function norm(p) { return String(p || '').replace(/[\\/]+$/, '').toLowerCase(); }
function baseName(p) { return path.basename(String(p || '').replace(/[\\/]+$/, '')); }

function friendly(msg) {
  msg = String(msg || '');
  if (/is not open in this layout/i.test(msg)) return 'Questo pannello non è tra le schede aperte in Viber';
  if (/is hidden for this project/i.test(msg)) return 'Questo pannello è nascosto in Viber per questo progetto';
  if (/not running|restart/i.test(msg)) return 'Viber non è aperto su questo PC';
  return 'Viber: ' + msg;
}

function summarize(st) {
  const leaves = (st && st.layout && st.layout.leaves) || [];
  const open = {};
  let active = '';
  leaves.forEach(function (l) {
    (l.panels || []).forEach(function (p) { open[panelId(p)] = true; });
    if (!active && l.activePanel) active = panelId(l.activePanel);
  });
  const project = st && st.worktree ? st.worktree.path : '';
  return { project: project, name: project ? baseName(project) : '', active: active, open: Object.keys(open) };
}

function shownIn(msg) {
  const m = /\(showing: ([^)]+)\)/.exec(String(msg || ''));
  return m ? m[1].trim() : '';
}
function openIn(msg) {
  const m = /\(open projects: ([^)]+)\)/.exec(String(msg || ''));
  return m ? m[1].split(/,\s*/).map(function (s) { return s.trim(); }).filter(Boolean) : [];
}

function projectOf(dir, list) {
  const d = norm(dir);
  let best = null;
  list.forEach(function (p) {
    const n = norm(p);
    if ((d === n || d.indexOf(n) === 0) && (!best || n.length > norm(best).length)) best = p;
  });
  return best;
}

function settingsPath() {
  if (process.env.VIBER_SETTINGS_FILE) return process.env.VIBER_SETTINGS_FILE;
  const base = process.platform === 'win32' ? (process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
    : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support')
      : (process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'));
  return path.join(base, '@viber', 'desktop', 'app-settings.json');
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

function create(deps) {
  const platform = deps.platform;
  const keys = deps.keys;
  const log = deps.log || { info: function () { }, warn: function () { } };
  const agents = new mcp.Session({ args: ['--agents'] });
  const ui = {};
  let shown = '';

  function uiSession(cwd) {
    const key = norm(cwd);
    if (!ui[key]) ui[key] = new mcp.Session({ cwd: cwd });
    return ui[key];
  }

  async function online() {
    if (await mcp.reachable(1000)) return;
    throw err('Viber non è aperto su questo PC');
  }

  async function openProjects() {
    const r = await agents.call('viber_agent_projects', {}, UI_TIMEOUT);
    return { list: (r && Array.isArray(r.projects)) ? r.projects : [], machine: r && r.machine ? r.machine : '' };
  }

  async function onScreen(tool, args) {
    await online();
    const tried = {};
    let next = shown;
    if (!next) next = (await openProjects()).list[0] || '';
    for (let i = 0; i < 3 && next && !tried[norm(next)]; i++) {
      tried[norm(next)] = true;
      try {
        const r = await uiSession(next).call(tool, args, UI_TIMEOUT);
        shown = next;
        return { cwd: next, result: r };
      } catch (e) {
        if (e.code !== 'TOOL_ERROR') throw err(friendly(e.message));
        const moved = shownIn(e.message);
        if (moved) { next = moved; continue; }
        const others = openIn(e.message).filter(function (p) { return !tried[norm(p)]; });
        if (others.length) { next = others[0]; continue; }
        throw err(friendly(e.message));
      }
    }
    shown = '';
    throw err('Nessuna finestra di Viber mostra un progetto');
  }

  async function rawState() {
    return (await onScreen('viber_get_state', {})).result;
  }

  async function state() {
    try {
      return Object.assign({ online: true, panels: PANELS }, summarize(await rawState()));
    } catch (e) {
      return { online: false, message: e.message, panels: PANELS };
    }
  }

  async function bringFront() {
    try { await platform.focus('Viber'); } catch (e) { log.info('primo piano: ' + e.message); }
  }

  async function focusPanel(panel) {
    if (PANELS.indexOf(panel) < 0) throw err('Pannello non valido', 'BAD_REQUEST');
    await onScreen('viber_focus_panel', { panel: panel });
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
    await onScreen('viber_set_layout', body);
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

  async function projects() {
    await online();
    const open = await openProjects();
    const list = open.list;
    const rows = await agents.call('viber_agent_list', open.machine ? { machine: open.machine } : {}, UI_TIMEOUT).catch(function () { return []; });
    const mine = (Array.isArray(rows) ? rows : []).filter(function (a) { return !open.machine || !a.machine || a.machine === open.machine; });
    let current = null;
    try { current = projectOf(summarize(await rawState()).project, list); } catch (e) { current = null; }
    return {
      projects: list.map(function (p) {
        const its = mine.filter(function (a) { return projectOf(a.agent, list) === p; });
        let st = 'idle';
        its.forEach(function (a) { if ((URGENCY[a.state] || 0) > URGENCY[st]) st = a.state; });
        const top = its.filter(function (a) { return a.state === st; })[0];
        return { path: p, name: baseName(p), active: p === current, state: st, agents: its.length, title: top ? top.title || '' : '' };
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
    const paths = list.map(function (p) { return p.path; });
    let at = cur;
    for (let i = 0; i < steps; i++) {
      await platform.sendKeys(combo);
      const want = list[(at + (dir === 'next' ? 1 : list.length - 1)) % list.length].path;
      let now = null;
      for (let t = 0; t < 8 && now !== want; t++) {
        await new Promise(function (r) { setTimeout(r, 150); });
        try { now = projectOf(summarize(await rawState()).project, paths); } catch (e) { now = null; }
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
    const st = summarize(await rawState());
    if (!st.project) return { project: '', tasks: [] };
    let projectPath = st.project;
    try {
      const p = await agents.call('viber_task_projects', {}, UI_TIMEOUT);
      projectPath = projectOf(st.project, (p && p.projects) || []) || projectPath;
    } catch (e) { }
    const r = await agents.call('viber_task_list', { projectPath: projectPath, includeDone: false }, UI_TIMEOUT);
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
    return { project: baseName(projectPath), tasks: out };
  }

  function stop() {
    agents.stop();
    Object.keys(ui).forEach(function (k) { ui[k].stop(); delete ui[k]; });
    shown = '';
  }

  return {
    state: state, focusPanel: focusPanel, setLayout: setLayout, view: view, projects: projects, project: project,
    tasks: tasks, action: action, stop: stop, comboOf: comboOf
  };
}

module.exports = {
  create: create, PANELS: PANELS, LAYOUTS: LAYOUTS, VIEWS: VIEWS,
  summarize: summarize, projectOf: projectOf, shownIn: shownIn, openIn: openIn, friendly: friendly
};
