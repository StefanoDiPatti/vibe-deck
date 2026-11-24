const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-market-'));
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.DOCK_PLUGINS_DIR = path.join(tmp, 'plugins');
process.env.DOCK_OFFICIAL_PLUGINS_DIR = path.join(tmp, 'official');
process.env.LOG_LEVEL = 'error';

fs.mkdirSync(path.join(tmp, 'official', 'ufficiale'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'official', 'ufficiale', 'plugin.json'), JSON.stringify({ id: 'ufficiale', name: 'U', version: '1.0.0' }));
fs.mkdirSync(path.join(tmp, 'plugins', 'mio'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'plugins', 'mio', 'plugin.json'), JSON.stringify({ id: 'mio', name: 'Mio', version: '1.0.0' }));

const { market, sha256, bundle } = require('../server/market');
const shapes = require('../server/shapes');

const files = {};
let index = { plugins: [] };
const server = http.createServer(function (req, res) {
  if (req.url === '/index.json') { res.end(JSON.stringify(index)); return; }
  if (files[req.url]) { res.end(files[req.url]); return; }
  res.statusCode = 404;
  res.end('no');
});
const ready = new Promise(function (r) { server.listen(0, '127.0.0.1', function () { process.env.DOCK_MARKET_INDEX = 'http://127.0.0.1:' + server.address().port + '/index.json'; r(); }); });
test.after(function () { server.close(); });

function widget(name) { return { name: name, shape: 'text', source: { type: 'static', data: { t: name } }, show: { text: '{{t}}' } }; }
function pkg(id, version, extra) {
  return { format: 1, files: Object.assign({ 'plugin.json': { id: id, name: id, version: version, engine: '>=2.2.0' }, 'widgets/saluto.json': widget('Ciao ' + id) }, extra || {}) };
}
function publish(id, version, content, over) {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  const url = '/packages/' + id + '-' + version + '.vdp.json';
  files[url] = text;
  const entry = Object.assign({ id: id, name: id, description: 'Prova', author: 'test', version: version, engine: '>=2.2.0', url: url.slice(1), sha256: sha256(text), widgets: 1 }, over || {});
  index.plugins = index.plugins.filter(function (p) { return p.id !== id; }).concat([entry]);
  return entry;
}
const tick = function () { return new Promise(setImmediate); };

test('list: states for available, official and local plugins; bad index entries are skipped', async function () {
  await ready;
  publish('meteo', '1.0.0', pkg('meteo', '1.0.0'));
  publish('ufficiale', '1.0.0', pkg('ufficiale', '1.0.0'));
  publish('mio', '1.0.0', pkg('mio', '1.0.0'));
  index.plugins.push({ id: 'Rotto!', version: '1', sha256: 'x', url: 'x' });
  const l = await market.list(true);
  const st = {};
  l.plugins.forEach(function (p) { st[p.id] = p.state; });
  assert.deepStrictEqual(st, { meteo: 'available', ufficiale: 'official', mio: 'local' });
  assert.match(l.plugins[0].url, /^http:\/\/127\.0\.0\.1:\d+\/packages\//, 'relative urls resolved against the index');
});

test('install writes the files, records the version and the widgets show up', async function () {
  const r = await market.install('meteo');
  assert.deepStrictEqual([r.id, r.version, r.files], ['meteo', '1.0.0', 2]);
  assert.ok(fs.existsSync(path.join(tmp, 'plugins', 'meteo', 'widgets', 'saluto.json')));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'market.json'), 'utf8')).plugins.meteo.version, '1.0.0');
  await tick();
  assert.ok(shapes.catalog().some(function (c) { return c.id === 'meteo.saluto'; }));
  assert.strictEqual((await market.list(true)).plugins.filter(function (p) { return p.id === 'meteo'; })[0].state, 'installed');
});

