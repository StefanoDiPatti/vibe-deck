const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-official-'));
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.DOCK_PLUGINS_DIR = path.join(tmp, 'plugins');
process.env.DOCK_OFFICIAL_PLUGINS_DIR = path.join(tmp, 'official');
process.env.LOG_LEVEL = 'error';

const OS = process.platform === 'win32' ? 'windows' : 'linux';
const OTHER = OS === 'windows' ? 'linux' : 'windows';

function plugin(root, name, manifest, pages) {
  const dir = path.join(tmp, root, name);
  fs.mkdirSync(path.join(dir, 'pages'), { recursive: true });
  if (manifest !== null) fs.writeFileSync(path.join(dir, 'plugin.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
  (pages || []).forEach(function (id) {
    fs.writeFileSync(path.join(dir, 'pages', id + '.json'), JSON.stringify({ id: id, title: id.toUpperCase(), tiles: [] }));
  });
}

plugin('official', 'studio', { id: 'studio', name: 'Studio', version: '1.2.0', description: 'Studio pages' }, ['studio']);
plugin('official', 'bundle', { id: 'bundle', name: 'Bundle', version: '1.0.0', type: 'pack', includes: ['studio'] });
fs.rmdirSync(path.join(tmp, 'official', 'bundle', 'pages'));
plugin('official', 'messy', { id: 'messy', name: 'Messy', version: '1.0.0', type: 'pack', includes: ['studio', 'ghost'] }, ['messypage']);
plugin('official', 'other-os', { id: 'other-os', name: 'Other OS', version: '1.0.0', platforms: [OTHER] }, ['otheros']);
plugin('official', 'future', { id: 'future', name: 'Future', version: '1.0.0', engine: '>=99.0.0' }, ['future']);
plugin('official', 'broken', '{ "id": "wrong", "version": "one" }');
plugin('plugins', 'studio', { id: 'studio', name: 'Fake studio', version: '9.9.9' }, ['fakestudio']);
plugin('plugins', 'local', null, ['localpage']);

const plugins = require('../server/plugins');
const config = require('../server/config');

test('official and local plugins are found together; inactive ones are left out', function () {
  assert.deepStrictEqual(plugins.names(), ['broken', 'local', 'studio'], 'packs carry no content of their own');
});

test('an official plugin wins over a local folder with the same name', function () {
  assert.strictEqual(plugins.dirOf('studio'), path.join(tmp, 'official', 'studio'));
  const row = plugins.info().filter(function (p) { return p.name === 'studio' && !p.official; })[0];
  assert.ok(row && !row.active && /ufficiale/.test(row.error));
});

test('manifest fields are read and checked', function () {
  const byName = {};
  plugins.info().forEach(function (p) { if (!byName[p.name]) byName[p.name] = p; });
  assert.strictEqual(byName.studio.title, 'Studio');
  assert.strictEqual(byName.studio.version, '1.2.0');
  assert.strictEqual(byName.studio.official, true);
  assert.strictEqual(byName.bundle.type, 'pack');
  assert.deepStrictEqual(byName.bundle.includes, ['studio']);
  assert.strictEqual(byName.bundle.error, '');
  assert.match(byName.messy.error, /solo plugin\.json/);
  assert.match(byName.messy.error, /ghost/);
  assert.strictEqual(byName.local.official, false);
  assert.strictEqual(byName.local.error, '', 'a local plugin does not need plugin.json');
  assert.match(byName.broken.error, /"id"/);
  assert.match(byName.broken.error, /"version"/);
  assert.strictEqual(byName['other-os'].active, false);
  assert.match(byName['other-os'].inactiveReason, /sistema/);
  assert.strictEqual(byName.future.active, false);
  assert.match(byName.future.inactiveReason, /99\.0\.0/);
});

test('pages come from active plugins only', function () {
  const ids = config.dock().pages.map(function (p) { return p.id; });
  assert.ok(ids.indexOf('studio') >= 0);
  assert.ok(ids.indexOf('localpage') >= 0);
  assert.ok(ids.indexOf('fakestudio') < 0, 'the shadowed local folder is not loaded');
  assert.ok(ids.indexOf('otheros') < 0);
  assert.ok(ids.indexOf('future') < 0);
  assert.ok(ids.indexOf('messypage') < 0, 'pages inside a pack are ignored');
});

test('a new plugin folder is picked up without a restart', function () {
  plugin('plugins', 'late', null, ['latepage']);
  assert.ok(plugins.names().indexOf('late') >= 0);
});

test('versions compare numerically', function () {
  assert.ok(plugins.versionAtLeast('2.10.0', '2.9.9'));
  assert.ok(plugins.versionAtLeast('2.1.1', '2.1.1'));
  assert.ok(!plugins.versionAtLeast('2.1.1', '2.2.0'));
});

test('the real official plugins have a valid manifest; packs only list existing plugins', function () {
  const real = path.join(__dirname, '..', 'official-plugins');
  const all = fs.readdirSync(real);
  all.forEach(function (name) {
    const m = plugins.readManifest(name, path.join(real, name), true);
    assert.deepStrictEqual(m.problems, [], name);
    if (m.type === 'pack') {
      assert.deepStrictEqual(fs.readdirSync(path.join(real, name)), ['plugin.json'], name + ' contains only plugin.json');
      m.includes.forEach(function (n) { assert.ok(all.indexOf(n) >= 0, name + ' includes ' + n); });
    }
  });
});
