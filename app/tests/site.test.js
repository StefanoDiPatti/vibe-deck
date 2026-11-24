const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-site-'));

test('the site build has the pages, the editor catalog, the official plugins and the tablet preview', function () {
  const dir = require('../scripts/build-site').build(out);
  ['index.html', 'market.html', 'create.html', 'submit.html', 'common.js', 'market.js', 'create.js', 'js/icons.js', 'js/shapes-core.js',
    'preview/index.html', 'preview/js/shapes.js', 'preview/css/dock.css', 'preview/css/themes/neon.css', 'data/catalog.json', 'data/official.json']
    .forEach(function (f) { assert.ok(fs.existsSync(path.join(dir, f)), f); });
  const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'catalog.json'), 'utf8'));
  assert.strictEqual(catalog.shapes.length, 8);
  assert.ok(catalog.sources.some(function (s) { return s.type === 'pc' && s.fields.length > 5; }));
  const official = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'official.json'), 'utf8')).plugins;
  const packs = official.filter(function (p) { return p.type === 'pack'; });
  assert.deepStrictEqual(packs.map(function (p) { return p.id; }).sort(), ['creative', 'developer', 'gaming', 'pc', 'streaming']);
  assert.ok(packs.every(function (p) { return p.icon && p.tags.length; }), 'packs have an icon and a category');
  assert.deepStrictEqual(official.filter(function (p) { return p.id === 'obs'; })[0].tags, ['streaming'], 'plugins take the category of their pack');
});

test('the browser bundle of the shapes draws the same view as the dock', function () {
  const code = require('../scripts/build-site').bundleShapesCore();
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox);
  const core = sandbox.window.ShapesCore;
  const server = require('../server/shapes/shapes').shapes;
  const def = { name: 'CPU', shape: 'value', show: { label: 'CPU', value: '{{cpu.usage|round}}', unit: '%', bar: '{{cpu.usage}}', warn: 50, hot: 80 } };
  const data = { cpu: { usage: 63.4 } };
  assert.deepStrictEqual(JSON.parse(JSON.stringify(core.shapes.shapes.get('value').view(def, data))), JSON.parse(JSON.stringify(server.get('value').view(def, data))));
  const bad = { name: 'x', show: { value: '{{a|nonesiste}}' } };
  const problems = JSON.parse(JSON.stringify(core.shapes.shapes.get('value').validate(bad)));
  assert.ok(problems.length > 0);
  assert.deepStrictEqual(problems, server.get('value').validate(bad));
  assert.strictEqual(core.fields.fieldsOf({ a: { b: 1 } })[0].path, 'a.b');
});
