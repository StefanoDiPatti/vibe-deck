const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../server/config');
const common = require('../server/platform/common');

const DEFAULTS = path.join(__dirname, '..', 'config', 'defaults');
function readDefault(name) { return config.parseJson(fs.readFileSync(path.join(DEFAULTS, name + '.json'), 'utf8')); }
function page(d, id) { return d.pages.filter(function (p) { return p.id === id; })[0]; }
function labels(p) { return (p.allTiles || p.tiles).map(function (t) { return t.label; }); }

const RAW = {
  pages: [
    { id: 'apps', autoGrid: true, tiles: [
      { id: 'a', label: 'A' },
      { id: 'term', label: 'POWERSHELL', linux: { label: 'TERMINALE' }, action: { type: 'launch', app: 'powershell' } },
      { id: 'lin', label: 'SOLO LINUX', os: 'linux' },
      { id: 'win', label: 'SOLO WINDOWS', os: ['windows'] },
      { id: 'b', label: 'B' }
    ] },
    { id: 'screens', os: 'windows', tiles: [{ widget: 'screens' }] },
    { id: 'home', linux: { description: 'linux' }, description: 'windows', tiles: [{ widget: 'clock' }] }
  ]
};

test('pulsanti e pagine diversi per Windows e Linux', function () {
  const lin = config.normalizeDock(RAW, {}, 'linux');
  const win = config.normalizeDock(RAW, {}, 'windows');
  assert.deepStrictEqual(labels(page(lin, 'apps')), ['A', 'TERMINALE', 'SOLO LINUX', 'B']);
  assert.deepStrictEqual(labels(page(win, 'apps')), ['A', 'POWERSHELL', 'SOLO WINDOWS', 'B']);
  assert.ok(!page(lin, 'screens') && page(win, 'screens'));
  assert.strictEqual(page(lin, 'home').description, 'linux');
  assert.strictEqual(page(win, 'home').description, 'windows');
  const t = page(lin, 'apps').tiles[1];
  assert.strictEqual(t.linux, undefined);
  assert.strictEqual(t.os, undefined);
});

test('pulsanti scelti dal pannello: ordine, nascosti e nuovi in fondo', function () {
  const layout = { tiles: { apps: { show: ['b', 'a', 'nonesiste', 'b'], hide: ['term'] } } };
  const d = config.normalizeDock(RAW, layout, 'linux');
  const p = page(d, 'apps');
  assert.deepStrictEqual(p.tiles.map(function (x) { return x.id; }), ['b', 'a', 'lin']);
  assert.strictEqual(p.allTiles.length, 4);
  assert.strictEqual(p.editable, true);
  assert.deepStrictEqual([p.columns, p.rows], [3, 1]);
});

test('le pagine con widget non si modificano dal pannello', function () {
  const d = config.normalizeDock(RAW, { tiles: { home: { show: [] } } }, 'linux');
  assert.strictEqual(page(d, 'home').editable, false);
  assert.strictEqual(page(d, 'home').tiles.length, 1);
});

test('griglia automatica: niente buchi inutili, forma da tablet', function () {
  const n = function (k) { const a = []; for (let i = 0; i < k; i++) a.push({ w: 1, h: 1 }); return config.autoGrid(a); };
  assert.deepStrictEqual(n(18), { columns: 6, rows: 3 });
  assert.deepStrictEqual(n(17), { columns: 6, rows: 3 });
  assert.deepStrictEqual(n(12), { columns: 4, rows: 3 });
  assert.deepStrictEqual(n(8), { columns: 4, rows: 2 });
  assert.deepStrictEqual(n(3), { columns: 3, rows: 1 });
  assert.deepStrictEqual(n(1), { columns: 1, rows: 1 });
  const big = n(60);
  assert.ok(big.columns <= 8 && big.rows <= 6);
  assert.ok(config.autoGrid([{ w: 3, h: 1 }, { w: 1, h: 1 }]).columns >= 3);
});

test('pagina APP di default: CLAUDE unico, Viber su entrambi, terminale su Linux', function () {
  const raw = config.defaultDock();
  const lin = page(config.normalizeDock(raw, {}, 'linux'), 'apps');
  const win = page(config.normalizeDock(raw, {}, 'windows'), 'apps');
  [lin, win].forEach(function (p) {
    const l = labels(p);
    assert.strictEqual(l.filter(function (x) { return /CLAUDE/.test(x); }).length, 1, 'un solo pulsante Claude');
    assert.ok(l.indexOf('CLAUDE CODE') < 0);
    p.allTiles.forEach(function (t) { assert.ok(!/^apps-\d+$/.test(t.id), t.label + ' senza id'); });
  });
  const ll = labels(lin);
  assert.strictEqual(ll[ll.indexOf('VS CODE') + 1], 'VIBER', 'Viber accanto a VS Code');
  assert.ok(ll.indexOf('TERMINALE') >= 0 && ll.indexOf('POWERSHELL') < 0);
  assert.ok(ll.indexOf('MONITOR') >= 0 && ll.indexOf('TASK MGR') < 0);
  const wl = labels(win);
  assert.strictEqual(wl[wl.indexOf('VS CODE') + 1], 'VIBER', 'Viber anche su Windows');
  assert.ok(wl.indexOf('POWERSHELL') >= 0 && wl.indexOf('TASK MGR') >= 0);
  const shot = win.tiles.filter(function (t) { return t.id === 'screenshot'; })[0];
  assert.deepStrictEqual(shot.action.keys, ['WIN', 'SHIFT', 'S']);
  assert.strictEqual(lin.tiles.filter(function (t) { return t.id === 'screenshot'; })[0].action.type, 'launch');
});

