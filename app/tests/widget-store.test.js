const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-store-'));
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.DOCK_PLUGINS_DIR = path.join(tmp, 'plugins');
process.env.DOCK_OFFICIAL_PLUGINS_DIR = path.join(tmp, 'official');
process.env.LOG_LEVEL = 'error';

fs.mkdirSync(path.join(tmp, 'official', 'ufficiale', 'widgets'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'official', 'ufficiale', 'plugin.json'), JSON.stringify({ id: 'ufficiale', name: 'U', version: '1.0.0' }));

const { store } = require('../server/shapes/store');
const shapes = require('../server/shapes');

const CPU = { name: 'Mia CPU', shape: 'value', source: { type: 'pc' }, show: { value: '{{cpu.usage}}', unit: '%' } };
const tick = function () { return new Promise(setImmediate); };

test('first save creates the user plugin "miei" with its manifest', async function () {
  const r = store.save(undefined, 'mia-cpu', CPU);
  assert.deepStrictEqual(r, { plugin: 'miei', id: 'mia-cpu', key: 'miei/mia-cpu', home: 'miei.mia-cpu', created: true, allowedHost: false });
  const manifest = JSON.parse(fs.readFileSync(path.join(tmp, 'plugins', 'miei', 'plugin.json'), 'utf8'));
  assert.strictEqual(manifest.id, 'miei');
  assert.deepStrictEqual(manifest.permissions, { http: [] });
  const saved = JSON.parse(fs.readFileSync(path.join(tmp, 'plugins', 'miei', 'widgets', 'mia-cpu.json'), 'utf8'));
  assert.deepStrictEqual(saved, CPU);
  await tick();
  assert.ok(shapes.catalog().some(function (c) { return c.id === 'miei.mia-cpu'; }), 'in the HOME catalog right away');
});

test('names, official plugins and overwriting are checked', function () {
  assert.throws(function () { store.save('miei', 'Brutto Nome', CPU); }, /Nome del widget non valido/);
  assert.throws(function () { store.save('../fuori', 'x', CPU); }, /plugin non valido/);
  assert.throws(function () { store.save('ufficiale', 'x', CPU); }, /plugin ufficiali/);
  assert.throws(function () { store.save('miei', 'mia-cpu', CPU); }, function (e) { return e.code === 'CONFIG_CHANGED'; });
  const r = store.save('miei', 'mia-cpu', Object.assign({}, CPU, { name: 'CPU nuova' }), { overwrite: true });
  assert.strictEqual(r.created, false);
  assert.throws(function () { store.save('miei', 'x', []); }, /oggetto/);
});

test('a widget with problems is not written', function () {
  assert.throws(function () { store.save('miei', 'rotto', { name: 'R', shape: 'nuvola' }); }, /forma sconosciuta/);
  assert.ok(!fs.existsSync(path.join(tmp, 'plugins', 'miei', 'widgets', 'rotto.json')));
});

test('internet sites are allowed only when asked', function () {
  const meteo = { name: 'Meteo', shape: 'text', source: { type: 'http', url: 'https://api.open-meteo.com/v1/forecast?x=1' }, show: { text: '{{current.t}}' } };
  assert.throws(function () { store.save('miei', 'meteo', meteo); }, /permissions\.http/);
  const r = store.save('miei', 'meteo', meteo, { allowHost: true });
  assert.strictEqual(r.allowedHost, true);
  const manifest = JSON.parse(fs.readFileSync(path.join(tmp, 'plugins', 'miei', 'plugin.json'), 'utf8'));
  assert.deepStrictEqual(manifest.permissions.http, ['api.open-meteo.com']);
  assert.strictEqual(store.save('miei', 'meteo2', meteo, { allowHost: true }).allowedHost, false, 'already allowed');
});

test('preview and sample can allow the site before saving', async function () {
  const def = { name: 'X', shape: 'text', source: { type: 'http', url: 'http://127.0.0.1:9/nulla' }, show: { text: 'x' } };
  const blocked = await shapes.preview('nuovo', def);
  assert.match(blocked.problems[0], /permissions\.http/);
  const allowed = await shapes.preview('nuovo', def, 'x', { allowHost: true });
  assert.deepStrictEqual(allowed.problems, []);
  assert.ok(allowed.view.error, 'the site is down, the view says so');
});

test('list and remove', async function () {
  await tick();
  const list = store.list();
  assert.deepStrictEqual(list.map(function (w) { return w.key; }), ['miei/meteo', 'miei/meteo2', 'miei/mia-cpu']);
  assert.strictEqual(list[2].def.name, 'CPU nuova');
  assert.deepStrictEqual(list[2].problems, []);
  store.remove('miei', 'meteo2');
  assert.throws(function () { store.remove('miei', 'meteo2'); }, function (e) { return e.code === 'NOT_FOUND'; });
  assert.throws(function () { store.remove('ufficiale', 'x'); }, /plugin ufficiali/);
  await tick();
  assert.deepStrictEqual(store.list().map(function (w) { return w.key; }), ['miei/meteo', 'miei/mia-cpu']);
});
