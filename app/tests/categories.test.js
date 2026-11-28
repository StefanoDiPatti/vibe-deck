const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-categories-'));
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.DOCK_PLUGINS_DIR = path.join(tmp, 'plugins');
process.env.DOCK_OFFICIAL_PLUGINS_DIR = path.join(__dirname, '..', 'official-plugins');
process.env.LOG_LEVEL = 'error';
fs.mkdirSync(process.env.DOCK_CONFIG_DIR, { recursive: true });

const { categories, CategoryRegistry } = require('../server/categories');
const translate = require('../server/shapes/translate');

test('categorie: esplicita, poi etichette del plugin, poi pagina, poi altro', function () {
  assert.strictEqual(categories.resolve('music', [], 'HOME'), 'music');
  assert.strictEqual(categories.resolve('', ['unknown', 'dev'], 'HOME'), 'developer');
  assert.strictEqual(categories.resolve('', [], 'MUSICA'), 'music');
  assert.strictEqual(categories.resolve('boh', [], 'PLUGIN X'), 'other');
  assert.strictEqual(categories.resolve('domotica', [], ''), 'home');
});

test('categorie: ogni voce ha etichetta italiana e inglese, in ordine stabile', function () {
  const list = categories.list();
  assert.ok(list.length >= 15);
  list.forEach(function (c) { assert.ok(c.id && c.label && c.en); });
  assert.strictEqual(list[list.length - 1].id, 'other');
  assert.ok(new CategoryRegistry().add('a', 'A', 'A').list().length === 1);
});

test('catalogo HOME: ogni voce ha una categoria nota', function () {
  const home = require('../server/home');
  const known = categories.list().map(function (c) { return c.id; });
  home.catalog().forEach(function (c) { assert.ok(known.indexOf(c.category) >= 0, c.id + ': ' + c.category); });
});

test('catalogo dell\'editor: traduzione inglese completa', function () {
  const catalog = require('../server/shapes/catalog').catalog();
  assert.deepStrictEqual(translate.missing(catalog), []);
  const en = translate.translate(catalog, 'en');
  const value = en.shapes.filter(function (s) { return s.name === 'value'; })[0];
  assert.strictEqual(value.label, 'Big number');
  assert.strictEqual(value.show[0].label, 'Title');
  assert.strictEqual(translate.translate(catalog, 'it'), catalog);
  assert.strictEqual(require('../server/shapes/catalog').catalog('en').shapes[0].label, en.shapes[0].label);
});