test('pagina DEV del plugin ufficiale: TERM VSC e PALETTE subito dopo VS CODE, pulsanti con id fissi', function () {
  const dev = config.parseJson(fs.readFileSync(path.join(__dirname, '..', 'official-plugins', 'dev', 'pages', 'dev.json'), 'utf8'));
  const raw = Object.assign({}, config.defaultDock(), { pages: [dev] });
  ['linux', 'windows'].forEach(function (os) {
    const p = page(config.normalizeDock(raw, {}, os), 'dev');
    assert.ok(p.editable);
    assert.deepStrictEqual(labels(p).slice(0, 3), ['VS CODE', 'TERM VSC', 'PALETTE']);
    p.tiles.forEach(function (t) { assert.ok(!/^dev-\d+$/.test(t.id), t.label + ' senza id'); });
  });
});

test('APP avvia Blender e DaVinci; tutti i pulsanti di default hanno id fissi e unici', function () {
  const raw = config.defaultDock();
  const apps = page(config.normalizeDock(raw, {}, 'linux'), 'apps');
  ['blender', 'davinci'].forEach(function (id) {
    const t = apps.allTiles.filter(function (x) { return x.id === id; })[0];
    assert.deepStrictEqual(t.action, { type: 'launch', app: id });
  });
  raw.pages.forEach(function (p) {
    const ids = (p.tiles || []).filter(function (t) { return !t.widget; }).map(function (t) { return t.id; });
    ids.forEach(function (id, i) { assert.ok(id && ids.indexOf(id) === i, p.id + ': id mancante o doppio (' + id + ')'); });
  });
});

test('Linux Wayland: se il focus non è possibile i tasti partono lo stesso', async function () {
  const platform = require('../server/platform');
  const actions = require('../server/actions');
  const orig = { focus: platform.focus, sendKeys: platform.sendKeys };
  const sent = [];
  platform.sendKeys = async function (c) { sent.push(c.join('+')); };
  try {
    platform.focus = async function () { throw Object.assign(new Error('no'), { code: 'UNSUPPORTED' }); };
    await actions.HANDLERS.hotkey({ keys: ['CTRL', 'SHIFT', 'P'], focus: 'Code' });
    assert.strictEqual(sent.length, 1);
    platform.focus = async function () { throw new Error('Finestra non trovata'); };
    await assert.rejects(actions.HANDLERS.hotkey({ keys: ['CTRL', 'S'], focus: 'Code' }));
    assert.strictEqual(sent.length, 1);
  } finally {
    platform.focus = orig.focus;
    platform.sendKeys = orig.sendKeys;
  }
});

test('varianti come lista: vale la prima installata', function () {
  const entry = { label: 'x', linux: [{ path: '/non/esiste/davvero' }, { path: process.execPath, args: ['-v'] }], windows: [{ path: 'C:\\\\no.exe' }] };
  if (process.platform === 'linux') {
    assert.strictEqual(common.forPlatform(entry).path, process.execPath);
    assert.strictEqual(common.forPlatform({ linux: [{ path: '/non/esiste' }, { path: '/neanche' }] }).path, '/non/esiste');
    assert.strictEqual(common.forPlatform({ windows: { path: 'a.exe' } }), null);
  }
  assert.ok(common.available([process.execPath]));
  assert.ok(!common.available('/non/esiste/davvero'));
});

test('i file di config non modificati passano alla nuova versione, quelli modificati no', function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-upgrade-'));
  const defs = path.join(dir, 'defaults');
  const conf = path.join(dir, 'config');
  fs.mkdirSync(defs); fs.mkdirSync(conf);
  const oldText = '{ "apps": { "a": {} } }\n';
  fs.writeFileSync(path.join(defs, 'apps.json'), '{ "apps": { "a": {}, "b": {} } }\n');
  fs.writeFileSync(path.join(defs, 'dock.json'), '{ "pages": [] }\n');
  fs.writeFileSync(path.join(defs, 'history.json'), JSON.stringify({ apps: [config.fingerprint(oldText)], dock: [config.fingerprint(oldText)] }));
  fs.writeFileSync(path.join(conf, 'apps.json'), oldText.replace(/\n/g, '\r\n'));
  fs.writeFileSync(path.join(conf, 'dock.json'), '{ "pages": [ "mia" ] }\n');
  assert.deepStrictEqual(config.upgradeUserConfig(conf, defs), ['apps.json']);
  assert.ok(/"b"/.test(fs.readFileSync(path.join(conf, 'apps.json'), 'utf8')));
  assert.ok(/mia/.test(fs.readFileSync(path.join(conf, 'dock.json'), 'utf8')));
  assert.deepStrictEqual(config.upgradeUserConfig(conf, defs), []);
});

