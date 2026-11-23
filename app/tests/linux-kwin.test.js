'use strict';
const test = require('node:test');
const assert = require('node:assert');
const kwin = require('../server/platform/linux-kwin');

const SNAP = {
  current: 'd1',
  desktops: [{ id: 'd1', name: 'Desktop 1' }, { id: 'd2', name: 'Lavoro' }],
  screens: [{ name: 'DP-1', label: 'Dell U2720Q', x: 0, y: 0, w: 2560, h: 1440, wx: 0, wy: 0, ww: 2560, wh: 1396 }],
  windows: [
    { id: '{aaa}', pid: 10, cls: 'firefox', title: 'Firefox', desks: ['d1'], all: false, min: false, max: true, active: true, out: 'DP-1', x: 0, y: 0, w: 2560, h: 1396 },
    { id: '{bbb}', pid: 11, cls: 'konsole', title: 'Konsole', desks: ['d2'], all: false, min: true, max: false, active: false, out: 'DP-1', x: 10, y: 10, w: 800, h: 600 },
    { id: '{ccc}', pid: 12, cls: 'yakuake', title: 'Ovunque', desks: [], all: true, min: false, max: false, active: false, out: 'DP-1', x: 0, y: 0, w: 100, h: 100 }
  ]
};

function fake(t, reply) {
  const calls = [];
  kwin._setRunner(function (args) {
    calls.push(args);
    return Promise.resolve(Object.assign({ ok: true, stdout: '', stderr: '' }, reply(args[2])));
  });
  t.after(function () { kwin._setRunner(null); });
  return calls;
}

test('KWin: lettura di finestre, monitor e desktop negli stessi formati di Windows', async function (t) {
  const calls = fake(t, function () { return { stdout: 'altra riga\n' + JSON.stringify(SNAP) + '\n' }; });
  const mons = await kwin.monitors();
  assert.deepStrictEqual(mons[0], { id: 'DP-1', primary: true, x: 0, y: 0, w: 2560, h: 1440, work: { x: 0, y: 0, w: 2560, h: 1396 }, name: 'Dell U2720Q' });
  const wins = await kwin.windowList();
  assert.deepStrictEqual(wins.map(function (w) { return w.title + ':' + w.state; }), ['Firefox:max', 'Ovunque:normal']);
  const all = await kwin.deskWindows();
  assert.deepStrictEqual(all.map(function (w) { return w.title + '@' + w.desktop; }), ['Firefox@d1', 'Konsole@d2', 'Ovunque@d1']);
  assert.strictEqual(calls.length, 1, 'una sola chiamata a KWin per giro (cache)');
  assert.deepStrictEqual(calls[0].slice(0, 2), ['kwinscript', '--inline']);
  assert.ok(/workspace\.windowList|stackingOrder/.test(calls[0][2]));
});

test('KWin: spostare una finestra su un desktop (o su uno nuovo) manda lo script giusto', async function (t) {
  const calls = fake(t, function (code) { return { stdout: /createDesktop/.test(code) ? 'd3\n' : 'd2\n' }; });
  assert.strictEqual(await kwin.moveWindowToDesktop('{bbb}', 'd2'), 'd2');
  assert.ok(calls[0][2].indexOf('W("{bbb}")') >= 0 && calls[0][2].indexOf('D("d2")') >= 0 && /w\.desktops = \[d\]/.test(calls[0][2]));
  assert.strictEqual(await kwin.moveWindowToDesktop('{bbb}', ''), 'd3');
  assert.ok(/workspace\.createDesktop/.test(calls[1][2]) && !/currentDesktop =/.test(calls[1][2]), 'desktop nuovo senza passarci');
});

test('KWin: gli id vanno nello script come stringhe JSON (niente codice iniettato)', async function (t) {
  const calls = fake(t, function () { return { stdout: 'ok\n' }; });
  await kwin.switchDesktop('x"); workspace.removeDesktop(workspace.currentDesktop); ("');
  assert.ok(calls[0][2].indexOf('D("x\\"); workspace.removeDesktop(workspace.currentDesktop); (\\"")') >= 0);
});

