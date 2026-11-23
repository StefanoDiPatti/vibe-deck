'use strict';
const common = require('./common');

const SNAP_TTL = 800;
let snapCache = { at: 0, data: null, pending: null };
let runner = function (args, timeout) { return common.run('kdotool', args, { timeout: timeout || 6000 }); };

function err(msg, code) { return Object.assign(new Error(msg), { code: code || 'UNAVAILABLE' }); }

function isKde() {
  return /kde|plasma/i.test((process.env.XDG_CURRENT_DESKTOP || '') + ' ' + (process.env.DESKTOP_SESSION || '') + ' ' + (process.env.KDE_FULL_SESSION || ''));
}
let forced = null;
function available() { return forced !== null ? forced : isKde() && !!common.which('kdotool'); }
function why() {
  if (!isKde()) return 'Finestre e desktop virtuali su Linux per ora solo con KDE Plasma 6';
  return 'Per finestre e desktop virtuali installa kdotool 0.3 o più recente (Arch/CachyOS: paru -S kdotool)';
}

async function kwin(code, timeout) {
  if (!available()) throw err(why(), 'UNSUPPORTED');
  const r = await runner(['kwinscript', '--inline', code], timeout);
  const errLine = String(r.stderr || '').split(/\r?\n/).filter(function (l) { return /^ERROR:/.test(l); })[0];
  if (errLine) throw err('KWin: ' + errLine.replace(/^ERROR:\s*/, ''), 'ACTION_FAILED');
  if (!r.ok) {
    if (/unrecognized|invalid.*kwinscript|Unknown command/i.test(r.stderr + r.stdout)) throw err('kdotool troppo vecchio: serve la 0.3 o più recente (comando kwinscript)', 'UNSUPPORTED');
    throw err('kdotool: ' + String(r.stderr || r.error || 'errore').trim().split('\n')[0], 'ACTION_FAILED');
  }
  return String(r.stdout || '').split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
}

const SNAPSHOT = [
  'var cur = workspace.currentDesktop;',
  'var res = { current: cur ? String(cur.id) : "", desktops: [], screens: [], windows: [] };',
  'workspace.desktops.forEach(function (d) { res.desktops.push({ id: String(d.id), name: String(d.name || "") }); });',
  'workspace.screens.forEach(function (o) {',
  '  var g = o.geometry, a = workspace.clientArea(KWin.MaximizeArea, o, cur);',
  '  res.screens.push({ name: String(o.name), label: ((o.manufacturer || "") + " " + (o.model || "")).trim(),',
  '    x: g.x, y: g.y, w: g.width, h: g.height, wx: a.x, wy: a.y, ww: a.width, wh: a.height });',
  '});',
  'var act = workspace.activeWindow;',
  'var list = (workspace.stackingOrder || workspace.windowList()).slice().reverse();',
  'list.forEach(function (w) {',
  '  if (!w.normalWindow || w.skipTaskbar || w.deleted) return;',
  '  var f = w.frameGeometry, o = w.output, max = false;',
  '  if (o) { var m = workspace.clientArea(KWin.MaximizeArea, o, cur); max = f.x == m.x && f.y == m.y && f.width == m.width && f.height == m.height; }',
  '  res.windows.push({ id: String(w.internalId), pid: w.pid || 0, cls: String(w.resourceClass || w.resourceName || ""),',
  '    title: String(w.caption || ""), desks: w.onAllDesktops ? [] : w.desktops.map(function (d) { return String(d.id); }),',
  '    all: !!w.onAllDesktops, min: !!w.minimized, max: max, active: w === act, out: o ? String(o.name) : "",',
  '    x: f.x, y: f.y, w: f.width, h: f.height });',
  '});',
  'output_result(JSON.stringify(res));'
].join('\n');

function parseSnapshot(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim();
    if (l.charAt(0) !== '{') continue;
    try { return JSON.parse(l); } catch (e) { }
  }
  throw err('KWin non ha risposto con i dati delle finestre', 'ACTION_FAILED');
}

function snapshot(force) {
  if (!force && snapCache.data && Date.now() - snapCache.at < SNAP_TTL) return Promise.resolve(snapCache.data);
  if (snapCache.pending) return snapCache.pending;
  snapCache.pending = kwin(SNAPSHOT).then(function (lines) {
    const data = parseSnapshot(lines);
    snapCache = { at: Date.now(), data: data, pending: null };
    return data;
  }).catch(function (e) { snapCache.pending = null; throw e; });
  return snapCache.pending;
}
function invalidate() { snapCache = { at: 0, data: null, pending: null }; }

