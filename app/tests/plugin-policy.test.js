const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-policy-'));
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.DOCK_PLUGINS_DIR = path.join(tmp, 'plugins');
process.env.DOCK_OFFICIAL_PLUGINS_DIR = path.join(tmp, 'official');
process.env.LOG_LEVEL = 'error';
fs.mkdirSync(process.env.DOCK_CONFIG_DIR, { recursive: true });
fs.mkdirSync(process.env.DOCK_OFFICIAL_PLUGINS_DIR, { recursive: true });

const policy = require('../server/plugin-policy');

const OFFICIAL = path.join(__dirname, '..', 'official-plugins');

function plugin(name, files, permissions) {
  const dir = path.join(process.env.DOCK_PLUGINS_DIR, name);
  const manifest = { id: name, name: name, version: '1.0.0', description: 'x', type: 'plugin', platforms: ['windows', 'linux'], permissions: permissions || {} };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest));
  Object.keys(files).forEach(function (f) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), files[f]);
  });
  return { dir: dir, manifest: manifest };
}

function rules(p, options) {
  return policy.inspect(p.dir, p.manifest, options).map(function (x) { return x.rule; }).sort();
}

test('official plugins respect every rule', function () {
  fs.readdirSync(OFFICIAL).forEach(function (name) {
    const dir = path.join(OFFICIAL, name);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
    assert.deepStrictEqual(policy.describe(policy.inspect(dir, manifest, { official: true })), [], name);
  });
});

test('a clean plugin passes', function () {
  const p = plugin('clean', {
    'index.js': "module.exports = { sources: { a: { label: 'a', read: function (s, ctx) { return {}; } } } };",
    'public/clean.js': "(function () { 'use strict'; var a = function (x) { return x + 1; }; })();",
    'public/clean.css': '.pl-a { color: red; float: left; }',
    'control/clean.js': "window.Panel.card('c', '<a href=\"https://example.com\">help</a>');"
  });
  assert.deepStrictEqual(rules(p), []);
});

test('security: eval, programs, network, private files, internals, remote loading', function () {
  const bad = plugin('bad', {
    'index.js': "const cp = require('child_process'); const x = eval('1'); fetch('https://x.test'); require('../../server/secrets'); process.env.DOCK_TOKEN;",
    'lib/w.js': "require('fs').writeFileSync('/etc/x', 'y');",
    'public/p.js': "var s = document.createElement('script'); s.src = 'https://cdn.example.com/a.js';",
    'public/p.css': "@import url(https://fonts.example.com/f.css); .a { background: url(//x.test/i.png); }",
    'control/c.js': "el.innerHTML = '<img src=\"https://tracker.test/p.gif\">';"
  });
  const found = rules(bad, { official: false });
  ['exec-declared', 'network-declared', 'no-eval', 'no-secrets-of-the-deck', 'writes-in-data', 'no-deck-internals', 'no-remote-loading'].forEach(function (r) {
    assert.ok(found.indexOf(r) >= 0, r + ' in ' + found.join(','));
  });
  assert.strictEqual(found.filter(function (r) { return r === 'no-remote-loading'; }).length, 3);
  assert.ok(policy.blocking(policy.inspect(bad.dir, bad.manifest)).length > 0);
});

test('declared permissions and the plugin data folder make the same code acceptable', function () {
  const ok = plugin('okay', {
    'index.js': "const cp = require('child_process'); fetch('https://x.test'); module.exports = { run: function (a, ctx) { require('fs').writeFileSync(ctx.dataDir + '/a', 'b'); } };"
  }, { exec: true, network: true });
  assert.deepStrictEqual(rules(ok), []);
  const hosts = plugin('hosts', { 'index.js': "fetch('https://x.test');" }, { http: ['x.test'] });
  assert.deepStrictEqual(rules(hosts), []);
  const official = plugin('internal', { 'index.js': "require('../../server/paths');" });
  assert.deepStrictEqual(rules(official, { official: true }), []);
  assert.deepStrictEqual(rules(official, { official: false }), ['no-deck-internals']);
});

test('compatibility: tablet scripts must be ES5 and tablet CSS must avoid modern layout', function () {
  const p = plugin('modern', {
    'public/m.js': "const f = (x) => `a${x}`; class A {} async function g() { await 1; } var s = [...[1]];",
    'public/m.css': '.a { display: flex; gap: 4px; width: calc(100% - 2px); color: var(--x); }'
  });
  const found = policy.inspect(p.dir, p.manifest).map(function (x) { return x.message; }).join('|');
  ['arrow functions', 'let / const', 'template strings', 'classes', 'spread / rest', 'async / await', 'flexbox / grid', 'gap', 'calc()', 'CSS variables'].forEach(function (w) {
    assert.ok(found.indexOf(w) >= 0, w);
  });
  assert.strictEqual(policy.blocking(policy.inspect(p.dir, p.manifest)).length, 0, 'compatibility problems warn but do not block');
});

test('manifest: permissions must have the right shape; limits on size', function () {
  const bad = plugin('shape', {}, { exec: 'yes', network: 1, http: ['not a host!'], local: [3] });
  assert.strictEqual(rules(bad).filter(function (r) { return r === 'permissions'; }).length, 4);
  const big = plugin('big', { 'index.js': 'var a = "' + 'x'.repeat(600 * 1024) + '";' });
  assert.deepStrictEqual(rules(big), ['size']);
});

test('comments and strings in comments do not trigger rules', function () {
  const p = plugin('quiet', { 'index.js': "// eval('x') and child_process\nmodule.exports = {};" });
  assert.deepStrictEqual(rules(p), []);
});

test('a plugin that breaks a security rule is not loaded by the deck, a clean one is', function () {
  fs.rmSync(process.env.DOCK_PLUGINS_DIR, { recursive: true, force: true });
  plugin('evil', { 'index.js': "global.__evilLoaded = true; eval('1'); module.exports = {};" });
  plugin('nice', { 'index.js': "module.exports = { description: 'fine' };" });
  const plugins = require('../server/plugins');
  const rows = plugins.info();
  const evil = rows.filter(function (r) { return r.name === 'evil'; })[0];
  const nice = rows.filter(function (r) { return r.name === 'nice'; })[0];
  assert.strictEqual(evil.active, false);
  assert.match(evil.inactiveReason, /regole di sicurezza/);
  assert.match(evil.error, /no-eval/);
  assert.strictEqual(global.__evilLoaded, undefined);
  assert.strictEqual(nice.active, true);
  assert.strictEqual(nice.error, '');
});
