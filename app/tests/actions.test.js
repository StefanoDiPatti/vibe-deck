const test = require('node:test');
const assert = require('node:assert');
const actions = require('../server/actions');

async function code(action) {
  try { await actions.execute(action); } catch (e) { return e.code || e.message; }
  return 'OK';
}

test('tipo di azione sconosciuto', async function () {
  assert.strictEqual(await code({ type: 'rm_rf' }), 'UNKNOWN_ACTION');
  assert.strictEqual(await code(null), 'BAD_CONFIG');
});

test('app non definita', async function () {
  assert.strictEqual(await code({ type: 'launch', app: 'non-esiste' }), 'NOT_FOUND');
});

test('comando non nella whitelist', async function () {
  assert.strictEqual(await code({ type: 'command', id: 'format_c' }), 'NOT_FOUND');
});

test('URL con protocollo non consentito', async function () {
  assert.strictEqual(await code({ type: 'open_url', url: 'file:///C:/Windows/system32/calc.exe' }), 'BAD_CONFIG');
  assert.strictEqual(await code({ type: 'open_url', url: 'javascript:alert(1)' }), 'BAD_CONFIG');
});

test('macro: vuote, troppo lunghe o annidate vengono rifiutate', async function () {
  assert.strictEqual(await code({ type: 'macro', steps: [] }), 'BAD_CONFIG');
  const long = [];
  for (let i = 0; i < 51; i++) long.push({ type: 'wait', ms: 0 });
  assert.strictEqual(await code({ type: 'macro', steps: long }), 'BAD_CONFIG');
  assert.strictEqual(await code({ type: 'macro', steps: [{ type: 'macro', steps: [] }] }), 'BAD_CONFIG');
});

test('macro con soli wait funziona e rispetta il limite di attesa', async function () {
  const t = Date.now();
  assert.strictEqual(await code({ type: 'macro', steps: [{ type: 'wait', ms: 20 }, { type: 'wait', ms: 20 }] }), 'OK');
  assert.ok(Date.now() - t >= 35);
});

test('scorciatoia con tasto inesistente non arriva al sistema', async function () {
  const r = await code({ type: 'hotkey', keys: ['CTRL', 'NOPE'] });
  assert.match(r, /Tasto sconosciuto/);
});

test('press con pulsante inesistente', async function () {
  assert.strictEqual(await (actions.press('main', 'nessuno').catch(function (e) { return e.code; })), 'CONFIG_CHANGED');
});

test('varianti per sistema operativo', function () {
  const entry = { label: 'X', windows: { path: 'a.exe' }, linux: { path: '/usr/bin/a' } };
  const picked = actions.forPlatform(entry);
  assert.strictEqual(picked.path, process.platform === 'win32' ? 'a.exe' : '/usr/bin/a');
  assert.strictEqual(actions.forPlatform({ windows: { path: 'only.exe' } }) === null, process.platform !== 'win32');
});
