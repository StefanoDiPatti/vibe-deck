const test = require('node:test');
const assert = require('node:assert');

process.env.DOCK_TOKEN = 'TESTCODE';
process.env.LOG_LEVEL = 'error';
const { app } = require('../server/index.js');

let server;
let base;

test.before(function () {
  return new Promise(function (resolve) {
    server = app.listen(0, '127.0.0.1', function () {
      base = 'http://127.0.0.1:' + server.address().port;
      resolve();
    });
  });
});
test.after(function () { server.close(); });

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['X-Dock-Token'] = token;
  const res = await fetch(base + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  let json = null;
  try { json = await res.json(); } catch (e) { json = null; }
  return { status: res.status, json: json, headers: res.headers };
}

test('health è pubblico e dice se il dispositivo è associato', async function () {
  const r = await call('GET', '/api/health');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.data.paired, false);
});

test('senza token le API rispondono 401', async function () {
  const r = await call('GET', '/api/config');
  assert.strictEqual(r.status, 401);
  assert.strictEqual(r.json.error.code, 'UNAUTHORIZED');
});

test('pairing: codice errato rifiutato, codice giusto imposta il cookie', async function () {
  const bad = await call('POST', '/api/pair', { token: 'SBAGLIATO' });
  assert.strictEqual(bad.status, 401);
  const good = await call('POST', '/api/pair', { token: 'TESTCODE' });
  assert.strictEqual(good.status, 200);
  assert.match(good.headers.get('set-cookie'), /dock_token=TESTCODE/);
});

test('/?t=CODICE salva il cookie e ripulisce l\'URL', async function () {
  const r = await call('GET', '/?t=TESTCODE');
  assert.strictEqual(r.status, 302);
  assert.match(r.headers.get('set-cookie') || '', /dock_token=TESTCODE/);
  assert.strictEqual(r.headers.get('location'), '/#codice=TESTCODE');
  const bad = await call('GET', '/?t=SBAGLIATO');
  assert.strictEqual(bad.status, 302);
  assert.strictEqual(bad.headers.get('location'), '/');
  assert.ok(!bad.headers.get('set-cookie'));
});

test('config con token', async function () {
  const r = await call('GET', '/api/config', null, 'TESTCODE');
  assert.strictEqual(r.status, 200);
  assert.ok(r.json.data.dock.pages.length > 0);
  assert.ok(r.json.data.version);
});

test('press: pulsante inesistente e versione vecchia', async function () {
  const missing = await call('POST', '/api/press', { page: 'main', tile: 'nessuno' }, 'TESTCODE');
  assert.strictEqual(missing.status, 409);
  const old = await call('POST', '/api/press', { page: 'main', tile: 'main-0', version: 'vecchia' }, 'TESTCODE');
  assert.strictEqual(old.json.error.code, 'CONFIG_CHANGED');
  const bad = await call('POST', '/api/press', { page: 1 }, 'TESTCODE');
  assert.strictEqual(bad.status, 400);
});

test('media: comando non valido rifiutato', async function () {
  const r = await call('POST', '/api/media', { command: 'shutdown' }, 'TESTCODE');
  assert.strictEqual(r.json.ok, false);
});

test('github/open accetta solo repository noti', async function () {
  const r = await call('POST', '/api/github/open', { repo: 'evil/repo' }, 'TESTCODE');
  assert.strictEqual(r.status, 404);
});

test('endpoint inesistente', async function () {
  const r = await call('GET', '/api/boh', null, 'TESTCODE');
  assert.strictEqual(r.status, 404);
});

test('la pagina del tablet è servita', async function () {
  const res = await fetch(base + '/');
  const html = await res.text();
  assert.match(html, /js\/app\.js/);
});