function monitorsFrom(s) {
  return s.screens.map(function (o, i) {
    return { id: o.name, primary: i === 0, x: o.x, y: o.y, w: o.w, h: o.h, work: { x: o.wx, y: o.wy, w: o.ww, h: o.wh }, name: o.label || o.name };
  });
}
function stateOf(w) { return w.min ? 'min' : w.max ? 'max' : 'normal'; }
function onDesk(w, desk) { return w.all || w.desks.indexOf(desk) >= 0; }

function windowsFrom(s) {
  return s.windows.filter(function (w) { return onDesk(w, s.current); }).map(function (w) {
    return { id: w.id, pid: w.pid, process: w.cls, state: stateOf(w), monitor: w.out, x: w.x, y: w.y, w: w.w, h: w.h, active: !!w.active, title: w.title };
  });
}
function deskWindowsFrom(s) {
  return s.windows.map(function (w) {
    return { id: w.id, desktop: w.all ? (s.desktops[0] ? s.desktops[0].id : '') : (w.desks[0] || ''), state: stateOf(w), monitor: w.out, x: w.x, y: w.y, w: w.w, h: w.h, process: w.cls, title: w.title, pid: w.pid };
  });
}

const J = JSON.stringify;
const FIND = 'function W(id) { return workspace.windowList().find(function (w) { return String(w.internalId) == id; }); }\n' +
  'function D(id) { return workspace.desktops.find(function (d) { return String(d.id) == id; }); }\n';

async function act(body) {
  const lines = await kwin(FIND + body);
  invalidate();
  return lines;
}

function needWindow(id) {
  return 'var w = W(' + J(String(id)) + '); if (!w) { output_error("finestra non trovata (chiusa?)"); } else {\n';
}

async function moveWindowToDesktop(id, desk) {
  const pick = desk
    ? 'var d = D(' + J(String(desk)) + '); if (!d) { output_error("desktop non trovato"); } else {'
    : 'workspace.createDesktop(workspace.desktops.length, ""); var d = workspace.desktops[workspace.desktops.length - 1]; {';
  const lines = await act(needWindow(id) + pick + ' w.desktops = [d]; output_result(String(d.id)); } }');
  return lines[lines.length - 1] || desk;
}

async function placeWindow(id, rect, max, focus) {
  await act(needWindow(id) +
    'w.minimized = false; w.setMaximize(false, false);' +
    'w.frameGeometry = { x: ' + Math.round(rect.x) + ', y: ' + Math.round(rect.y) + ', width: ' + Math.round(rect.w) + ', height: ' + Math.round(rect.h) + ' };' +
    (max ? 'w.setMaximize(true, true);' : '') +
    (focus ? 'workspace.activeWindow = w;' : '') +
    'output_result("ok"); }');
  return { moved: true };
}

const WIN_ACTIONS = {
  focus: 'w.minimized = false; workspace.activeWindow = w;',
  minimize: 'w.minimized = true;',
  maximize: 'w.minimized = false; w.setMaximize(true, true);',
  restore: 'w.minimized = false; w.setMaximize(false, false);'
};
async function windowAction(id, action) {
  if (!WIN_ACTIONS[action]) throw err('Azione non valida', 'BAD_REQUEST');
  await act(needWindow(id) + WIN_ACTIONS[action] + ' output_result("ok"); }');
  return { done: true };
}

async function virtualDesktops() {
  const s = await snapshot(true);
  return { desktops: s.desktops, current: s.current };
}
async function switchDesktop(desk) {
  await act('var d = D(' + J(String(desk)) + '); if (!d) { output_error("desktop non trovato"); } else { workspace.currentDesktop = d; output_result("ok"); }');
}
async function createDesktop() {
  await act('workspace.createDesktop(workspace.desktops.length, ""); workspace.currentDesktop = workspace.desktops[workspace.desktops.length - 1]; output_result("ok");');
}
async function removeDesktop(desk) {
  await act('var d = D(' + J(String(desk)) + '); if (!d) { output_error("desktop non trovato"); } else if (workspace.desktops.length < 2) { output_error("c\'e\' un solo desktop"); } else { workspace.removeDesktop(d); output_result("ok"); }');
}

module.exports = {
  available: available, why: why, isKde: isKde,
  snapshot: snapshot,
  monitors: function () { return snapshot().then(monitorsFrom); },
  windowList: function () { return snapshot().then(windowsFrom); },
  deskWindows: function () { return snapshot().then(deskWindowsFrom); },
  moveWindowToDesktop: moveWindowToDesktop, placeWindow: placeWindow, windowAction: windowAction,
  virtualDesktops: virtualDesktops, switchDesktop: switchDesktop, createDesktop: createDesktop, removeDesktop: removeDesktop,
  _setRunner: function (fn) { runner = fn; forced = fn ? true : null; invalidate(); },
  _parseSnapshot: parseSnapshot, _monitorsFrom: monitorsFrom, _windowsFrom: windowsFrom, _deskWindowsFrom: deskWindowsFrom
};