test('pagina UNREAL: disponibile (fuori dalla barra), tasti validi, id unici, app esistente', function () {
  const keys = require('../server/platform/keys');
  const p = config.dock().pages.filter(function (x) { return x.id === 'unreal'; })[0];
  assert.ok(p, 'pagina unreal');
  assert.strictEqual(p.tab, false, 'tra le disponibili, come BLENDER e DAVINCI');
  assert.ok(config.apps().unreal, 'app unreal');
  assert.ok(require('../server/check').iconNames().unreal, 'icona unreal (alias di cube)');
  const ids = p.tiles.map(function (t) { return t.id; });
  ids.forEach(function (id, i) { assert.strictEqual(ids.indexOf(id), i, 'id doppio: ' + id); });
  p.tiles.forEach(function (t) {
    const a = t.action;
    if (a.type === 'hotkey') assert.doesNotThrow(function () { keys.parseCombo(a.keys); }, t.label);
    if (a.type === 'key') assert.doesNotThrow(function () { keys.parseCombo([a.key]); }, t.label);
  });
});

test('pagine BROWSER DEV e ANDROID e app DOCKER: disponibili e con una variante per Windows e una per Linux', function () {
  const apps = config.apps(), commands = config.commands();
  const has = function (entry, os) { return !!(entry && (entry.cmd || entry.path || entry[os])); };
  ['browserdev', 'android'].forEach(function (id) {
    const p = config.dock().pages.filter(function (x) { return x.id === id; })[0];
    assert.ok(p, 'pagina ' + id);
    assert.strictEqual(p.tab, false, id + ' tra le disponibili');
    assert.ok(p.editable, id + ': pulsanti personalizzabili dal pannello');
    p.allTiles.forEach(function (t) {
      const steps = t.action.type === 'macro' ? t.action.steps : [t.action];
      steps.forEach(function (a) {
        ['windows', 'linux'].forEach(function (os) {
          if (a.type === 'launch') assert.ok(has(apps[a.app], os), id + ' › ' + t.label + ': app ' + a.app + ' su ' + os);
          if (a.type === 'command') assert.ok(has(commands[a.id], os), id + ' › ' + t.label + ': comando ' + a.id + ' su ' + os);
        });
      });
    });
  });
  ['windows', 'linux'].forEach(function (os) { assert.ok(has(apps.docker, os), 'docker su ' + os); });
  const appsPage = config.dock().pages.filter(function (x) { return x.id === 'apps'; })[0];
  assert.ok(appsPage.allTiles.some(function (t) { return t.id === 'docker'; }), 'DOCKER nella pagina APP');
});

test('GitHub: i workflow di deploy si riconoscono dal nome o dal file', function () {
  const g = require('../official-plugins/github/lib/github');
  assert.ok(g.isDeploy({ name: 'Deploy to Vercel' }));
  assert.ok(g.isDeploy({ name: 'pages build and deployment' }));
  assert.ok(g.isDeploy({ name: 'build', path: '.github/workflows/cd.yml' }));
  assert.ok(!g.isDeploy({ name: 'CI', path: '.github/workflows/ci.yml' }));
  assert.ok(!g.isDeploy({ name: 'Lint code' }));
});

test('configurazione standard (prima installazione): barra semplice, il resto tra le disponibili', function () {
  const raw = config.defaultDock();
  const tabs = function (os) { return config.normalizeDock(raw, {}, os).pages.filter(function (p) { return p.tab; }).map(function (p) { return p.id; }); };
  assert.deepStrictEqual(tabs('windows'), ['main', 'media', 'apps', 'screens', 'audio']);
  assert.deepStrictEqual(tabs('linux'), ['main', 'media', 'apps', 'audio'], 'SCHERMI su Linux richiede KDE: la aggiungi tu');
  const apps = page(config.normalizeDock(raw, {}, 'windows'), 'apps');
  assert.deepStrictEqual(labels({ tiles: apps.tiles }), ['APPLE MUSIC', 'DISCORD', 'FILE', 'SCREENSHOT', 'DESKTOP', 'BLOCCA', 'SCHERMO OFF', 'VOL -', 'MUTE', 'VOL +']);
  const mine = page(config.normalizeDock(raw, { tiles: { apps: { show: ['blender', 'docker', 'lock'] } } }, 'windows'), 'apps');
  assert.deepStrictEqual(mine.tiles.slice(0, 3).map(function (t) { return t.id; }), ['blender', 'docker', 'lock']);
});
