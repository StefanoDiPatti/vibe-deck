const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const palette = require('../server/themes/palette');
const presets = require('../server/themes/presets');
const { registry, CLASSIC } = require('../server/themes/styles');
const { ThemeService } = require('../server/themes');

function tmpService() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-themes-'));
  return { svc: new ThemeService({ file: path.join(dir, 'themes.json') }), dir: dir };
}
const SUNSET = presets.EXTRA.filter(function (p) { return p.id === 'sunset'; })[0].palette;

test('palette: 10 colori #rrggbb, il resto è rifiutato', function () {
  assert.strictEqual(palette.IDS.length, 10);
  assert.deepStrictEqual(palette.clean(CLASSIC), CLASSIC);
  assert.strictEqual(palette.clean(Object.assign({}, CLASSIC, { accent: 'red' })), null);
  assert.strictEqual(palette.clean(Object.assign({}, CLASSIC, { accent: undefined })), null);
  assert.strictEqual(palette.clean(Object.assign({}, CLASSIC, { bg: '#0B0F14' })).bg, '#0b0f14');
});

test('ricolorazione: i colori della palette vanno nei colori nuovi, le ombre nere restano', function () {
  const rc = new palette.PaletteRecolorer(CLASSIC, SUNSET);
  palette.IDS.forEach(function (id) { assert.strictEqual(rc.color(CLASSIC[id]), SUNSET[id], id); });
  assert.strictEqual(rc.color('rgba(0, 0, 0, 0.55)'), null);
  assert.match(rc.color('rgba(61, 139, 253, 0.3)'), /^rgba\(255, 122, 89, 0\.3\)$/);
});

test('ricolorazione verso una palette chiara: il bianco diventa scuro', function () {
  const paper = presets.EXTRA.filter(function (p) { return p.id === 'paper'; })[0].palette;
  const rc = new palette.PaletteRecolorer(CLASSIC, paper);
  assert.strictEqual(rc.color('#ffffff'), '#000000');
  assert.strictEqual(rc.color('#0b0f14'), paper.bg);
});

test('stili: 4 nel registro, ognuno con la sua palette completa', function () {
  assert.deepStrictEqual(registry.all().map(function (s) { return s.id; }), ['classic', 'material', 'neon', 'brutal']);
  registry.all().forEach(function (s) { assert.ok(palette.clean(s.palette()), s.id); });
  assert.strictEqual(registry.get('neon').palette().accent, '#41d1ff');
});

test('preset: uno per stile più quelli nuovi, tutti validi', function () {
  const all = presets.all();
  assert.ok(all.length >= 8);
  all.forEach(function (p) { assert.ok(palette.clean(p.palette), p.id); });
});

test('servizio: temi di base senza CSS extra finché non cambi i colori', function () {
  const { svc } = tmpService();
  assert.strictEqual(svc.cssFor('classic'), '');
  assert.strictEqual(svc.forTablet().length, 4);
  assert.ok(svc.forTablet().every(function (t) { return t.v === ''; }));
});

test('servizio: colori tuoi su un tema di base, poi colori originali', function () {
  const { svc } = tmpService();
  const r = svc.save({ id: 'neon', palette: SUNSET });
  assert.strictEqual(r.id, 'neon');
  const t = svc.forTablet().filter(function (x) { return x.id === 'neon'; })[0];
  assert.ok(t.v);
  const css = svc.cssFor('neon');
  assert.ok(css.indexOf(SUNSET.accent) >= 0);
  assert.ok(css.indexOf('#stage') >= 0 || css.indexOf('.tile') >= 0);
  svc.reset('neon');
  assert.strictEqual(svc.cssFor('neon'), '');
  svc.save({ id: 'neon', palette: registry.get('neon').palette() });
  assert.strictEqual(svc.resolve('neon').modified, false);
});

test('servizio: tema nuovo, nome obbligatorio, id unico, esporta e importa', function () {
  const { svc } = tmpService();
  assert.throws(function () { svc.save({ name: '  ', style: 'classic', palette: SUNSET }); }, /nome/);
  assert.throws(function () { svc.save({ name: 'X', style: 'boh', palette: SUNSET }); }, /Stile/);
  const a = svc.save({ name: 'Il mio tema', style: 'material', palette: SUNSET });
  const b = svc.save({ name: 'Il mio tema', style: 'classic', palette: SUNSET });
  assert.strictEqual(a.id, 'u-il-mio-tema');
  assert.strictEqual(b.id, 'u-il-mio-tema-2');
  assert.strictEqual(svc.forTablet().length, 6);
  const ex = svc.exportTheme(a.id);
  assert.deepStrictEqual(Object.keys(ex), ['vibeDeckTheme', 'name', 'style', 'palette']);
  assert.throws(function () { svc.importTheme({ name: 'x' }); }, /vibeDeckTheme/);
  const imp = svc.importTheme(ex);
  assert.strictEqual(imp.theme.style, 'material');
  assert.notStrictEqual(imp.id, a.id);
  svc.reset(a.id);
  assert.strictEqual(svc.resolve(a.id), null);
});

test('servizio: id strani o file rovinato non rompono niente', function () {
  const { svc, dir } = tmpService();
  fs.writeFileSync(path.join(dir, 'themes.json'), '{ "themes": { "../x": { "name": "a" }, "u-ok": { "name": "Ok", "style": "classic", "palette": { "bg": "nope" } } } }');
  assert.strictEqual(svc.resolve('../x'), null);
  assert.strictEqual(svc.resolve('u-ok'), null);
  assert.strictEqual(svc.forTablet().length, 4);
  assert.strictEqual(svc.cssFor('../x'), '');
});
