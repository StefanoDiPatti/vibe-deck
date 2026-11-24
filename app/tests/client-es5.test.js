const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const JS_DIR = path.join(__dirname, '..', 'public', 'js');
const CSS = path.join(__dirname, '..', 'public', 'css', 'dock.css');

let acorn = null;
try { acorn = require('acorn'); } catch (e) { acorn = null; }

const FORBIDDEN_JS = [
  [/\.startsWith\(|\.endsWith\(|\.includes\(/, 'metodi stringa/array ES6'],
  [/\.closest\(/, 'Element.closest'],
  [/\.classList\b/, 'classList'],
  [/querySelectorAll\([^)]*\)\.forEach/, 'NodeList.forEach'],
  [/\bfetch\(/, 'fetch'],
  [/\bPromise\b/, 'Promise'],
  [/\.bind\(/, 'Function.bind (assente su Android 4.0)'],
  [/\.find\(|\.findIndex\(/, 'Array.find'],
  [/Object\.assign|Array\.from/, 'Object.assign / Array.from'],
  [/new CustomEvent/, 'CustomEvent'],
  [/\{\s*passive\s*:/, 'opzioni passive negli event listener']
];

const PLUGIN_ROOTS = [path.join(__dirname, '..', 'plugins'), path.join(__dirname, '..', 'official-plugins')];
function pluginFiles(re) {
  const out = [];
  let dirs = [];
  PLUGIN_ROOTS.forEach(function (root) {
    try { dirs = dirs.concat(fs.readdirSync(root).map(function (d) { return path.join(root, d); })); } catch (e) { }
  });
  dirs.forEach(function (d) {
    const pub = path.join(d, 'public');
    let files = [];
    try { files = fs.readdirSync(pub); } catch (e) { files = []; }
    files.filter(function (f) { return re.test(f); }).forEach(function (f) { out.push(path.join(pub, f)); });
  });
  return out;
}
const CLIENT_JS = fs.readdirSync(JS_DIR).filter(function (f) { return /\.js$/.test(f); })
  .map(function (f) { return path.join(JS_DIR, f); }).concat(pluginFiles(/\.js$/));

CLIENT_JS.forEach(function (full) {
  const file = path.relative(path.join(__dirname, '..'), full);
  const src = fs.readFileSync(full, 'utf8');

  test(file + ': sintassi ES5', { skip: !acorn && 'acorn non installato (npm install)' }, function () {
    acorn.parse(src, { ecmaVersion: 5, sourceType: 'script' });
  });

  test(file + ': niente API moderne', function () {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    FORBIDDEN_JS.forEach(function (rule) {
      assert.ok(!rule[0].test(code), file + ' usa ' + rule[1]);
    });
  });
});

test('CSS senza flexbox, grid, gap, variabili e calc (anche quello dei plugin)', function () {
  [CSS].concat(pluginFiles(/\.css$/)).forEach(function (file) {
    const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    [/display\s*:\s*(flex|grid|inline-flex)/, /\bgap\s*:/, /var\(--/, /calc\(/].forEach(function (re) {
      assert.ok(!re.test(css), path.basename(file) + ' contiene ' + re);
    });
  });
});
