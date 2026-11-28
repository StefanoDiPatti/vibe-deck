const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-perm-'));
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.DOCK_PLUGINS_DIR = path.join(tmp, 'plugins');
process.env.DOCK_CLAUDE_SETTINGS = path.join(tmp, 'claude', 'settings.json');
process.env.DOCK_TOKEN = 'TESTCODE';
process.env.LOG_LEVEL = 'error';
fs.mkdirSync(process.env.DOCK_CONFIG_DIR, { recursive: true });

const { app } = require('../server/index.js');
const events = require('../server/events');
const webhooks = require('../server/webhooks');
const hooks = require('../server/claude-hooks');
const { PermissionBroker, summarize } = require('../server/permissions');
const media = require('../server/services/media');
const appsService = require('../server/services/apps');
const system = require('../server/services/system');

media.nowPlaying = async function () { return { supported: false, active: false }; };
appsService.running = async function () { return {}; };

let server;
let base;
let port;
test.before(function () {
  return new Promise(function (resolve) {
    server = app.listen(0, '127.0.0.1', function () {
      port = server.address().port;
      base = 'http://127.0.0.1:' + port;
      fs.mkdirSync(process.env.DOCK_DATA_DIR, { recursive: true });
      fs.writeFileSync(path.join(process.env.DOCK_DATA_DIR, 'runtime.json'), JSON.stringify({ urls: [base] }));
      resolve();
    });
  });
});
test.after(function () {
  server.close();
  system.stop();
  require('../server/platform').shutdown();
});

async function call(method, url, body, headers) {
  const res = await fetch(base + url, { method: method, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Dock-Token': 'TESTCODE' }, headers || {}), body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() };
}

function runHook(kind, input) {
  return new Promise(function (resolve) {
    const p = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'claude-hook.js'), kind], { env: process.env });
    let out = '';
    p.stdout.on('data', function (d) { out += d; });
    p.on('close', function (code) { resolve({ code: code, out: out }); });
    p.stdin.end(JSON.stringify(input));
  });
}

test('riassunto: comando, file, oppure JSON troncato', function () {
  assert.strictEqual(summarize('Bash', { command: 'ls -la' }), 'ls -la');
  assert.strictEqual(summarize('Edit', { file_path: '/a/b.js' }), '/a/b.js');
  assert.ok(summarize('X', { a: 'x'.repeat(1000) }).length <= 300);
  assert.strictEqual(summarize('X', {}), '');
});

test('broker: consenti, nega, scadenza e risposte non valide', async function () {
  const bus = new events.EventBus();
  const b = new PermissionBroker(bus);
  const one = b.request({ tool_name: 'Bash', tool_input: { command: 'rm x' }, cwd: '/home/u/progetto' });
  const ev = bus.queue[0];
  assert.strictEqual(ev.type, 'permission');
  assert.strictEqual(ev.title, 'Bash · progetto');
  assert.strictEqual(b.list().length, 1);
  assert.throws(function () { b.answer(ev.permId, 'forse'); }, /non valida/);
  b.answer(ev.permId, 'allow');
  assert.deepStrictEqual(await one, { decision: 'allow' });
  assert.throws(function () { b.answer(ev.permId, 'deny'); }, /scaduta/);
  const two = b.request({ tool_name: 'Edit' }, 20);
  assert.deepStrictEqual(await two, { decision: 'none' });
  assert.strictEqual(b.list().length, 0);
});

test('hook: il tablet consente, nega, e senza risposta non stampa nulla', async function () {
  const key = webhooks.key();
  assert.ok(key);
  const wait = function (n) { return new Promise(function (r) { setTimeout(r, n); }); };
  async function decide(decision) {
    const before = events.bus.seq;
    const run = runHook('permission', { tool_name: 'Bash', tool_input: { command: 'echo' }, cwd: '/x/demo' });
    let ev;
    for (let i = 0; i < 100 && !ev; i++) { await wait(30); ev = events.bus.since(before).filter(function (e) { return e.type === 'permission'; })[0]; }
    assert.ok(ev, 'richiesta arrivata');
    const state = await call('GET', '/api/state?ev=' + before);
    assert.ok(state.json.data.events.some(function (e) { return e.type === 'permission' && e.permId === ev.permId && e.summary === 'echo'; }));
    assert.strictEqual((await call('GET', '/api/permissions')).json.data.length, 1);
    await call('POST', '/api/permissions/' + ev.permId, { decision: decision });
    return run;
  }
  const allow = await decide('allow');
  assert.strictEqual(JSON.parse(allow.out).hookSpecificOutput.decision.behavior, 'allow');
  const deny = await decide('deny');
  const out = JSON.parse(deny.out).hookSpecificOutput;
  assert.strictEqual(out.hookEventName, 'PermissionRequest');
  assert.strictEqual(out.decision.behavior, 'deny');
  assert.ok(out.decision.message);
  assert.strictEqual((await call('POST', '/api/permissions/nessuna', { decision: 'allow' })).status, 404);
});

test('hook: senza risposta entro il tempo, nessun output (decide il PC)', async function () {
  const key = webhooks.key();
  const res = await fetch(base + '/hook/' + key + '/permission?wait=60', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool_name: 'Bash' }) });
  assert.strictEqual((await res.json()).data.decision, 'none');
});

test('hook: gli eventi "waiting" e "done" arrivano sul bus', async function () {
  const before = events.bus.seq;
  await runHook('waiting', { session_id: 's1', message: 'serve input' });
  await runHook('done', { session_id: 's1' });
  const names = events.bus.since(before).filter(function (e) { return e.type === 'event'; }).map(function (e) { return e.name; });
  assert.deepStrictEqual(names, ['claude-waiting', 'claude-done']);
});

test('installazione: unisce senza toccare altro, copia di sicurezza, rimozione pulita', function () {
  const file = process.env.DOCK_CLAUDE_SETTINGS;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const original = { model: 'opus', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo mio' }] }] } };
  fs.writeFileSync(file, JSON.stringify(original));
  assert.strictEqual(hooks.status().installed, false);
  const s = hooks.install();
  assert.strictEqual(s.installed, true);
  hooks.install();
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(data.model, 'opus');
  assert.strictEqual(data.hooks.Stop.length, 2, 'il gancio dell\'utente resta, il nostro non si duplica');
  assert.ok(data.hooks.PermissionRequest[0].hooks[0].command.indexOf('claude-hook.js" permission') > 0);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(file + '.vibe-deck.bak', 'utf8')), original);
  const gone = hooks.uninstall();
  assert.strictEqual(gone.installed, false);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), original);
});

test('installazione: un settings.json non valido non viene toccato', function () {
  const file = process.env.DOCK_CLAUDE_SETTINGS;
  fs.writeFileSync(file, '{ rotto');
  assert.throws(function () { hooks.install(); }, /non è un JSON valido/);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), '{ rotto');
  fs.unlinkSync(file);
  fs.unlinkSync(file + '.vibe-deck.bak');
});

test('API del pannello: stato e collegamento', async function () {
  const c = { 'X-Dock-Control': '1' };
  assert.strictEqual((await call('GET', '/api/control/claude-hooks', null, c)).json.data.installed, false);
  assert.strictEqual((await call('POST', '/api/control/claude-hooks/install', null, c)).json.data.installed, true);
  assert.strictEqual((await call('POST', '/api/control/claude-hooks/remove', null, c)).json.data.installed, false);
});
