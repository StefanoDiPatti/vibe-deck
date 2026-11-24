const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-catalog-'));
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.DOCK_PLUGINS_DIR = path.join(tmp, 'plugins');
process.env.DOCK_OFFICIAL_PLUGINS_DIR = path.join(tmp, 'official');
process.env.DOCK_TOKEN = 'CATALOG1';
process.env.LOG_LEVEL = 'error';

function write(rel, content) {
  const file = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
}

write('plugins/kit/index.js', [
  'module.exports = {',
  '  sources: { stato: { label: "Stato del kit", description: "Prova", every: 3, fields: [{ path: "n", label: "Numero", type: "number", unit: "pz" }, { nope: 1 }],',
  '    params: [{ name: "zona", label: "Zona", type: "text" }, { name: "x", type: "magia" }], read: async function () { return { n: 4 }; } } },',
  '  actions: {',
  '    descritta: { label: "Fai qualcosa", description: "Una prova", params: [{ name: "quanto", label: "Quanto", type: "number", min: 1 }], run: async function (a) { return "fatto " + a.quanto; } },',
  '    semplice: async function () { return "ok"; },',
  '    rotta: { label: "Senza run" }',
  '  }',
  '};'
].join('\n'));
write('data/stato.json', { coda: [{ nome: 'build', pct: 40 }], meteo: { time: ['a', 'b'], t: [1, 2] } });
write('config/apps.json', { apps: { editor: { label: 'Il mio editor', windows: { path: 'x.exe' }, linux: { path: 'x' } } } });

const actions = require('../server/actions');
const descriptors = require('../server/actions/descriptors');
const { catalog } = require('../server/shapes/catalog');
const facade = require('../server/shapes');
const { fieldsOf } = require('../server/shapes/fields');
const template = require('../server/shapes/template');

const EDITOR_TYPES = descriptors.PARAM_TYPES.concat(['rows', 'row', 'phrases']);

test('every shape is described for the editor, with known field types', function () {
  const c = catalog();
  assert.deepStrictEqual(c.shapes.map(function (s) { return s.name; }).sort(), ['bars', 'buttons', 'list', 'slider', 'status', 'text', 'value', 'voice']);
  c.shapes.forEach(function (s) {
    assert.ok(s.label && s.label !== s.name, s.name + ' has a label');
    assert.ok(s.description, s.name + ' has a description');
    s.show.concat([].concat.apply([], s.actions.map(function (a) { return a.item || []; }))).forEach(function (p) {
      assert.ok(EDITOR_TYPES.indexOf(p.type) >= 0, s.name + '.' + p.name + ': type ' + p.type);
      (p.item || []).forEach(function (q) { assert.ok(EDITOR_TYPES.indexOf(q.type) >= 0, s.name + '.' + p.name + '.' + q.name); });
    });
    assert.ok(s.actions.length >= 1, s.name + ' says which actions it takes');
  });
});

test('every filter and every built-in action is described', function () {
  template.filters.names().forEach(function (n) { assert.ok(template.FILTER_INFO[n], 'filter ' + n); });
  actions.BUILTIN.filter(function (t) { return descriptors.HIDDEN.indexOf(t) < 0; }).forEach(function (t) {
    assert.ok(descriptors.BUILTIN[t], 'action ' + t);
    descriptors.BUILTIN[t].params.forEach(function (p) { assert.ok(descriptors.PARAM_TYPES.indexOf(p.type) >= 0, t + '.' + p.name); });
  });
  const c = catalog();
  assert.ok(!c.actions.some(function (a) { return a.type === 'shell'; }), 'aliases are hidden');
  const media = c.actions.filter(function (a) { return a.type === 'media'; })[0];
  assert.ok(media.params[0].options.some(function (o) { return o.value === 'play_pause'; }));
});

test('plugin actions: { run, label, params } is described, a plain function still works, no run = ignored', async function () {
  const c = catalog();
  const byType = {};
  c.actions.forEach(function (a) { byType[a.type] = a; });
  assert.deepStrictEqual(byType['kit.descritta'], {
    type: 'kit.descritta', label: 'Fai qualcosa', description: 'Una prova', described: true, plugin: 'kit',
    params: [{ name: 'quanto', label: 'Quanto', type: 'number', min: 1 }]
  });
  assert.strictEqual(byType['kit.semplice'].described, false);
  assert.strictEqual(byType['kit.semplice'].label, 'kit.semplice');
  assert.strictEqual(byType['kit.rotta'], undefined);
  assert.strictEqual((await actions.execute({ type: 'kit.descritta', quanto: 3 })).message, 'fatto 3');
  assert.strictEqual((await actions.execute({ type: 'kit.semplice' })).message, 'ok');
});

