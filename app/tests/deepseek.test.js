const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-deepseek-'));
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.LOG_LEVEL = 'error';

const { FakeDeepSeek } = require('./fake-deepseek');
const { DeepSeek, SessionStore, DEFAULT_SYSTEM } = require('../official-plugins/deepseek/lib/deepseek');
const { DeepSeekApi, SseParser } = require('../official-plugins/deepseek/lib/api');
const secrets = require('../server/secrets');

function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function service(fake, file) {
  return new DeepSeek({ secrets: secrets, file: path.join(tmp, file), apiFactory: function (key) { return new DeepSeekApi({ key: key, url: fake ? fake.url : 'http://127.0.0.1:9' }); } });
}
async function finished(ds, jobId) {
  for (let i = 0; i < 200; i++) {
    const j = ds.job(jobId);
    if (j.status !== 'running') return j;
    await wait(20);
  }
  throw new Error('job still running');
}

test('the SSE parser joins events split across chunks and skips [DONE]', function () {
  const seen = [];
  const p = new SseParser(function (e) { seen.push(e.n); });
  p.push('data: {"n":1}\n\ndata: {"n"');
  p.push(':2}\r\n\n: comment\ndata: [DONE]\n');
  assert.deepStrictEqual(seen, [1, 2]);
});

test('the session store forgets the oldest chat when full', function () {
  const s = new SessionStore(2);
  const a = s.create('m');
  const b = s.create('m');
  b.touched = a.touched + 10;
  s.create('m');
  assert.strictEqual(s.get(a.id), null);
  assert.ok(s.get(b.id));
});

test('without a key: setup status, the tablet is sent to the panel', async function () {
  const ds = service(null, 'none.json');
  assert.strictEqual(ds.panelInfo().status, 'setup');
  assert.strictEqual(ds.panelInfo().system, DEFAULT_SYSTEM);
  assert.deepStrictEqual(await ds.safeModels(), { configured: false, models: [], defaultModel: '', error: 'Inserisci la chiave API di DeepSeek nel pannello del PC' });
  assert.throws(function () { ds.send(null, '', 'ciao'); }, /pannello/);
});

test('saves the key encrypted, reads models and balance, a wrong key is reported', async function () {
  const fake = await new FakeDeepSeek('sk-giusta-123456').listen();
  try {
    const ds = service(fake, 'ds.json');
    let info = await ds.save({ key: 'sk-sbagliata-123', model: 'deepseek-v4-pro' });
    assert.strictEqual(info.status, 'error');
    assert.match(info.message, /non valida/);
    info = await ds.save({ key: 'sk-giusta-123456' });
    assert.ok(!fs.readFileSync(path.join(tmp, 'ds.json'), 'utf8').includes('sk-giusta'), 'key not in clear text');
    assert.strictEqual(info.status, 'ready');
    assert.strictEqual(info.model, 'deepseek-v4-pro', 'an empty key keeps the rest');
    assert.deepStrictEqual(info.models, ['deepseek-v4-flash', 'deepseek-v4-pro']);
    assert.deepStrictEqual(info.balance, { available: true, currency: 'USD', total: 4.2, granted: 0.2, toppedUp: 4 });
    assert.strictEqual(info.key, undefined, 'the key never leaves the server');
    assert.strictEqual((await ds.models()).defaultModel, 'deepseek-v4-pro');
    assert.throws(function () { ds.save({ key: 'corta' }); }, /sbagliata/);
    info = await ds.save({ removeKey: true });
    assert.strictEqual(info.status, 'setup');
  } finally { fake.close(); }
});

