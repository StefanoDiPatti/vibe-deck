'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const themes = require('../scripts/build-themes');

const DIR = path.join(__dirname, '..', 'public', 'css', 'themes');

test('i temi sono aggiornati rispetto a dock.css (node scripts/build-themes.js)', function () {
  themes.THEMES.forEach(function (n) {
    const file = path.join(DIR, n + '.css');
    assert.ok(fs.existsSync(file), 'manca ' + n + '.css');
    assert.strictEqual(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), themes.build(n), n + '.css da rigenerare');
  });
});

test('temi compatibili con il tablet: niente flexbox, grid, gap, variabili e calc', function () {
  themes.THEMES.forEach(function (n) {
    const css = fs.readFileSync(path.join(DIR, n + '.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    [/display\s*:\s*(flex|grid|inline-flex)/, /\bgap\s*:/, /var\(--/, /calc\(/].forEach(function (re) {
      assert.ok(!re.test(css), n + '.css contiene ' + re);
    });
    assert.strictEqual((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length, n + '.css: graffe sbilanciate');
  });
});

test('il tema neo-brutalista non lascia testo chiaro su fondo chiaro', function () {
  const css = themes.build('brutal');
  const gen = css.split('/* ---- forme del tema')[0];
  assert.ok(!/(^|[;{]\s*)color:\s*(#ffffff|#e8eef4)\b/m.test(gen), 'testo bianco rimasto nel tema chiaro');
});

test('il pannello del PC ha gli stessi temi del tablet', function () {
  const read = function (f) { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); };
  const ids = function (src) { return (src.match(/\{ id: '([a-z]+)', name:/g) || []).map(function (m) { return m.split("'")[1]; }); };
  const tablet = ids(read('public/js/app.js'));
  assert.ok(tablet.length >= 4);
  assert.deepStrictEqual(ids(read('control/theme.js')), tablet);
  const css = read('control/themes.css');
  tablet.filter(function (t) { return t !== 'classic'; }).forEach(function (t) {
    assert.ok(css.indexOf('html[data-theme="' + t + '"]') >= 0, 'manca il tema ' + t + ' in control/themes.css');
  });
  const html = read('control/index.html');
  assert.ok(html.indexOf('/control/theme.js') >= 0 && html.indexOf('/control/themes.css') >= 0 && html.indexOf('id="theme-pick"') >= 0);
});
