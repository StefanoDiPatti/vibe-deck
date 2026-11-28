const test = require('node:test');
const assert = require('node:assert');

const { HomeAssistant, webhook, describe, cleanUrl } = require('../official-plugins/homeassistant/lib/ha');

const STATES = [
  { entity_id: 'light.salotto', state: 'on', attributes: { friendly_name: 'Luce salotto' } },
  { entity_id: 'sensor.temp', state: '21.5', attributes: { friendly_name: 'Temperatura', unit_of_measurement: '°C' } },
  { entity_id: 'lock.porta', state: 'locked', attributes: { friendly_name: 'Porta' } },
  { entity_id: 'scene.cena', state: 'scening', attributes: { friendly_name: 'Cena' } }
];

function makeClient(calls, status) {
  const store = { data: null };
  const secrets = { loadJson: function () { return store.data; }, writeJson: function (f, d) { store.data = JSON.parse(JSON.stringify(d)); } };
  const fetchFn = async function (url, init) {
    calls.push({ url: url, init: init });
    if (status && status !== 200) return { ok: false, status: status, text: async () => '' };
    const body = /\/api\/states$/.test(url) ? JSON.stringify(STATES) : '[]';
    return { ok: true, status: 200, text: async () => body };
  };
  return { client: new HomeAssistant({ secrets: secrets, file: 'ha.json', fetch: fetchFn }), store: store };
}

test('indirizzo: pulizia e rifiuto dei valori strani', function () {
  assert.strictEqual(cleanUrl('http://ha.local:8123/'), 'http://ha.local:8123');
  assert.strictEqual(cleanUrl('https://casa.example.org/api'), 'https://casa.example.org');
  assert.throws(function () { cleanUrl('ha.local'); }, /http/);
  assert.throws(function () { cleanUrl('javascript:alert(1)'); }, /http/);
});

test('descrizione di un dispositivo: stato in italiano, unità, tocco ammesso solo ai tipi sicuri', function () {
  assert.strictEqual(describe(STATES[0]).label, 'ACCESO');
  assert.strictEqual(describe(STATES[0]).tap, true);
  assert.strictEqual(describe(STATES[1]).label, '21.5 °C');
  assert.strictEqual(describe(STATES[1]).tap, false);
  assert.strictEqual(describe(STATES[2]).tap, false);
});

test('salvataggio: token non mostrato di nuovo, chiave cifrata dal gestore dei segreti', function () {
  const calls = [];
  const { client, store } = makeClient(calls);
  assert.throws(function () { client.save({ url: 'http://ha:8123', token: 'corto' }); }, /token/);
  client.save({ url: 'http://ha:8123/', token: 'a'.repeat(40) });
  assert.strictEqual(client.panelInfo().hasToken, true);
  assert.strictEqual(client.panelInfo().url, 'http://ha:8123');
  assert.ok(!JSON.stringify(client.panelInfo()).includes('aaaa'));
  client.save({ url: 'http://ha2:8123' });
  assert.strictEqual(store.data.token, 'a'.repeat(40), 'token vuoto = resta quello di prima');
});

test('lettura: preferiti con stato, intestazione con il token, errori chiari', async function () {
  const calls = [];
  const { client } = makeClient(calls);
  assert.match((await client.view()).error, /non è collegato/);
  client.save({ url: 'http://ha:8123', token: 't'.repeat(40) });
  assert.throws(function () { client.setFavorites('no'); }, /Lista/);
  assert.throws(function () { client.setFavorites(new Array(30).fill(0).map(function (x, i) { return 'light.l' + i; })); }, /Al massimo/);
  client.setFavorites(['light.salotto', 'sensor.temp', 'light.sparita', 'ROTTO']);
  const v = await client.view();
  assert.deepStrictEqual(v.devices.map(function (d) { return d.name; }), ['Luce salotto', 'Temperatura']);
  assert.strictEqual(v.on, 1);
  assert.strictEqual(calls[0].init.headers.Authorization, 'Bearer ' + 't'.repeat(40));
  assert.strictEqual((await client.read('sensor.temp')).label, '21.5 °C');
  assert.match((await client.read('sensor.nope')).error, /non trovato/);
  assert.match((await client.read('Storto')).error, /non valido/);

  const bad = makeClient([], 401);
  bad.client.save({ url: 'http://ha:8123', token: 't'.repeat(40) });
  assert.match((await bad.client.view()).error, /rifiutato il token/);
});

test('tocco: luce a toggle, scena a turn_on, serratura rifiutata', async function () {
  const calls = [];
  const { client } = makeClient(calls);
  client.save({ url: 'http://ha:8123', token: 't'.repeat(40) });
  const light = await client.tap('light.salotto');
  assert.match(light.message, /Luce salotto/);
  const post = calls.filter(function (c) { return c.init.method === 'POST'; })[0];
  assert.strictEqual(post.url, 'http://ha:8123/api/services/light/toggle');
  assert.deepStrictEqual(JSON.parse(post.init.body), { entity_id: 'light.salotto' });
  await client.tap('scene.cena');
  assert.ok(calls.some(function (c) { return /services\/scene\/turn_on$/.test(c.url); }));
  await assert.rejects(client.tap('lock.porta'), /non si comanda/);
});

test('servizi: bloccati quelli pericolosi, dati JSON passati', async function () {
  const calls = [];
  const { client } = makeClient(calls);
  client.save({ url: 'http://ha:8123', token: 't'.repeat(40) });
  await client.service('light', 'turn_on', { entity_id: 'light.salotto', brightness_pct: 40 });
  assert.deepStrictEqual(JSON.parse(calls[0].init.body), { entity_id: 'light.salotto', brightness_pct: 40 });
  await assert.rejects(client.service('lock', 'unlock', {}), /sicurezza/);
  await assert.rejects(client.service('homeassistant', 'restart', {}), /sicurezza/);
  await assert.rejects(client.service('light/../x', 'turn_on', {}), /non valido/);
});

test('webhook: solo http(s), GET senza corpo, POST con JSON o testo, errori chiari', async function () {
  const seen = [];
  const transport = async function (url, init) { seen.push({ url: url, init: init }); return { ok: true, status: 200 }; };
  await assert.rejects(webhook({ url: 'file:///etc/passwd' }, transport), /http/);
  await webhook({ url: 'https://maker.ifttt.com/trigger/x/with/key/k', method: 'GET', body: 'ignorato' }, transport);
  assert.strictEqual(seen[0].init.method, 'GET');
  assert.strictEqual(seen[0].init.body, undefined);
  await webhook({ url: 'http://192.168.1.9/rpc', body: '{"a":1}' }, transport);
  assert.strictEqual(seen[1].init.headers['Content-Type'], 'application/json');
  await webhook({ url: 'http://192.168.1.9/rpc', body: 'ciao' }, transport);
  assert.strictEqual(seen[2].init.headers['Content-Type'], 'text/plain');
  await assert.rejects(webhook({ url: 'http://x.local' }, async function () { return { ok: false, status: 500 }; }), /500/);
  await assert.rejects(webhook({ url: 'http://x.local' }, async function () { throw new Error('boom'); }), /Non raggiungibile/);
});
