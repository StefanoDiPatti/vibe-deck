const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-hooks-'));
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.DOCK_PLUGINS_DIR = path.join(tmp, 'plugins');
process.env.DOCK_TOKEN = 'TESTCODE';
process.env.LOG_LEVEL = 'error';
fs.mkdirSync(process.env.DOCK_CONFIG_DIR, { recursive: true });

const { app } = require('../server/index.js');
const events = require('../server/events');
const webhooks = require('../server/webhooks');
const { sources } = require('../server/shapes/sources');
const media = require('../server/services/media');
const appsService = require('../server/services/apps');
const system = require('../server/services/system');

media.nowPlaying = async function () { return { supported: false, active: false }; };
appsService.running = async function () { return {}; };

let server;
let base;
test.before(function () {
  return new Promise(function (resolve) {
    server = app.listen(0, '127.0.0.1', function () { base = 'http://127.0.0.1:' + server.address().port; resolve(); });
  });
});
test.after(function () {
  server.close();
  system.stop();
  require('../server/platform').shutdown();
});

async function call(method, url, body, headers) {
  const res = await fetch(base + url, { method: method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}), body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch (e) { json = null; }
  return { status: res.status, json: json };
}

test('bus: numero progressivo, eventi recenti e ascoltatori', function () {
  const bus = new events.EventBus();
  const seen = [];
  const off = bus.subscribe(function (e) { seen.push(e.type); });
  bus.publish('a', { x: 1 });
  bus.publish('notify', { message: 'ciao' });
  off();
  bus.publish('b');
  assert.deepStrictEqual(seen, ['a', 'notify']);
  assert.strictEqual(bus.since(1).length, 2);
  assert.strictEqual(events.forTablet(bus, undefined).list.length, 0, 'senza ev non si rivede il passato');
  assert.deepStrictEqual(events.forTablet(bus, 0).list.map(function (e) { return e.type; }), ['notify']);
});

test('chiave sbagliata: 404; giusta: ok', async function () {
  const bad = await call('POST', '/hook/sbagliata/notify', { message: 'x' });
  assert.strictEqual(bad.status, 404);
  const key = webhooks.key();
  const good = await call('POST', '/hook/' + key + '/notify', { title: 'Claude', message: 'ti aspetta', kind: 'ok' });
  assert.strictEqual(good.status, 200);
  assert.strictEqual(good.json.data.title, 'Claude');
});

test('notifica: arriva al tablet via /api/state con ev', async function () {
  const key = webhooks.key();
  const first = await call('GET', '/api/state', null, { 'X-Dock-Token': 'TESTCODE' });
  const seq = first.json.data.evSeq;
  assert.deepStrictEqual(first.json.data.events, []);
  await call('GET', '/hook/' + key + '/notify?message=Ciao%20tablet');
  const next = await call('GET', '/api/state?ev=' + seq, null, { 'X-Dock-Token': 'TESTCODE' });
  assert.strictEqual(next.json.data.events.length, 1);
  assert.strictEqual(next.json.data.events[0].message, 'Ciao tablet');
  const again = await call('GET', '/api/state?ev=' + next.json.data.evSeq, null, { 'X-Dock-Token': 'TESTCODE' });
  assert.strictEqual(again.json.data.events.length, 0);
});

test('notifica senza testo: errore chiaro', async function () {
  const r = await call('POST', '/hook/' + webhooks.key() + '/notify', {});
  assert.strictEqual(r.status, 400);
});

test('cambio pagina: solo pagine esistenti', async function () {
  const key = webhooks.key();
  const bad = await call('POST', '/hook/' + key + '/goto/non-esiste');
  assert.strictEqual(bad.status, 400);
  const page = require('../server/config').dock().pages[0].id;
  const good = await call('POST', '/hook/' + key + '/goto/' + page);
  assert.strictEqual(good.status, 200);
  assert.ok(events.bus.queue.some(function (e) { return e.type === 'goto' && e.page === page; }));
});

test('valore inviato: corpo JSON, query, lettura dalla fonte "push", nome non valido', async function () {
  const key = webhooks.key();
  const a = await call('POST', '/hook/' + key + '/push/caldaia', { value: 42, unit: 'C' });
  assert.strictEqual(a.status, 200);
  const q = await call('GET', '/hook/' + key + '/push/stanza?temp=21.5&nome=salotto');
  assert.strictEqual(q.status, 200);
  const src = sources.get('push');
  const read = await src.read({ type: 'push', name: 'caldaia' });
  assert.strictEqual(read.value, 42);
  assert.strictEqual(read.received, true);
  const room = await src.read({ type: 'push', name: 'stanza' });
  assert.strictEqual(room.temp, 21.5);
  assert.strictEqual(room.nome, 'salotto');
  const none = await src.read({ type: 'push', name: 'mai' });
  assert.strictEqual(none.received, false);
  const bad = await call('POST', '/hook/' + key + '/push/Nome%20Brutto', { value: 1 });
  assert.strictEqual(bad.status, 400);
  const empty = await call('POST', '/hook/' + key + '/push/vuoto');
  assert.strictEqual(empty.status, 400);
  assert.deepStrictEqual(src.validate({ name: 'ok_1' }), []);
  assert.strictEqual(src.validate({ name: 'No No' }).length, 1);
});

test('valori persistono su disco e il pannello li elenca; cambio chiave invalida la vecchia', async function () {
  const key = webhooks.key();
  assert.ok(fs.existsSync(path.join(process.env.DOCK_DATA_DIR, 'push.json')));
  const info = await call('GET', '/api/control/webhooks', null, { 'X-Dock-Control': '1' });
  assert.strictEqual(info.status, 200);
  assert.ok(info.json.data.values.some(function (v) { return v.name === 'caldaia'; }));
  assert.match(info.json.data.notify, /\/hook\/[0-9a-f]+\/notify$/);
  const rot = await call('POST', '/api/control/webhooks/rotate', null, { 'X-Dock-Control': '1' });
  assert.notStrictEqual(rot.json.data.key, key);
  const old = await call('POST', '/hook/' + key + '/notify', { message: 'x' });
  assert.strictEqual(old.status, 404);
  const forget = await call('POST', '/api/control/webhooks/forget', { name: 'caldaia' }, { 'X-Dock-Control': '1' });
  assert.ok(!forget.json.data.values.some(function (v) { return v.name === 'caldaia'; }));
});

test('senza intestazione del pannello le API di controllo restano chiuse', async function () {
  const r = await call('GET', '/api/control/webhooks');
  assert.strictEqual(r.status, 403);
});