test('chat: the answer grows while it is written, the history goes back to DeepSeek', async function () {
  const fake = await new FakeDeepSeek().listen();
  try {
    const ds = service(fake, 'chat.json');
    await ds.save({ key: fake.key, system: 'Sii breve.' });
    fake.reply = 'uno due tre quattro cinque sei sette otto nove dieci';
    fake.delayMs = 25;
    fake.thinking = 'mmm';
    const r = ds.send(null, 'deepseek-v4-flash', 'conta');
    const partials = [];
    let j;
    do { await wait(30); j = ds.job(r.jobId); partials.push(j.text); } while (j.status === 'running');
    assert.strictEqual(j.status, 'done');
    assert.strictEqual(j.text, fake.reply);
    assert.ok(partials.some(function (t) { return t && t !== fake.reply; }), 'partial text seen while streaming');
    assert.deepStrictEqual(j.usage, { input: 12, output: 10 });
    fake.thinking = '';
    fake.delayMs = 1;
    fake.reply = 'Fatto.';
    assert.throws(function () { ds.send(r.sessionId, 'deepseek-v4-flash', '  '); }, /vuoto/);
    const r2 = ds.send(r.sessionId, 'deepseek-v4-flash', 'e adesso?');
    assert.strictEqual(r2.sessionId, r.sessionId);
    await finished(ds, r2.jobId);
    const last = fake.requests.filter(function (q) { return q.url === '/chat/completions'; }).pop().body;
    assert.strictEqual(last.stream, true);
    assert.deepStrictEqual(last.messages.map(function (m) { return m.role + ':' + m.content; }),
      ['system:Sii breve.', 'user:conta', 'assistant:' + 'uno due tre quattro cinque sei sette otto nove dieci', 'user:e adesso?']);
    const r3 = ds.send(r.sessionId, 'deepseek-v4-pro', 'cambio modello');
    assert.notStrictEqual(r3.sessionId, r.sessionId, 'another model starts a new chat');
    await finished(ds, r3.jobId);
  } finally { fake.close(); }
});

test('one answer at a time, stop keeps what was written, no credit is explained', async function () {
  const fake = await new FakeDeepSeek().listen();
  try {
    const ds = service(fake, 'stop.json');
    await ds.save({ key: fake.key });
    fake.reply = 'parola parola parola parola';
    fake.hold = true;
    const r = ds.send(null, '', 'ciao');
    assert.throws(function () { ds.send(r.sessionId, r.model, 'ancora'); }, /ancora rispondendo/);
    await wait(150);
    ds.stop(r.jobId);
    let j = await finished(ds, r.jobId);
    assert.strictEqual(j.status, 'done');
    assert.match(j.text, /\(fermata\)$/);
    fake.hold = false;
    fake.status = 402;
    const r2 = ds.send(r.sessionId, r.model, 'altro');
    j = await finished(ds, r2.jobId);
    assert.strictEqual(j.status, 'error');
    assert.match(j.error, /Credito DeepSeek esaurito/);
    fake.status = 200;
    const r3 = ds.send(r.sessionId, r.model, 'riprovo');
    await finished(ds, r3.jobId);
    const msgs = fake.requests.filter(function (q) { return q.url === '/chat/completions'; }).pop().body.messages;
    assert.deepStrictEqual(msgs.filter(function (m) { return m.role === 'user'; }).map(function (m) { return m.content; }), ['ciao', 'riprovo'], 'the failed message is not kept');
    assert.throws(function () { ds.job('nope'); }, /non trovata/);
  } finally { fake.close(); }
});

test('DeepSeek not reachable gives a clear message', async function () {
  const ds = service(null, 'off.json');
  const info = await ds.save({ key: 'sk-qualsiasi-123' });
  assert.strictEqual(info.status, 'error');
  assert.match(info.message, /Impossibile raggiungere DeepSeek/);
});

test('the plugin declares routes, panel, the balance connector and joins the developer pack', function () {
  const dir = path.join(__dirname, '..', 'official-plugins');
  const m = require(path.join(dir, 'deepseek', 'index.js'));
  assert.strictEqual(typeof m.routes, 'function');
  assert.strictEqual(typeof m.control.info, 'function');
  assert.deepStrictEqual(m.sources.balance.fields.map(function (f) { return f.path; }), ['total', 'currency', 'toppedUp', 'granted', 'available']);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'deepseek', 'plugin.json'), 'utf8'));
  assert.deepStrictEqual(manifest.permissions.http, ['api.deepseek.com']);
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'developer', 'plugin.json'), 'utf8')).includes.indexOf('deepseek') >= 0);
});
