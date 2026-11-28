const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-tpl-'));
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.DOCK_PLUGINS_DIR = path.join(tmp, 'plugins');
process.env.DOCK_OFFICIAL_PLUGINS_DIR = path.join(__dirname, '..', 'official-plugins');
process.env.DOCK_TOKEN = 'TESTCODE';
process.env.LOG_LEVEL = 'error';
fs.mkdirSync(process.env.DOCK_CONFIG_DIR, { recursive: true });

const templates = require('../server/templates');
const customPages = require('../server/custom-pages');
const home = require('../server/home');
const { app } = require('../server/index.js');

let server;
let base;
test.before(function () {
  return new Promise(function (resolve) {
    server = app.listen(0, '127.0.0.1', function () { base = 'http://127.0.0.1:' + server.address().port; resolve(); });
  });
});
test.after(function () { server.close(); });

async function call(method, url, body) {
  const res = await fetch(base + url, { method: method, headers: { 'Content-Type': 'application/json', 'X-Dock-Control': '1' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() };
}

test('modelli predefiniti: ogni widget esiste nel catalogo', function () {
  const known = {};
  home.catalog().forEach(function (c) { known[c.id] = c; });
  templates.BUILTIN.forEach(function (t) {
    t.tiles.forEach(function (x) {
      assert.ok(known[x.id], t.id + ': ' + x.id);
      assert.ok(x.w >= known[x.id].minW && x.h >= known[x.id].minH, t.id + ': ' + x.id + ' troppo piccolo');
    });
  });
});

test('applica un modello: crea una pagina tua con i widget', async function () {
  const r = await call('POST', '/api/control/templates/apply', { id: 'developer' });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.json.data.skipped, []);
  const page = customPages.shared.store.read(r.json.data.savedPage);
  assert.strictEqual(page.title, 'DEV');
  assert.strictEqual(page.tiles.length, 5);
  const again = await call('POST', '/api/control/templates/apply', { id: 'developer' });
  assert.notStrictEqual(again.json.data.savedPage, r.json.data.savedPage);
  assert.strictEqual((await call('POST', '/api/control/templates/apply', { id: 'nessuno' })).status, 400);
});

test('esporta e importa: stessa pagina, widget mancanti saltati, file sbagliati rifiutati', async function () {
  const made = await call('POST', '/api/control/templates/apply', { id: 'monitor' });
  const id = made.json.data.savedPage;
  const exp = await call('GET', '/api/control/pages/export?id=' + id);
  assert.strictEqual(exp.json.data.format, 'vibe-deck-page');
  assert.strictEqual(exp.json.data.tiles.length, 5);
  assert.strictEqual((await call('GET', '/api/control/pages/export?id=main')).status, 400);

  const imp = await call('POST', '/api/control/pages/import', { template: exp.json.data });
  assert.strictEqual(imp.status, 200);
  assert.notStrictEqual(imp.json.data.savedPage, id);
  assert.strictEqual(customPages.shared.store.read(imp.json.data.savedPage).tiles.length, 5);

  const partial = Object.assign({}, exp.json.data, { tiles: exp.json.data.tiles.concat([{ id: 'plugin-che-non-ho.x', x: 0, y: 3, w: 1, h: 1 }]) });
  const p = await call('POST', '/api/control/pages/import', { template: partial });
  assert.deepStrictEqual(p.json.data.skipped, ['plugin-che-non-ho.x']);

  const none = await call('POST', '/api/control/pages/import', { template: { format: 'vibe-deck-page', title: 'X', tiles: [{ id: 'boh.boh' }] } });
  assert.strictEqual(none.status, 400);
  assert.match(none.json.error.message, /boh\.boh/);
  assert.strictEqual((await call('POST', '/api/control/pages/import', { template: { format: 'altro', tiles: [] } })).status, 400);
  assert.strictEqual((await call('POST', '/api/control/pages/import', { template: 'testo' })).status, 400);
});

test('elenco per il pannello: widget disponibili contati', async function () {
  const r = await call('GET', '/api/control/templates');
  assert.strictEqual(r.json.data.length, templates.BUILTIN.length);
  r.json.data.forEach(function (t) { assert.ok(t.available > 0 && t.available <= t.total, t.id); });
});
