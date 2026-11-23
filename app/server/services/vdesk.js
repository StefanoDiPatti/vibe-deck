'use strict';
const { execFile } = require('child_process');
const platform = require('../platform');
const log = require('../log');

const KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VirtualDesktops';
const SESSION_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\SessionInfo';
const MAX = 3;

function isLinux() { return platform.name === 'linux' && typeof platform.virtualDesktops === 'function'; }
function supported() { return process.platform === 'win32' || isLinux(); }
function note() { return isLinux() && typeof platform.screensNote === 'function' ? platform.screensNote() : ''; }
function same(a, b) { return String(a || '').toUpperCase() === String(b || '').toUpperCase(); }

function err(msg, code) { return Object.assign(new Error(msg), { code: code || 'BAD_REQUEST' }); }

function regQuery(key) {
  return new Promise(function (resolve) {
    execFile('reg', ['query', key, '/s'], { windowsHide: true, timeout: 5000 }, function (e, out) {
      resolve(e ? '' : String(out || ''));
    });
  });
}

function guidFromHex(hex) {
  const h = String(hex || '').toUpperCase();
  if (!/^[0-9A-F]{32}$/.test(h)) return '';
  function rev(s) { return s.match(/../g).reverse().join(''); }
  return rev(h.slice(0, 8)) + '-' + rev(h.slice(8, 12)) + '-' + rev(h.slice(12, 16)) + '-' + h.slice(16, 20) + '-' + h.slice(20, 32);
}

function binValue(text, name) {
  const m = new RegExp('^\\s+' + name + '\\s+REG_BINARY\\s+([0-9A-Fa-f]*)\\s*$', 'm').exec(text);
  return m ? m[1] : null;
}

function parse(text, sessionText) {
  const ids = [];
  const raw = binValue(text, 'VirtualDesktopIDs');
  if (raw) for (let i = 0; i + 32 <= raw.length; i += 32) ids.push(guidFromHex(raw.slice(i, i + 32)));
  const names = {};
  const re = /\\Desktops\\\{([0-9A-Fa-f-]{36})\}\r?\n((?:[ \t]+\S.*\r?\n?)*)/g;
  let m;
  while ((m = re.exec(text))) {
    const n = /^\s+Name\s+REG_SZ\s+(.*?)\s*$/m.exec(m[2]);
    if (n && n[1]) names[m[1].toUpperCase()] = n[1];
  }
  let cur = binValue(text, 'CurrentVirtualDesktop');
  if (!cur && sessionText) cur = binValue(sessionText, 'CurrentVirtualDesktop');
  return build(ids, cur ? guidFromHex(cur) : '', names);
}

function fromHelper(r) {
  const ids = [];
  const raw = String((r && r.ids) || '');
  for (let i = 0; i + 32 <= raw.length; i += 32) ids.push(guidFromHex(raw.slice(i, i + 32)));
  const names = {};
  Object.keys((r && r.names) || {}).forEach(function (k) { names[k.toUpperCase()] = r.names[k]; });
  return build(ids, r && r.cur ? guidFromHex(r.cur) : '', names);
}

function build(ids, current, names) {
  if (!ids.length) return [{ id: current || 'unico', n: 1, name: 'Desktop 1', current: true }];
  let found = false;
  const list = ids.map(function (id, i) {
    const on = id === current;
    if (on) found = true;
    return { id: id, n: i + 1, name: names[id] || 'Desktop ' + (i + 1), current: on };
  });
  if (!found) list[0].current = true;
  return list;
}

async function read() {
  if (isLinux()) {
    const r = await platform.virtualDesktops();
    const list = r.desktops.map(function (d, i) { return { id: d.id, n: i + 1, name: d.name || 'Desktop ' + (i + 1), current: same(d.id, r.current) }; });
    if (list.length && !list.some(function (d) { return d.current; })) list[0].current = true;
    return list;
  }
  if (typeof platform.virtualDesktopsReg === 'function') {
    try { return fromHelper(await platform.virtualDesktopsReg()); } catch (e) { log.debug('vdesk', 'helper: ' + e.message); }
  }
  const text = await regQuery(KEY);
  const sess = binValue(text, 'CurrentVirtualDesktop') ? '' : await regQuery(SESSION_KEY);
  return parse(text, sess);
}

