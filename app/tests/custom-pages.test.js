const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CustomPages, CustomPageStore } = require('../server/custom-pages');

function make() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-pages-'));
  return { pages: new CustomPages(new CustomPageStore(dir)), dir: dir };
}
const BASE = { title: 'Giochi', icon: 'gamepad', description: 'prova', columns: 4, rows: 3, tiles: [{ id: 'nowplaying', w: 2, h: 2 }, { id: 'clock', w: 2, h: 1 }] };

test('pagina nuova: id dal nome, titolo maiuscolo, fuori dalla barra, widget posizionati', function () {
  const { pages, dir } = make();
  const p = pages.save(BASE, ['main', 'media']);
  assert.strictEqual(p.id, 'u-giochi');
  assert.strictEqual(p.title, 'GIOCHI');
  assert.strictEqual(p.tab, false);
  assert.strictEqual(p.custom, true);
  assert.deepStrictEqual(p.tiles.map(function (t) { return [t.id, t.x, t.y]; }), [['nowplaying', 0, 0], ['clock', 2, 0]]);
  assert.ok(fs.existsSync(path.join(dir, 'u-giochi.json')));
});

test('stesso nome due volte: id diversi; modifica tiene l\'id', function () {
  const { pages } = make();
  const a = pages.save(BASE, []);
  const b = pages.save(BASE, []);
  assert.strictEqual(b.id, 'u-giochi-2');
  const c = pages.save(Object.assign({}, BASE, { id: a.id, title: 'Gaming' }), []);
  assert.strictEqual(c.id, a.id);
  assert.strictEqual(c.title, 'GAMING');
  assert.strictEqual(pages.list().length, 2);
});

test('validazione: nome, widget, spazio; icona strana diventa apps', function () {
  const { pages } = make();
  assert.throws(function () { pages.save(Object.assign({}, BASE, { title: '  ' })); }, /nome/);
  assert.throws(function () { pages.save(Object.assign({}, BASE, { tiles: [] })); }, /almeno un widget/);
  assert.throws(function () { pages.save(Object.assign({}, BASE, { tiles: [{ id: 'boh' }] })); }, /non disponibile per questa pagina/);
  assert.throws(function () { pages.save(Object.assign({}, BASE, { columns: 3, rows: 2, tiles: [{ id: 'nowplaying', w: 3, h: 2 }, { id: 'system', w: 3, h: 2 }] })); }, /spazio/);
  assert.strictEqual(pages.save(Object.assign({}, BASE, { icon: '<svg>' })).icon, 'apps');
});

test('espansione per il tablet ed eliminazione', function () {
  const { pages } = make();
  const p = pages.save(BASE, []);
  const e = pages.expand(p);
  assert.deepStrictEqual(e.tiles.map(function (t) { return t.widget; }), ['nowplaying', 'clock']);
  assert.ok(e.tiles.every(function (t) { return t.id.indexOf('u-giochi-') === 0; }));
  assert.strictEqual(pages.expand({ id: 'main', tiles: [] }).tiles.length, 0);
  pages.remove(p.id);
  assert.strictEqual(pages.list().length, 0);
  assert.throws(function () { pages.remove(p.id); }, /non trovata/);
  assert.throws(function () { pages.remove('../dock'); }, /non trovata/);
});
