const test = require('node:test');
const assert = require('node:assert');

process.env.DOCK_TOKEN = 'TESTCODE';
process.env.DOCK_DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'dock-test-'));
process.env.LOG_LEVEL = 'error';
const config = require('../server/config');
const discord = require('../official-plugins/discord/lib/discord');
const { DiscordIpc, encode, OP } = require('../official-plugins/discord/lib/discord-ipc');
const { app } = require('../server/index.js');

const RAW = {
  home: 'main',
  pages: [
    { id: 'main', tiles: [] },
    { id: 'media', tiles: [] },
    { id: 'apps', tiles: [] },
    { id: 'blender', tab: false, tiles: [] }
  ]
};

test('layout: ordine, pagine nascoste e pagina iniziale', function () {
  const d = config.normalizeDock(RAW, { tabs: ['blender', 'main', 'nonesiste', 'main'], home: 'blender' });
  assert.deepStrictEqual(d.pages.map(function (p) { return p.id + (p.tab ? '*' : ''); }), ['blender*', 'main*', 'media', 'apps']);
  assert.strictEqual(d.home, 'blender');
});

test('layout vuoto o assente: valgono i "tab" di dock.json', function () {
  const d = config.normalizeDock(RAW, {});
  assert.deepStrictEqual(d.pages.filter(function (p) { return p.tab; }).map(function (p) { return p.id; }), ['main', 'media', 'apps']);
  const e = config.normalizeDock(RAW, { tabs: ['xyz'] });
  assert.strictEqual(e.pages.filter(function (p) { return p.tab; }).length, 3);
});

test('il plugin discord porta la pagina Discord, fuori dalla barra', function () {
  const page = config.parseJson(require('fs').readFileSync(require('path').join(__dirname, '..', 'official-plugins', 'discord', 'pages', 'discord.json'), 'utf8'));
  const d = config.normalizeDock({ pages: [Object.assign({}, page, { tab: page.tab === true })] }, {});
  const p = d.pages.filter(function (x) { return x.id === 'discord'; })[0];
  assert.ok(p, 'pagina discord');
  assert.strictEqual(p.tab, false);
  assert.ok(p.description);
});

let server, base;
test.before(function () {
  return new Promise(function (resolve) {
    server = app.listen(0, '127.0.0.1', function () { base = 'http://127.0.0.1:' + server.address().port; resolve(); });
  });
});
test.after(function () { server.close(); });

async function call(method, path, body, headers) {
  const res = await fetch(base + path, {
    method: method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { json = null; }
  return { status: res.status, json: json, text: text };
}

test('pannello: la pagina si apre da questo PC', async function () {
  const r = await call('GET', '/control');
  assert.strictEqual(r.status, 200);
  assert.ok(r.text.indexOf('Pagine del tablet') > 0);
});

test('pannello: senza X-Dock-Control le API sono rifiutate (anche col token)', async function () {
  const r = await call('GET', '/api/control/info', null, { 'X-Dock-Token': 'TESTCODE' });
  assert.strictEqual(r.status, 403);
  const w = await call('POST', '/api/control/layout', { tabs: ['main'] });
  assert.strictEqual(w.status, 403);
});

test('pannello: elenco pagine e layout non valido rifiutato', async function () {
  const h = { 'X-Dock-Control': '1' };
  const r = await call('GET', '/api/control/info', null, h);
  assert.strictEqual(r.status, 200);
  assert.ok(r.json.data.pages.length >= 3);
  assert.ok(r.json.data.tabs.length >= 1);
  assert.ok(['setup', 'offline', 'unauthorized', 'connecting', 'ready'].indexOf(r.json.data.discord.status) >= 0);
  const bad = await call('POST', '/api/control/layout', { tabs: [] }, h);
  assert.strictEqual(bad.status, 400);
});

test('discord: le API del tablet chiedono il token', async function () {
  const r = await call('GET', '/api/plugins/discord/state');
  assert.strictEqual(r.status, 401);
  const ok = await call('GET', '/api/plugins/discord/state', null, { 'X-Dock-Token': 'TESTCODE' });
  assert.strictEqual(ok.status, 200);
});

test('discord: membri della stanza e immagini solo dal CDN di Discord', function () {
  const m = discord._member({ nick: 'Pippo', mute: true, volume: 80, user: { id: '80351110224678912', username: 'pippo', avatar: 'abc123' }, voice_state: { self_mute: true, deaf: false } });
  assert.strictEqual(m.name, 'Pippo');
  assert.strictEqual(m.mute, true);
  assert.strictEqual(m.deaf, false);
  assert.strictEqual(m.localMute, true);
  assert.strictEqual(m.avatar, '/api/plugins/discord/img?p=' + encodeURIComponent('/avatars/80351110224678912/abc123.png'));
  assert.strictEqual(discord._img('https://evil.example/x.png'), null);
  return discord.image('/../../etc/passwd.png').then(function () { assert.fail('doveva rifiutare'); }, function (e) { assert.strictEqual(e.code, 'BAD_REQUEST'); });
});

test('discord: messaggi RPC spezzati in più pezzi vengono ricomposti', async function () {
  const ipc = new DiscordIpc();
  ipc.closed = false;
  ipc.socket = { write: function () {}, destroy: function () {} };
  const p = ipc.request('GET_GUILDS');
  const nonce = Array.from(ipc.pending.keys())[0];
  const frame = encode(OP.FRAME, { cmd: 'GET_GUILDS', nonce: nonce, data: { guilds: [{ id: '1', name: 'Server' }] } });
  ipc.onData(frame.slice(0, 5));
  ipc.onData(frame.slice(5, 20));
  ipc.onData(frame.slice(20));
  const data = await p;
  assert.strictEqual(data.guilds[0].name, 'Server');

  const err = ipc.request('SET_VOICE_SETTINGS', { mute: true });
  const n2 = Array.from(ipc.pending.keys())[0];
  ipc.onData(encode(OP.FRAME, { cmd: 'SET_VOICE_SETTINGS', evt: 'ERROR', nonce: n2, data: { code: 4006, message: 'Not authenticated' } }));
  await assert.rejects(err, /Not authenticated/);
  ipc.close();
});

test('Discord: il volume di una persona arriva intero (Discord lo manda con i decimali)', function () {
  const discord = require('../official-plugins/discord/lib/discord');
  const m = discord._member({ nick: 'Pippo', volume: 99.99999237060547, user: { id: '1', username: 'pippo' }, voice_state: {} });
  assert.strictEqual(m.volume, 100);
  assert.strictEqual(discord._member({ volume: 149.6, user: { id: '2', username: 'b' }, voice_state: {} }).volume, 150);
});
