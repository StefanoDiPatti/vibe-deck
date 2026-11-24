const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-switch-'));
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.DOCK_PLUGINS_DIR = path.join(tmp, 'plugins');
process.env.DOCK_OFFICIAL_PLUGINS_DIR = path.join(tmp, 'official');
process.env.DOCK_TOKEN = 'SWITCH12';
process.env.LOG_LEVEL = 'error';

function write(rel, content) {
  const file = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
}
write('official/uno/plugin.json', { id: 'uno', name: 'Uno', version: '1.0.0', description: 'con codice' });
write('official/uno/index.js', 'module.exports = { description: "uno" };');
write('official/due/plugin.json', { id: 'due', name: 'Due', version: '1.0.0' });
write('official/due/pages/due.json', { id: 'due', title: 'DUE', tiles: [] });
write('official/solo/plugin.json', { id: 'solo', name: 'Solo', version: '1.0.0' });
write('official/gruppo/plugin.json', { id: 'gruppo', name: 'Gruppo', type: 'pack', version: '1.0.0', description: 'Uno e due', includes: ['uno', 'due'] });
write('plugins/mio/plugin.json', { id: 'mio', name: 'Mio', version: '1.0.0' });

const plugins = require('../server/plugins');

test('official packs and plugins are on by default and can be switched off and on', function () {
  plugins.load();
  let s = plugins.officialSwitches();
  assert.deepStrictEqual(s.packs.map(function (p) { return [p.id, p.state, p.plugins.map(function (x) { return x.id + (x.on ? '+' : '-'); }).join(',')]; }), [['gruppo', 'on', 'uno+,due+']]);
  assert.deepStrictEqual(s.plugins.map(function (p) { return p.id; }), ['solo'], 'plugins outside packs listed alone');
  assert.ok(plugins.names().indexOf('due') >= 0);

  let r = plugins.setSwitch('gruppo', false);
  assert.deepStrictEqual(r.changed.sort(), ['due', 'uno']);
  assert.strictEqual(r.restart, true, 'a loaded plugin with code needs a restart to stop');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(tmp, 'config', 'plugins.json'), 'utf8')), { off: ['due', 'uno'] });
  assert.ok(plugins.names().indexOf('due') < 0 && plugins.names().indexOf('uno') < 0, 'switched off plugins are not active');
  assert.strictEqual(plugins.manifests().filter(function (m) { return m.id === 'due'; })[0].reason, 'spento dal pannello');
  s = plugins.officialSwitches();
  assert.strictEqual(s.packs[0].state, 'off');

  r = plugins.setSwitch('due', true);
  assert.deepStrictEqual(r.changed, ['due']);
  assert.strictEqual(r.restart, false, 'a JSON-only plugin needs no restart');
  assert.strictEqual(plugins.officialSwitches().packs[0].state, 'partial');
  assert.deepStrictEqual(plugins.setSwitch('due', true).changed, [], 'switching on twice changes nothing');

  plugins.setSwitch('gruppo', true);
  assert.strictEqual(plugins.officialSwitches().packs[0].state, 'on');
  assert.throws(function () { plugins.setSwitch('mio', false); }, /non è un plugin o un pack ufficiale/);
  assert.throws(function () { plugins.setSwitch('nessuno', false); }, /non è un plugin o un pack ufficiale/);
});

test('panel routes: installed list, switch and restart (only when supervised)', async function () {
  const { app } = require('../server/index.js');
  const server = await new Promise(function (resolve) { const s = app.listen(0, '127.0.0.1', function () { resolve(s); }); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = async function (method, url, body, headers) {
    const res = await fetch(base + url, { method: method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || { 'x-dock-control': '1' }), body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json() };
  };
  try {
    const no = await call('GET', '/api/control/installed', null, { 'X-Dock-Token': 'SWITCH12' });
    assert.strictEqual(no.status, 403, 'the tablet cannot see or change it');
    const inst = (await call('GET', '/api/control/installed')).json.data;
    assert.deepStrictEqual(inst.packs.map(function (p) { return p.id; }), ['gruppo']);
    assert.deepStrictEqual(inst.market, []);
    assert.strictEqual(inst.canRestart, false);
    assert.match(inst.site, /^https:\/\/stefanodipatti\.github\.io\/vibe-deck\/$/);
    const sw = (await call('POST', '/api/control/plugins/switch', { id: 'solo', on: false })).json.data;
    assert.deepStrictEqual(sw, { id: 'solo', on: false, changed: ['solo'], restart: false });
    assert.strictEqual((await call('GET', '/api/control/installed')).json.data.plugins[0].on, false);
    await call('POST', '/api/control/plugins/switch', { id: 'solo', on: true });
    const rs = (await call('POST', '/api/control/restart', {})).json.data;
    assert.deepStrictEqual(rs, { restarting: false }, 'without the supervisor the dock does not exit');
  } finally {
    server.close();
    try { require('../server/platform').shutdown(); } catch (e) { }
  }
});