test('sources: built-in and plugin connectors with their parameters and fields', function () {
  const c = catalog();
  const byType = {};
  c.sources.forEach(function (s) { byType[s.type] = s; });
  ['static', 'pc', 'http', 'file', 'command', 'kit.stato'].forEach(function (t) { assert.ok(byType[t], t); });
  assert.strictEqual(byType['kit.stato'].plugin, 'kit');
  assert.strictEqual(byType['kit.stato'].label, 'Stato del kit');
  assert.deepStrictEqual(byType['kit.stato'].fields, [{ path: 'n', label: 'Numero', type: 'number', unit: 'pz' }]);
  assert.deepStrictEqual(byType['kit.stato'].params.map(function (p) { return p.name; }), ['zona'], 'unknown param types are dropped');
  assert.strictEqual(byType['kit.stato'].minEvery, 3);
  assert.strictEqual(byType.http.sample, true, 'internet fields are discovered by sampling');
  assert.ok(byType.pc.fields.some(function (f) { return f.path === 'cpu.usage' && f.unit === '%'; }));
  assert.ok(byType.pc.fields.some(function (f) { return f.path === 'apps.editor' && f.label === 'Il mio editor aperta' && f.type === 'boolean'; }));
  assert.ok(c.choices.app.some(function (a) { return a.value === 'editor' && a.label === 'Il mio editor'; }));
  assert.ok(c.icons.some(function (i) { return i.name === 'sun' && i.picture; }));
  assert.ok(c.icons.some(function (i) { return i.name === 'cpu' && !i.picture; }));
});

test('field walker: values, lists of objects, parallel columns, limits', function () {
  const f = fieldsOf({ a: { b: 1, c: 'x' }, coda: [{ nome: 'build', pct: 40 }], meteo: { time: ['a', 'b'], t: [1, 2] }, vuoto: null });
  const byPath = {};
  f.forEach(function (x) { byPath[x.path] = x; });
  assert.deepStrictEqual(byPath['a.b'], { path: 'a.b', type: 'number', sample: '1' });
  assert.strictEqual(byPath.coda.type, 'list');
  assert.strictEqual(byPath.coda.count, 1);
  assert.deepStrictEqual(byPath.coda.item.map(function (i) { return i.path; }), ['nome', 'pct']);
  assert.strictEqual(byPath.meteo.type, 'columns');
  assert.strictEqual(byPath.meteo.hint, '{{meteo|zip}}');
  assert.strictEqual(byPath.vuoto.type, 'empty');
  assert.strictEqual(fieldsOf([{ x: 1 }])[0].path, '.', 'a list at the top is "."');
  const big = {};
  for (let i = 0; i < 500; i++) big['k' + i] = i;
  assert.strictEqual(fieldsOf(big).length, 200);
  assert.ok(fieldsOf({ s: 'x'.repeat(500) })[0].sample.length <= 80);
});

test('sample: reads a source once with the plugin permissions', async function () {
  const r = await facade.sample('qualsiasi', { type: 'file', path: 'stato.json' });
  assert.ok(r.fields.some(function (f) { return f.path === 'coda' && f.type === 'list'; }));
  assert.match(r.preview, /build/);
  assert.strictEqual((await facade.sample('kit', { type: 'kit.stato' })).fields[0].path, 'n');
  await assert.rejects(facade.sample('altro', { type: 'kit.stato' }), /un plugin deve funzionare da solo/);
  await assert.rejects(facade.sample('kit', { type: 'http', url: 'https://example.com/' }), /permissions\.http/);
  await assert.rejects(facade.sample('kit', { type: 'file', path: '../fuori' }), /dentro data/);
  await assert.rejects(facade.sample('../x', { type: 'static' }), /plugin non valido/);
  await assert.rejects(facade.sample('kit', null), /Manca la fonte/);
});

test('preview: a widget that is not saved yet gives its problems or its view', async function () {
  const bad = await facade.preview('kit', { name: 'X', shape: 'value', source: { type: 'meteo' } });
  assert.strictEqual(bad.view, null);
  assert.match(bad.problems[0], /fonte sconosciuta/);
  const ok = await facade.preview('kit', { name: 'Coda', shape: 'list', source: { type: 'file', path: 'stato.json' }, show: { items: '{{coda}}', item: { title: '{{item.nome}}', bar: '{{item.pct}}' } } });
  assert.deepStrictEqual(ok.problems, []);
  assert.strictEqual(ok.view.items[0].title, 'build');
  assert.strictEqual(ok.view.items[0].bar, 40);
  const missing = await facade.preview('kit', { name: 'N', shape: 'text', source: { type: 'file', path: 'manca.json' }, show: { text: 'x' } });
  assert.match(missing.view.error, /non trovato/);
});

test('editor routes answer only to the control panel on this PC', async function () {
  const { app } = require('../server/index.js');
  const server = await new Promise(function (resolve) { const s = app.listen(0, '127.0.0.1', function () { resolve(s); }); });
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const no = await fetch(base + '/api/control/catalog', { headers: { 'X-Dock-Token': 'CATALOG1' } });
    assert.strictEqual(no.status, 403);
    const yes = await (await fetch(base + '/api/control/catalog', { headers: { 'x-dock-control': '1' } })).json();
    assert.ok(yes.ok && yes.data.shapes.length === 8);
    const prev = await (await fetch(base + '/api/control/shapes/preview', {
      method: 'POST', headers: { 'x-dock-control': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ plugin: 'kit', def: { name: 'T', shape: 'text', show: { text: 'ciao' } } })
    })).json();
    assert.strictEqual(prev.data.view.text, 'ciao');
    const blocked = await fetch(base + '/api/control/shapes/sample', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dock-Token': 'CATALOG1' }, body: '{}' });
    assert.strictEqual(blocked.status, 403);
  } finally {
    server.close();
    try { require('../server/platform').shutdown(); } catch (e) { }
  }
});
