const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-home-'));
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.DOCK_PLUGINS_DIR = path.join(tmp, 'plugins');
process.env.DOCK_OFFICIAL_PLUGINS_DIR = path.join(tmp, 'official');
process.env.DOCK_TOKEN = 'TESTCODE';
process.env.LOG_LEVEL = 'error';
fs.mkdirSync(process.env.DOCK_CONFIG_DIR, { recursive: true });
['viber', 'ollama', 'claude', 'github', 'screens', 'audio', 'games', 'mail', 'discord', 'todo'].forEach(function (n) { fs.cpSync(path.join(__dirname, '..', 'official-plugins', n), path.join(process.env.DOCK_OFFICIAL_PLUGINS_DIR, n), { recursive: true }); });

const home = require('../server/home');
const config = require('../server/config');
const check = require('../server/check');
const { app } = require('../server/index.js');

let server, base;
test.before(function () {
  return new Promise(function (resolve) {
    server = app.listen(0, '127.0.0.1', function () { base = 'http://127.0.0.1:' + server.address().port; resolve(); });
  });
});
test.after(function () { server.close(); });

function control(method, p, body) {
  return fetch(base + p, { method: method, headers: { 'Content-Type': 'application/json', 'X-Dock-Control': '1' }, body: body ? JSON.stringify(body) : undefined })
    .then(function (r) { return r.json(); });
}
const mainPage = function () { return config.dock().pages.filter(function (p) { return p.id === 'main'; })[0]; };
const desc = function (tiles) { return tiles.map(function (t) { return (t.id || t.widget) + '@' + t.x + ',' + t.y + ' ' + t.w + 'x' + t.h; }); };

test('catalogo: un widget per pagina, solo widget che il tablet sa disegnare', function () {
  const ids = {};
  home.CATALOG.forEach(function (c) {
    assert.ok(!ids[c.id], 'id ripetuto: ' + c.id);
    ids[c.id] = true;
    assert.ok(check.WIDGETS.indexOf(c.widget) >= 0, c.widget);
    assert.ok(c.minW <= c.w && c.minH <= c.h, c.id + ': misura minima');
    assert.ok(c.page, c.id + ': pagina di provenienza');
  });
  const all = {};
  home.catalog().forEach(function (c) { all[c.id] = c; });
  [['viber-projects', 'viber'], ['viber-tasks', 'viber'], ['ollama', 'ollama'], ['claudeusage', 'claude'], ['desks', 'screens'], ['games', 'games'], ['discordmini', 'discord']].forEach(function (x) { assert.strictEqual(all[x[0]] && all[x[0]].plugin, x[1], x[0] + ' from the ' + x[1] + ' plugin'); });
});

test('griglia: le posizioni scelte restano, le altre nella prima cella libera', function () {
  const p = home.pack([{ x: 3, y: 2, w: 3, h: 2 }, { w: 3, h: 2 }, { x: 0, y: 0, w: 2, h: 1 }], 6, 4);
  assert.deepStrictEqual(p.placed.map(function (x) { return x.x + ',' + x.y; }), ['3,2', '2,0', '0,0']);
  const q = home.pack([{ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 1, w: 2, h: 2 }], 6, 4);
  assert.deepStrictEqual(q.placed.map(function (x) { return x.x + ',' + x.y; }), ['0,0', '2,0']);
  assert.deepStrictEqual(home.pack([{ w: 4, h: 4 }, { w: 3, h: 1 }], 6, 4).left, [1]);
});

