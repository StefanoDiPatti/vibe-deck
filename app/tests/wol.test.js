const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const wol = require('../official-plugins/wol/lib/wol');

function ctx() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-wol-'));
  return { dataDir: dir, ensureDataDir: function () { return dir; } };
}

test('pacchetto magico: 6 x FF poi 16 volte il MAC', function () {
  const p = wol.packet('00-1A-2B-3C-4D-5E');
  assert.strictEqual(p.length, 102);
  assert.ok(p.slice(0, 6).every(function (b) { return b === 0xff; }));
  for (let i = 0; i < 16; i++) assert.strictEqual(p.slice(6 + i * 6, 12 + i * 6).toString('hex'), '001a2b3c4d5e');
});

test('MAC: formati validi e non validi', function () {
  assert.strictEqual(wol.normalizeMac('AA-BB-CC-DD-EE-FF'), 'aa:bb:cc:dd:ee:ff');
  ['', 'zz:zz:zz:zz:zz:zz', '00:11:22:33:44', '00:11:22:33:44:55:66'].forEach(function (m) {
    assert.throws(function () { wol.normalizeMac(m); }, /MAC/);
  });
});

test('dispositivi: aggiungi, sostituisci per nome, togli, file rovinato', function () {
  const c = ctx();
  assert.deepStrictEqual(wol.list(c), []);
  wol.add(c, { name: 'Salotto', mac: '00:11:22:33:44:55' });
  wol.add(c, { name: 'Camera', mac: '00:11:22:33:44:66' });
  wol.add(c, { name: 'salotto', mac: '00:11:22:33:44:77' });
  assert.deepStrictEqual(wol.list(c).map(function (d) { return d.name + d.mac.slice(-2); }), ['Camera66', 'salotto77']);
  assert.throws(function () { wol.add(c, { name: '', mac: '00:11:22:33:44:55' }); }, /nome/);
  assert.throws(function () { wol.remove(c, 'Nessuno'); }, /non trovato/);
  wol.remove(c, 'Camera');
  assert.strictEqual(wol.list(c).length, 1);
  fs.writeFileSync(path.join(c.dataDir, 'devices.json'), '{ rotto');
  assert.deepStrictEqual(wol.list(c), []);
});

test('sveglia: per nome o per MAC, manda il pacchetto a più indirizzi di broadcast', async function () {
  const c = ctx();
  wol.add(c, { name: 'NAS', mac: '00:11:22:33:44:55' });
  const seen = [];
  const transport = async function (buf, targets) { seen.push({ buf: buf, targets: targets }); return targets.length; };
  const r = await wol.wake(c, 'nas', transport);
  assert.match(r.message, /NAS/);
  assert.ok(seen[0].targets.indexOf('255.255.255.255') >= 0);
  assert.strictEqual(seen[0].buf.length, 102);
  await wol.wake(c, 'aa:bb:cc:dd:ee:ff', transport);
  assert.strictEqual(seen[1].buf.slice(6, 12).toString('hex'), 'aabbccddeeff');
  await assert.rejects(wol.wake(c, '', transport), /Scegli/);
  await assert.rejects(wol.wake(c, 'sconosciuto', transport), /MAC/);
});

test('invio vero su UDP locale: il pacchetto arriva intero', async function () {
  const dgram = require('dgram');
  const server = dgram.createSocket('udp4');
  const got = new Promise(function (resolve) { server.on('message', resolve); });
  await new Promise(function (resolve) { server.bind(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  const sock = dgram.createSocket('udp4');
  await new Promise(function (resolve) { sock.send(wol.packet('00:11:22:33:44:55'), port, '127.0.0.1', resolve); });
  sock.close();
  const buf = await got;
  server.close();
  assert.strictEqual(buf.length, 102);
});