function currentIndex(list) {
  for (let i = 0; i < list.length; i++) if (list[i].current) return i;
  return 0;
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function waitFor(test, ms) {
  const end = Date.now() + (ms || 2000);
  let list = await read();
  while (!test(list) && Date.now() < end) { await sleep(120); list = await read(); }
  return list;
}

async function preview(desktops) {
  const out = { supported: true, max: MAX, desktops: desktops, monitors: [] };
  try {
    const screens = require('./screens');
    out.monitors = (await screens.monitors()).map(function (m) { return { id: m.id, n: m.n, x: m.x, y: m.y, w: m.w, h: m.h }; });
  } catch (e) { log.debug('vdesk', 'monitor: ' + e.message); }
  let wins = [];
  if (typeof platform.deskWindows === 'function') {
    try { wins = await platform.deskWindows(); } catch (e) { log.debug('vdesk', 'finestre: ' + e.message); }
  }
  const by = {};
  desktops.forEach(function (d) { d.windows = []; by[String(d.id).toUpperCase()] = d; });
  wins.forEach(function (w) {
    const d = by[String(w.desktop || '').toUpperCase()];
    if (!d || w.pid === process.pid) return;
    d.windows.push({ title: w.title, process: w.process, state: w.state, x: w.x, y: w.y, w: w.w, h: w.h });
  });
  return out;
}

async function list() {
  if (!supported()) return { supported: false, desktops: [], monitors: [] };
  const why = note();
  if (why) return { supported: false, message: why, desktops: [], monitors: [] };
  return preview(await read());
}

async function linuxAction(act, desktops, idx) {
  if (act === 'switch') {
    if (idx < 0) throw err('Desktop non trovato (è stato chiuso?)', 'NOT_FOUND');
    if (!desktops[idx].current) await platform.switchDesktop(desktops[idx].id);
  } else if (act === 'create') {
    if (desktops.length >= MAX) throw err('Hai già ' + MAX + ' desktop');
    await platform.createDesktop();
  } else if (act === 'delete') {
    if (idx < 0) throw err('Desktop non trovato (è stato chiuso?)', 'NOT_FOUND');
    if (desktops.length < 2) throw err('C\'è un solo desktop: non si può chiudere');
    await platform.removeDesktop(desktops[idx].id);
  } else {
    throw err('Azione non valida');
  }
  return preview(await read());
}

async function go(list, index) {
  let cur = currentIndex(list);
  const diff = index - cur;
  const key = diff > 0 ? 'RIGHT' : 'LEFT';
  for (let i = 0; i < Math.abs(diff); i++) {
    await platform.sendKeys(['WIN', 'CTRL', key]);
    await sleep(160);
  }
  const want = list[index].id;
  return waitFor(function (l) { return l[currentIndex(l)].id === want; });
}

async function action(act, id) {
  if (!supported() || note()) throw err(note() || 'I desktop virtuali si gestiscono su Windows e su Linux con KDE Plasma', 'UNSUPPORTED');
  let desktops = await read();
  let idx = currentIndex(desktops);
  if (id) { idx = -1; desktops.forEach(function (d, i) { if (same(d.id, id)) idx = i; }); }
  if (isLinux()) return linuxAction(act, desktops, idx);
  if (act === 'switch') {
    if (idx < 0) throw err('Desktop non trovato (è stato chiuso?)', 'NOT_FOUND');
    if (!desktops[idx].current) desktops = await go(desktops, idx);
  } else if (act === 'create') {
    if (desktops.length >= MAX) throw err('Hai già ' + MAX + ' desktop');
    const before = desktops.length;
    await platform.sendKeys(['WIN', 'CTRL', 'D']);
    desktops = await waitFor(function (l) { return l.length > before; });
    log.info('vdesk', 'nuovo desktop virtuale (' + desktops.length + ')');
  } else if (act === 'delete') {
    if (idx < 0) throw err('Desktop non trovato (è stato chiuso?)', 'NOT_FOUND');
    if (desktops.length < 2) throw err('C\'è un solo desktop: non si può chiudere');
    const gone = desktops[idx].id, before = desktops.length;
    if (!desktops[idx].current) {
      desktops = await go(desktops, idx);
      if (desktops[currentIndex(desktops)].id !== gone) throw err('Non sono riuscito ad aprire quel desktop per chiuderlo');
    }
    await platform.sendKeys(['WIN', 'CTRL', 'F4']);
    desktops = await waitFor(function (l) { return l.length < before; });
    log.info('vdesk', 'desktop virtuale chiuso (ne restano ' + desktops.length + ')');
  } else {
    throw err('Azione non valida');
  }
  return preview(desktops);
}

async function moveWindow(windowId, desktop) {
  if (!supported() || note() || typeof platform.moveWindowToDesktop !== 'function') throw err(note() || 'Spostare finestre tra desktop si può su Windows e su Linux con KDE Plasma', 'UNSUPPORTED');
  const wins = typeof platform.deskWindows === 'function' ? await platform.deskWindows() : [];
  const w = wins.filter(function (x) { return x.id === String(windowId); })[0];
  if (!w) throw err('Finestra non trovata (è stata chiusa?)', 'NOT_FOUND');
  let desktops = await read();
  const isNew = desktop === 'new';
  let target = null;
  if (!isNew) {
    target = desktops.filter(function (d) { return same(d.id, desktop); })[0];
    if (!target) throw err('Desktop non trovato (è stato chiuso?)', 'NOT_FOUND');
    if (same(w.desktop, target.id)) return Object.assign(await preview(desktops), { moved: false, title: w.title, desktopName: target.name });
  } else if (desktops.length >= MAX) {
    throw err('Hai già ' + MAX + ' desktop');
  }
  const before = desktops.length;
  const to = String(await platform.moveWindowToDesktop(w.id, isNew ? '' : target.id));
  desktops = isNew ? await waitFor(function (l) { return l.length > before; }) : await read();
  const dest = desktops.filter(function (d) { return same(d.id, to); })[0];
  log.info('vdesk', '"' + w.title + '" spostata su ' + (dest ? dest.name : to));
  return Object.assign(await preview(desktops), { moved: true, title: w.title, desktopName: dest ? dest.name : 'un desktop nuovo' });
}

module.exports = { list: list, action: action, moveWindow: moveWindow, _parse: parse, _fromHelper: fromHelper, _guidFromHex: guidFromHex };
