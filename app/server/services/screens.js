const fs = require('fs');
const path = require('path');
const paths = require('../paths');
const platform = require('../platform');
const log = require('../log');

const FILE = path.join(paths.DATA_DIR, 'screens.json');
const T = 1 / 3;

const LAYOUTS = [
  { id: 'full', name: 'Intero', zones: [[0, 0, 1, 1]] },
  { id: 'half', name: 'Metà', zones: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] },
  { id: 'wide_left', name: '2/3 + 1/3', zones: [[0, 0, 2 * T, 1], [2 * T, 0, T, 1]] },
  { id: 'wide_right', name: '1/3 + 2/3', zones: [[0, 0, T, 1], [T, 0, 2 * T, 1]] },
  { id: 'thirds', name: 'Terzi', zones: [[0, 0, T, 1], [T, 0, T, 1], [2 * T, 0, T, 1]] },
  { id: 'center', name: '¼ ½ ¼', zones: [[0, 0, 0.25, 1], [0.25, 0, 0.5, 1], [0.75, 0, 0.25, 1]] },
  { id: 'main_side', name: 'Metà + 2', zones: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
  { id: 'quarters', name: 'Quarti', zones: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] }
];

let settings = null;
let monCache = { at: 0, list: null, pending: null };

function supported() { return typeof platform.monitors === 'function'; }
function unsupported() {
  return Object.assign(new Error('Gestione schermi disponibile su Windows e su Linux con KDE Plasma'), { code: 'UNSUPPORTED' });
}

