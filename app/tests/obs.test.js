const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-obs-'));
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.LOG_LEVEL = 'error';

const { FakeObs } = require('./fake-obs');
const { Obs, clock } = require('../official-plugins/obs/lib/obs');
const { authString } = require('../official-plugins/obs/lib/obs-socket');
const secrets = require('../server/secrets');

function client(file) { return new Obs({ secrets: secrets, file: path.join(tmp, file) }); }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

test('auth string follows obs-websocket v5', function () {
  const sha = function (s) { return require('crypto').createHash('sha256').update(s).digest('base64'); };
  assert.strictEqual(authString('pw', 'salt', 'ch'), sha(sha('pwsalt') + 'ch'));
  assert.strictEqual(clock(3723000), '1:02:03');
  assert.strictEqual(clock(65000), '1:05');
});

test('not configured: the tablet is told to connect OBS from the panel', async function () {
  const o = client('none.json');
  assert.deepStrictEqual(await o.state(), { status: 'setup', message: '' });
  await assert.rejects(o.stream('start'), /pannello/);
  o.stop();
});

test('connects with the password (saved encrypted) and reads scenes, audio, live, record and stats', async function () {
  const fake = await new FakeObs('segreta').listen();
  const o = client('obs.json');
  try {
    await o.save('127.0.0.1', fake.port, 'segreta');
    assert.ok(!fs.readFileSync(path.join(tmp, 'obs.json'), 'utf8').includes('segreta'), 'password not in clear text');
    const s = await o.state();
    assert.strictEqual(s.status, 'ready');
    assert.deepStrictEqual(s.scenes, ['Cam', 'Gioco', 'Pausa'], 'in the same order as in OBS');
    assert.strictEqual(s.scene, 'Gioco');
    assert.deepStrictEqual(s.inputs.map(function (i) { return i.name; }), ['Mic/Aux', 'Audio del desktop'], 'audio sources only');
    assert.strictEqual(s.stream.active, false);
    assert.deepStrictEqual(s.stats, { fps: 60, cpu: 4, renderSkipped: 0, outputSkipped: 3 });
    assert.deepStrictEqual(o.panelInfo(), { status: 'ready', message: '', host: '127.0.0.1', port: fake.port, hasPassword: true, configured: true });
  } finally { o.stop(); fake.close(); }
});

test('commands: live, record, scene (with the event), mute, virtual cam, preview, OBS errors', async function () {
  const fake = await new FakeObs('').listen();
  const o = client('obs2.json');
  try {
    await o.save('127.0.0.1', fake.port, '');
    assert.strictEqual((await o.stream('start')).message, 'Diretta avviata');
    let s = await o.state();
    assert.strictEqual(s.stream.active, true);
    assert.strictEqual(s.stream.time, '1:05');
    await assert.rejects(o.stream('start'), /already active/);
    await o.record('toggle');
    assert.strictEqual((await o.state()).record.active, true);
    await o.scene('Cam');
    assert.strictEqual((await o.state()).scene, 'Cam');
    fake.handle('SetCurrentProgramScene', { sceneName: 'Pausa' });
    await wait(100);
    assert.strictEqual(o.live.scene, 'Pausa', 'scene changes made in OBS arrive as events');
    assert.strictEqual((await o.mute('Mic/Aux')).muted, true);
    assert.strictEqual((await o.state()).inputs[0].muted, true);
    await o.virtualcam();
    assert.strictEqual((await o.state()).virtualcam, true);
    assert.match((await o.preview(320)).image, /^data:image\/jpeg;base64,/);
    await assert.rejects(o.replay(), /Replay buffer is not active/);
    await assert.rejects(o.scene('Non esiste'), /No source/);
    await assert.rejects(o.stream('boh'), function (e) { return e.code === 'BAD_REQUEST'; });
    assert.ok(fake.requests.indexOf('GetSourceScreenshot') >= 0);
  } finally { o.stop(); fake.close(); }
});

test('wrong password and OBS closed are told apart', async function () {
  const fake = await new FakeObs('giusta').listen();
  const o = client('obs3.json');
  try {
    await o.save('127.0.0.1', fake.port, 'sbagliata');
    let s = await o.state();
    assert.strictEqual(s.status, 'auth');
    assert.match(s.message, /Password di OBS sbagliata/);
    fake.close();
    await o.save('127.0.0.1', fake.port, 'giusta');
    s = await o.state();
    assert.strictEqual(s.status, 'offline');
  } finally { o.stop(); fake.close(); }
  await assert.rejects(Promise.resolve().then(function () { return o.save('host con spazi', 1, ''); }), /non valido/);
});
