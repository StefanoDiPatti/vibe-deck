const path = require('path');
const config = require('../config');
const platform = require('../platform');
const bridge = require('./bridge');
const log = require('../log');
const forPlatform = require('../platform/common').forPlatform;

let cache = { at: 0, data: null, pending: null };

function processNames(a) {
  if (Array.isArray(a.process)) return a.process.map(function (p) { return String(p).toLowerCase(); });
  if (a.process) return [String(a.process).toLowerCase()];
  const file = Array.isArray(a.path) ? a.path[0] : a.path;
  return [path.basename(String(file || '')).replace(/\.(exe|lnk|cmd|bat)$/i, '').toLowerCase()];
}

function trackedApps() {
  const apps = config.apps();
  const out = {};
  Object.keys(apps).forEach(function (id) {
    const a = forPlatform(apps[id]);
    if (!a || !(a.toggle || a.whenRunning)) return;
    out[id] = {
      id: id,
      label: a.label || id,
      toggle: !!a.toggle,
      whenRunning: a.whenRunning || null,
      bridge: a.bridge || null,
      processes: processNames(a),
      title: a.title || ''
    };
  });
  return out;
}

function matches(app, w) {
  if (app.processes.indexOf(w.process) < 0) return false;
  if (!app.title) return true;
  try { return new RegExp(app.title, 'i').test(w.title); } catch (e) { return false; }
}

async function compute() {
  const apps = trackedApps();
  const ids = Object.keys(apps);
  if (!ids.length) return {};
  const needWindows = ids.some(function (id) { return !apps[id].bridge; });
  const windows = needWindows ? await platform.windows().catch(function (e) {
    log.debug('apps', 'elenco finestre: ' + e.message);
    return [];
  }) : [];
  const out = {};
  ids.forEach(function (id) {
    const a = apps[id];
    out[id] = a.bridge ? bridge.hasSite(a.bridge) : windows.some(function (w) { return matches(a, w); });
  });
  return out;
}

function running() {
  if (cache.data && Date.now() - cache.at < 2500) return Promise.resolve(cache.data);
  if (cache.pending) return cache.pending;
  cache.pending = compute().then(function (d) {
    cache = { at: Date.now(), data: d, pending: null };
    return d;
  }).catch(function () {
    cache.pending = null;
    return cache.data || {};
  });
  return cache.pending;
}

function invalidate() { cache.at = 0; }

async function closeIfRunning(id) {
  const app = trackedApps()[id];
  if (!app || !app.toggle) return false;
  invalidate();
  const state = await running();
  if (!state[id]) return false;
  if (app.bridge) {
    bridge.sendSite(app.bridge, { type: 'close_tab' });
  } else {
    let n = 0;
    for (let i = 0; i < app.processes.length; i++) n += await platform.closeWindows(app.processes[i], app.title);
    if (!n) return false;
  }
  invalidate();
  return true;
}

async function focusIfRunning(id) {
  const app = trackedApps()[id];
  if (!app || app.whenRunning !== 'focus' || app.bridge) return false;
  invalidate();
  const windows = await platform.windows().catch(function () { return []; });
  const w = windows.filter(function (x) { return matches(app, x); })[0];
  if (!w) return false;
  await platform.focus(w.process);
  return true;
}

module.exports = {
  running: running,
  closeIfRunning: closeIfRunning,
  focusIfRunning: focusIfRunning,
  invalidate: invalidate,
  trackedApps: trackedApps,
  processNames: processNames
};