test('KWin: errori di KWin e kdotool vecchio diventano messaggi chiari', async function (t) {
  fake(t, function () { return { stdout: '', stderr: 'ERROR: finestra non trovata (chiusa?)\n' }; });
  await assert.rejects(kwin.windowAction('{zzz}', 'focus'), /KWin: finestra non trovata/);
  kwin._setRunner(function () { return Promise.resolve({ ok: false, stdout: '', stderr: "error: unrecognized subcommand 'kwinscript'" }); });
  await assert.rejects(kwin.windowList(), /kdotool troppo vecchio/);
  await assert.rejects(kwin.windowAction('{a}', 'vola'), /Azione non valida/);
});

test('Desktop virtuali in modalità Linux: elenco, passa, crea, chiudi e trascina una finestra', async function (t) {
  const platform = require('../server/platform');
  const vdesk = require('../server/services/vdesk');
  const keys = ['name', 'monitors', 'virtualDesktops', 'deskWindows', 'switchDesktop', 'createDesktop', 'removeDesktop', 'moveWindowToDesktop', 'screensNote'];
  const saved = {};
  keys.forEach(function (k) { saved[k] = platform[k]; });
  t.after(function () { keys.forEach(function (k) { platform[k] = saved[k]; }); });
  let desks = [{ id: 'd1', name: 'Desktop 1' }, { id: 'd2', name: '' }], cur = 'd1';
  const wins = [{ id: '{w1}', desktop: 'd1', title: 'Firefox', process: 'firefox', state: 'normal', pid: 1 }];
  const log = [];
  Object.assign(platform, {
    name: 'linux',
    screensNote: function () { return ''; },
    monitors: function () { return Promise.resolve([]); },
    virtualDesktops: function () { return Promise.resolve({ desktops: desks.slice(), current: cur }); },
    deskWindows: function () { return Promise.resolve(wins); },
    switchDesktop: function (id) { log.push('switch ' + id); cur = id; return Promise.resolve(); },
    createDesktop: function () { log.push('create'); desks.push({ id: 'd3', name: '' }); cur = 'd3'; return Promise.resolve(); },
    removeDesktop: function (id) { log.push('remove ' + id); desks = desks.filter(function (d) { return d.id !== id; }); return Promise.resolve(); },
    moveWindowToDesktop: function (id, d) { log.push('move ' + id + ' ' + (d || 'nuovo')); wins[0].desktop = d || 'd9'; if (!d) desks.push({ id: 'd9', name: '' }); return Promise.resolve(d || 'd9'); }
  });
  const l = await vdesk.list();
  assert.deepStrictEqual(l.desktops.map(function (d) { return d.n + ' ' + d.name + (d.current ? ' *' : '') + ' ' + d.windows.length; }), ['1 Desktop 1 * 1', '2 Desktop 2 0']);
  await vdesk.action('switch', 'd2');
  await vdesk.action('create');
  await vdesk.action('delete', 'd3');
  const r = await vdesk.moveWindow('{w1}', 'd2');
  assert.strictEqual(r.moved, true);
  assert.strictEqual(r.desktopName, 'Desktop 2');
  const n = await vdesk.moveWindow('{w1}', 'new');
  assert.strictEqual(n.moved, true);
  assert.deepStrictEqual(log, ['switch d2', 'create', 'remove d3', 'move {w1} d2', 'move {w1} nuovo']);
  platform.screensNote = function () { return 'installa kdotool'; };
  assert.deepStrictEqual(await vdesk.list(), { supported: false, message: 'installa kdotool', desktops: [], monitors: [] });
  await assert.rejects(vdesk.moveWindow('{w1}', 'd1'), /installa kdotool/);
});
