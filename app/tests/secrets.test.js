const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-secrets-'));
process.env.DOCK_DATA_DIR = DIR;
process.env.DOCK_KEYSTORE = 'file';
const secrets = require('../server/secrets');
const env = require('../server/env');

test('cifra e decifra; ogni cifratura è diversa', function () {
  const a = secrets.encrypt('password-segreta');
  const b = secrets.encrypt('password-segreta');
  assert.ok(secrets.isEncrypted(a) && a !== b);
  assert.ok(a.indexOf('password') < 0);
  assert.strictEqual(secrets.decrypt(a), 'password-segreta');
  assert.strictEqual(secrets.decrypt('in chiaro'), 'in chiaro');
  assert.strictEqual(secrets.info().store, 'file');
  const marker = JSON.parse(fs.readFileSync(path.join(DIR, 'secret-key.json'), 'utf8'));
  assert.strictEqual(marker.store, 'file');
});

test('dati manomessi o con un\'altra chiave: errore, niente dati sbagliati', function () {
  const s = secrets.encrypt('ciao');
  const raw = Buffer.from(s.slice(secrets.PREFIX.length), 'base64');
  raw[raw.length - 1] ^= 1;
  assert.throws(function () { secrets.decrypt(secrets.PREFIX + raw.toString('base64')); }, /altra chiave o danneggiati/);
});

test('file JSON: quelli in chiaro vengono cifrati alla prima lettura', function () {
  const file = path.join(DIR, 'prova.json');
  fs.writeFileSync(file, JSON.stringify({ accounts: [{ email: 'a@b.it', pass: 'segreta123' }] }));
  const data = secrets.loadJson(file);
  assert.strictEqual(data.accounts[0].pass, 'segreta123');
  const onDisk = fs.readFileSync(file, 'utf8');
  assert.ok(onDisk.indexOf('segreta123') < 0 && onDisk.indexOf('a@b.it') < 0, 'niente in chiaro su disco');
  assert.deepStrictEqual(secrets.readJson(file), { data: data, plain: false });
  if (process.platform !== 'win32') assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
});

test('file non decifrabile: messo da parte, il servizio riparte vuoto', function () {
  const file = path.join(DIR, 'rotto.json');
  fs.writeFileSync(file, JSON.stringify({ encrypted: secrets.PREFIX + Buffer.alloc(40).toString('base64') }));
  assert.strictEqual(secrets.loadJson(file), null);
  assert.ok(fs.existsSync(file + '.illeggibile') && !fs.existsSync(file));
});

test('.env: token e chiavi cifrati nel file, DOCK_TOKEN e il resto restano leggibili', function () {
  const file = path.join(DIR, '.env');
  fs.writeFileSync(file, '# commento\nPORT=8787\nDOCK_TOKEN=ABCD2345\nGITHUB_TOKEN=ghp_segretissimo\nANTHROPIC_API_KEY="sk-ant-xyz"\nOLLAMA_URL=\nLOG_LEVEL=info\n');
  delete process.env.GITHUB_TOKEN; delete process.env.ANTHROPIC_API_KEY;
  env.loadEnv(file);
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.indexOf('ghp_segretissimo') < 0 && text.indexOf('sk-ant-xyz') < 0);
  assert.ok(/GITHUB_TOKEN=enc:v1:/.test(text) && /ANTHROPIC_API_KEY=enc:v1:/.test(text));
  assert.ok(/DOCK_TOKEN=ABCD2345/.test(text) && /# commento/.test(text) && /OLLAMA_URL=\n/.test(text));
  assert.strictEqual(process.env.GITHUB_TOKEN, 'ghp_segretissimo');
  assert.strictEqual(process.env.ANTHROPIC_API_KEY, 'sk-ant-xyz');
  assert.deepStrictEqual(env.sealEnv(file), []);
  assert.ok(env.isSecretKey('GITHUB_TOKEN') && env.isSecretKey('CLIENT_SECRET') && !env.isSecretKey('DOCK_TOKEN') && !env.isSecretKey('PORT'));
});