test('controlli: spazio, voci sconosciute, misure minime, griglia troppo piccola', function () {
  assert.throws(function () { home.clean({ columns: 6, rows: 4, tiles: [] }); }, /almeno un widget/);
  assert.throws(function () { home.clean({ columns: 6, rows: 4, tiles: [{ id: 'volare' }] }); }, /non disponibile/);
  assert.throws(function () { home.clean({ columns: 4, rows: 2, tiles: [{ id: 'todo', w: 4, h: 2 }, { id: 'clock', w: 1, h: 1 }] }); }, /Non c'è spazio per: Orologio/);
  assert.throws(function () { home.clean({ columns: 3, rows: 2, tiles: [{ id: 'mail' }, { id: 'audio' }] }); }, /Non c'è spazio per: Audio/);
  assert.throws(function () { home.clean({ columns: 6, rows: 4, tiles: [{ id: 'discord' }] }); }, /non disponibile/, 'Discord completo resta nella sua pagina');
  const c = home.clean({ columns: 99, rows: 0, tiles: [{ id: 'system', x: 7, y: 5, w: 1, h: 9 }] });
  assert.strictEqual(c.columns, 8);
  assert.strictEqual(c.rows, 2);
  assert.deepStrictEqual(c.tiles[0], { id: 'system', x: 6, y: 0, w: 2, h: 2 }, 'dentro la griglia e non sotto la misura minima');
  const old = home.clean({ columns: 6, rows: 4, tiles: [{ widget: 'nowplaying', w: 3, h: 2 }, { widget: 'todo', w: 3, h: 4 }] });
  assert.deepStrictEqual(desc(old.tiles), ['nowplaying@0,0 3x2', 'todo@3,0 3x4']);
});

test('HOME salvata: posizioni e opzioni sulla pagina main, sopravvive alle scelte delle pagine', function () {
  config.saveHome({ columns: 8, rows: 4, tiles: [
    { id: 'viber-tasks', x: 6, y: 0, w: 2, h: 4 },
    { id: 'ollama', x: 0, y: 2, w: 3, h: 2 },
    { id: 'clock', x: 0, y: 0, w: 2, h: 1 }
  ] });
  let m = mainPage();
  assert.strictEqual(m.columns, 8);
  assert.deepStrictEqual(desc(m.tiles).map(function (s) { return s.replace(/^home-\d+-/, ''); }), ['viber-tasks@6,0 2x4', 'ollama@0,2 3x2', 'clock@0,0 2x1']);
  assert.strictEqual(m.tiles[0].widget, 'viber');
  assert.strictEqual(m.tiles[0].show, 'tasks');
  assert.strictEqual(m.tiles[1].widget, 'chat');
  assert.strictEqual(m.tiles[1].provider, 'ollama');
  config.saveLayout(['main', 'media'], 'main');
  assert.strictEqual(mainPage().tiles[0].show, 'tasks', 'salvare le pagine non perde la HOME');
  config.saveHome(null);
  assert.deepStrictEqual(mainPage().tiles.map(function (t) { return t.widget; }), ['nowplaying', 'todo', 'system']);
});

test('voce del catalogo di un widget della pagina', function () {
  assert.strictEqual(home.catalogId({ widget: 'viber', show: 'projects' }), 'viber-projects');
  assert.strictEqual(home.catalogId({ widget: 'viber' }), null, 'la pagina VIBER intera non è nel catalogo');
  assert.strictEqual(home.catalogId({ widget: 'chat', provider: 'ollama' }), 'ollama');
  assert.strictEqual(home.catalogId({ widget: 'todo' }), 'todo');
});

test('API del pannello: info con posizioni, salva, errore leggibile, ripristina', async function () {
  let r = await control('GET', '/api/control/info');
  assert.strictEqual(r.ok, true);
  const ed = r.data.homeEditor;
  assert.strictEqual(ed.custom, false);
  assert.deepStrictEqual(desc(ed.tiles), ['nowplaying@0,0 3x2', 'todo@3,0 3x4', 'system@0,2 3x2']);
  assert.ok(ed.catalog.length >= 14);
  assert.ok(!ed.catalog.some(function (c) { return c.widget === 'queue'; }), 'la coda resta nella pagina MUSICA');

  r = await control('POST', '/api/control/home', { columns: 6, rows: 4, tiles: [{ id: 'todo', x: 0, y: 0, w: 3, h: 4 }, { id: 'claudeusage', x: 3, y: 0, w: 3, h: 2 }, { id: 'desks', x: 3, y: 2, w: 3, h: 2 }] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.homeEditor.custom, true);
  assert.deepStrictEqual(desc(r.data.homeEditor.tiles), ['todo@0,0 3x4', 'claudeusage@3,0 3x2', 'desks@3,2 3x2']);

  r = await control('POST', '/api/control/home', { columns: 3, rows: 2, tiles: [{ id: 'mail' }, { id: 'audio' }] });
  assert.strictEqual(r.ok, false);

  const no = await fetch(base + '/api/control/home', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.strictEqual(no.status, 403, 'solo dal pannello');

  r = await control('POST', '/api/control/home/reset');
  assert.strictEqual(r.data.homeEditor.custom, false);
});

test('una HOME salvata non valida viene ignorata (vale la pagina main)', function () {
  assert.strictEqual(home.fromLayout({ homePage: { tiles: [{ id: 'sparito' }] } }), null);
  const h = home.fromLayout({ homePage: { columns: 6, rows: 4, tiles: [{ widget: 'queue', w: 2, h: 2 }, { id: 'todo', x: 2, y: 0, w: 2, h: 2 }] } });
  assert.deepStrictEqual(h.tiles.map(function (t) { return t.id; }), ['todo']);
  const page = { id: 'main', tiles: [{ widget: 'todo' }] };
  assert.strictEqual(home.apply(page, { homePage: { tiles: [] } }), page);
});
