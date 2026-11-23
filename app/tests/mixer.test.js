const test = require('node:test');
const assert = require('node:assert');

process.env.DOCK_DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'dock-test-'));
process.env.LOG_LEVEL = 'error';
const lm = require('../server/platform/linux-mixer');

const vol = function (l, r) { return { 'front-left': { value_percent: l + '%' }, 'front-right': { value_percent: r + '%' } }; };

test('Linux: uscite, microfoni (senza i "monitor") e app da pactl', function () {
  const m = lm._parse(
    [{ index: 1, name: 'alsa_output.hdmi', description: 'Monitor HDMI', volume: vol(40, 60), mute: false },
      { index: 2, name: 'bluez_output.cuffie', description: 'Cuffie', volume: vol(80, 80), mute: true }],
    [{ index: 3, name: 'alsa_output.hdmi.monitor', description: 'Monitor of HDMI', volume: vol(100, 100) },
      { index: 4, name: 'alsa_input.usb', description: 'Microfono USB', volume: vol(30, 30), mute: false }],
    [{ index: 77, sink: 2, mute: false, corked: false, volume: vol(50, 50), properties: { 'application.name': 'Firefox', 'application.process.id': '1234', 'application.process.binary': 'firefox' } }],
    'bluez_output.cuffie', 'alsa_input.usb');
  assert.deepStrictEqual(m.devices.map(function (d) { return d.flow + ':' + d.name + ':' + d.volume + (d.default ? '*' : ''); }),
    ['out:Monitor HDMI:50', 'out:Cuffie:80*', 'in:Microfono USB:30*']);
  assert.strictEqual(m.devices[1].mute, true);
  assert.deepStrictEqual(m.apps[0], { id: '77', pid: 1234, process: 'firefox', name: 'Firefox', volume: 50, mute: false, active: true, device: 'Cuffie' });
});

test('API audio: richiedono il token e rifiutano richieste senza modifiche', async function () {
  process.env.DOCK_TOKEN = 'TESTCODE';
  const { app } = require('../server/index.js');
  const server = await new Promise(function (resolve) { const s = app.listen(0, '127.0.0.1', function () { resolve(s); }); });
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    assert.strictEqual((await fetch(base + '/api/audio')).status, 401);
    const r = await fetch(base + '/api/audio/app', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dock-Token': 'TESTCODE' }, body: JSON.stringify({ id: 'non-esiste', volume: 50 }) });
    assert.ok(r.status >= 400);
  } finally {
    server.close();
    require('../server/platform').shutdown();
  }
});