test('update: a newer version replaces the old files', async function () {
  publish('meteo', '1.1.0', pkg('meteo', '1.1.0', { 'widgets/nuovo.json': widget('Nuovo') }));
  assert.strictEqual((await market.list(true)).plugins.filter(function (p) { return p.id === 'meteo'; })[0].state, 'update');
  await market.install('meteo');
  assert.ok(fs.existsSync(path.join(tmp, 'plugins', 'meteo', 'widgets', 'nuovo.json')));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(tmp, 'plugins', 'meteo', 'plugin.json'), 'utf8')).version, '1.1.0');
});

test('refused: wrong fingerprint, forbidden files, wrong id or version, conflicts, too new', async function () {
  const tampered = publish('falso', '1.0.0', pkg('falso', '1.0.0'));
  files['/' + tampered.url.replace(/^.*?\/packages\//, 'packages/')] = JSON.stringify(pkg('falso', '1.0.0', { 'widgets/extra.json': widget('x') }));
  await assert.rejects(market.install('falso'), /impronta/);
  publish('comandi', '1.0.0', pkg('comandi', '1.0.0', { 'commands/rm.json': { commands: { rm: { cmd: 'rm' } } } }));
  await assert.rejects(market.install('comandi'), /non ammesso/);
  publish('codice', '1.0.0', pkg('codice', '1.0.0', { 'index.js': { x: 1 } }));
  await assert.rejects(market.install('codice'), /non ammesso/);
  publish('altro', '1.0.0', pkg('diverso', '1.0.0'));
  await assert.rejects(market.install('altro'), /non di "altro"/);
  publish('versione', '2.0.0', pkg('versione', '1.0.0'));
  await assert.rejects(market.install('versione'), /Versione/);
  await assert.rejects(market.install('ufficiale'), /plugin ufficiale/);
  await assert.rejects(market.install('mio'), /tuo plugin/);
  publish('futuro', '1.0.0', pkg('futuro', '1.0.0'), { engine: '>=99.0.0' });
  await assert.rejects(market.install('futuro'), /Serve Vibe Deck/);
  await assert.rejects(market.install('manca'), function (e) { return e.code === 'NOT_FOUND'; });
  ['falso', 'comandi', 'codice', 'altro', 'versione', 'futuro'].forEach(function (id) {
    assert.ok(!fs.existsSync(path.join(tmp, 'plugins', id)), id + ' not written');
  });
  assert.deepStrictEqual(fs.readdirSync(path.join(tmp, 'plugins')).filter(function (n) { return n.charAt(0) === '.'; }), [], 'no temporary folders left');
});

test('remove: only plugins installed from the market', async function () {
  await assert.rejects(Promise.resolve().then(function () { return market.remove('mio'); }), /non è stato installato dal market/);
  market.remove('meteo');
  assert.ok(!fs.existsSync(path.join(tmp, 'plugins', 'meteo')));
  assert.strictEqual((await market.list(true)).plugins.filter(function (p) { return p.id === 'meteo'; })[0].state, 'available');
  assert.ok(fs.existsSync(path.join(tmp, 'plugins', 'mio', 'plugin.json')), 'local plugin untouched');
});

test('market unreachable gives a clear message', async function () {
  const saved = process.env.DOCK_MARKET_INDEX;
  process.env.DOCK_MARKET_INDEX = 'http://127.0.0.1:9/index.json';
  await assert.rejects(market.list(true), /non raggiungibile|non risponde/);
  process.env.DOCK_MARKET_INDEX = saved;
});

test('bundle: a plugin folder becomes a package with allowed files only', function () {
  const dir = path.join(tmp, 'src');
  fs.mkdirSync(path.join(dir, 'widgets'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'commands'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), '// commento\n{ "id": "src", "version": "1.0.0" }');
  fs.writeFileSync(path.join(dir, 'widgets', 'a.json'), JSON.stringify(widget('A')));
  fs.writeFileSync(path.join(dir, 'commands', 'x.json'), '{}');
  fs.writeFileSync(path.join(dir, 'README.md'), '# x');
  assert.deepStrictEqual(Object.keys(bundle(dir).files).sort(), ['plugin.json', 'widgets/a.json']);
});