function load() {
  if (settings) return settings;
  try { settings = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { settings = {}; }
  return settings;
}
function save(patch) {
  settings = Object.assign({}, load(), patch);
  if (!fs.existsSync(paths.DATA_DIR)) fs.mkdirSync(paths.DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(settings, null, 2));
  fs.renameSync(FILE + '.tmp', FILE);
}

function monitors(force) {
  if (!supported()) return Promise.reject(unsupported());
  if (!force && monCache.list && Date.now() - monCache.at < 15000) return Promise.resolve(monCache.list);
  if (monCache.pending) return monCache.pending;
  monCache.pending = platform.monitors().then(function (list) {
    list.sort(function (a, b) { return (a.x - b.x) || (a.y - b.y); });
    list.forEach(function (m, i) {
      m.n = i + 1;
      m.portrait = m.h > m.w;
    });
    monCache = { at: Date.now(), list: list, pending: null };
    return list;
  }).catch(function (e) { monCache.pending = null; throw e; });
  return monCache.pending;
}

function zonesFor(layout, mon) {
  return layout.zones.map(function (z) { return mon && mon.portrait ? [z[1], z[0], z[3], z[2]] : z.slice(); });
}

function zoneRect(mon, z) {
  const a = mon.work;
  const x = Math.round(a.x + z[0] * a.w), y = Math.round(a.y + z[1] * a.h);
  return { x: x, y: y, w: Math.round(a.x + (z[0] + z[2]) * a.w) - x, h: Math.round(a.y + (z[1] + z[3]) * a.h) - y };
}

function target() {
  const t = load().target;
  return typeof t === 'string' && t ? t : null;
}

async function info() {
  const list = await monitors();
  const t = target();
  return {
    monitors: list,
    target: list.some(function (m) { return m.id === t; }) ? t : null,
    layouts: LAYOUTS.map(function (l) { return { id: l.id, name: l.name, zones: l.zones }; })
  };
}

async function setTarget(id) {
  if (id === null || id === undefined || id === '') { save({ target: null }); return info(); }
  const list = await monitors(true);
  if (!list.some(function (m) { return m.id === id; })) throw Object.assign(new Error('Monitor non trovato'), { code: 'BAD_REQUEST' });
  save({ target: String(id) });
  log.info('screens', 'le app dal tablet si aprono su ' + id);
  return info();
}

async function windows() {
  if (!supported()) throw unsupported();
  const list = await platform.windowList();
  return list.filter(function (w) { return w.pid !== process.pid; });
}

async function findWindow(id) {
  const list = await windows();
  const w = list.filter(function (x) { return x.id === String(id); })[0];
  if (!w) throw Object.assign(new Error('Finestra non trovata (è stata chiusa?)'), { code: 'NOT_FOUND' });
  return w;
}

async function place(windowId, monitorId, layoutId, zone, focus) {
  const w = await findWindow(windowId);
  const list = await monitors();
  const mon = list.filter(function (m) { return m.id === monitorId; })[0];
  if (!mon) throw Object.assign(new Error('Monitor non trovato'), { code: 'BAD_REQUEST' });
  const layout = LAYOUTS.filter(function (l) { return l.id === layoutId; })[0];
  if (!layout) throw Object.assign(new Error('Disposizione non valida'), { code: 'BAD_REQUEST' });
  const zones = zonesFor(layout, mon);
  const z = zones[parseInt(zone, 10)];
  if (!z) throw Object.assign(new Error('Zona non valida'), { code: 'BAD_REQUEST' });
  await platform.placeWindow(w.id, zoneRect(mon, z), layout.id === 'full', focus !== false);
  return { placed: w.title };
}

const ACTIONS = { focus: 1, minimize: 1, maximize: 1, restore: 1 };
async function act(windowId, action) {
  if (!ACTIONS[action]) throw Object.assign(new Error('Azione non valida'), { code: 'BAD_REQUEST' });
  const w = await findWindow(windowId);
  await platform.windowAction(w.id, action);
  return { done: true };
}

async function moveToMonitor(w, mon) {
  const list = await monitors();
  const from = list.filter(function (m) { return m.id === w.monitor; })[0];
  if (!from || from.id === mon.id) return false;
  const a = from.work, b = mon.work;
  const ww = Math.min(w.w, b.w), hh = Math.min(w.h, b.h);
  const fx = a.w > w.w ? (w.x - a.x) / (a.w - w.w) : 0.5;
  const fy = a.h > w.h ? (w.y - a.y) / (a.h - w.h) : 0.5;
  const clamp = function (v) { return Math.max(0, Math.min(1, v)); };
  const rect = { x: b.x + clamp(fx) * (b.w - ww), y: b.y + clamp(fy) * (b.h - hh), w: ww, h: hh };
  if (w.state === 'max') rect.x = b.x + (b.w - ww) / 2, rect.y = b.y + (b.h - hh) / 2;
  await platform.placeWindow(w.id, rect, w.state === 'max', false);
  return true;
}

async function moveWindowToMonitor(windowId, monitorId) {
  if (!supported()) throw unsupported();
  const w = await findWindow(windowId);
  const mon = (await monitors()).filter(function (m) { return m.id === String(monitorId); })[0];
  if (!mon) throw Object.assign(new Error('Monitor non trovato'), { code: 'BAD_REQUEST' });
  const moved = await moveToMonitor(w, mon);
  return { moved: moved, title: w.title, monitor: mon.n };
}

function followLaunch(processes) {
  const t = target();
  if (!t || !supported()) return null;
  const names = (processes || []).map(function (p) { return String(p).toLowerCase(); }).filter(Boolean);
  const before = windows().then(function (l) {
    const ids = {};
    l.forEach(function (w) { ids[w.id] = true; });
    return ids;
  }).catch(function () { return null; });
  return function start() {
    before.then(async function (known) {
      if (!known) return;
      const mon = (await monitors()).filter(function (m) { return m.id === t; })[0];
      if (!mon) return;
      const until = Date.now() + 45000;
      let found = null;
      while (!found && Date.now() < until) {
        await new Promise(function (r) { setTimeout(r, 700); });
        const list = await windows().catch(function () { return []; });
        const fresh = list.filter(function (w) { return !known[w.id] && w.state !== 'min'; });
        found = fresh.filter(function (w) { return names.indexOf(w.process) >= 0; })[0] ||
          (Date.now() > until - 40000 ? fresh.filter(function (w) { return w.active; })[0] : null);
      }
      if (!found) return;
      await new Promise(function (r) { setTimeout(r, 400); });
      const now = (await windows().catch(function () { return []; })).filter(function (w) { return w.id === found.id; })[0];
      if (now && await moveToMonitor(now, mon)) log.info('screens', '"' + now.title + '" spostata sul monitor ' + mon.n);
    }).catch(function (e) { log.debug('screens', 'spostamento: ' + e.message); });
  };
}

module.exports = {
  LAYOUTS: LAYOUTS,
  info: info,
  monitors: monitors,
  windows: windows,
  setTarget: setTarget,
  place: place,
  act: act,
  moveWindowToMonitor: moveWindowToMonitor,
  followLaunch: followLaunch,
  _zonesFor: zonesFor,
  _zoneRect: zoneRect
};
