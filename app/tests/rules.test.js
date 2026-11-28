const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-rules-'));
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.DOCK_PLUGINS_DIR = path.join(tmp, 'plugins');
process.env.DOCK_TOKEN = 'TESTCODE';
process.env.LOG_LEVEL = 'error';
fs.mkdirSync(process.env.DOCK_CONFIG_DIR, { recursive: true });

const rules = require('../server/rules');
const { triggers, compare } = require('../server/rules/triggers');
const events = require('../server/events');
const webhooks = require('../server/webhooks');
const config = require('../server/config');

const FIRST_PAGE = config.dock().pages[0].id;

function rule(extra) {
  return Object.assign({ id: 'r1', when: { type: 'cpu_above', value: 80 }, then: { type: 'notify', message: 'CPU alta' }, cooldownSec: 0 }, extra);
}

test('confronti: numeri, testi, contiene, valori mancanti', function () {
  assert.ok(compare('gt', '12', 5));
  assert.ok(!compare('gt', 'abc', 5));
  assert.ok(compare('eq', 'on', 'on'));
  assert.ok(compare('ne', 'on', 'off'));
  assert.ok(compare('has', 'Salotto Caldo', 'caldo'));
  assert.ok(!compare('lt', null, 5));
});

test('trigger: condizioni sullo stato', function () {
  const snap = { now: new Date(2026, 10, 28, 9, 0, 30).getTime(), apps: { code: true, game: false }, system: { cpu: { usage: 91 } }, media: { active: true, status: 'Playing' }, push: { stanza: { value: { temp: 25 } } } };
  assert.ok(triggers.get('cpu_above').test({ value: 90 }, snap));
  assert.ok(!triggers.get('cpu_above').test({ value: 95 }, snap));
  assert.ok(triggers.get('app_open').test({ app: 'code' }, snap));
  assert.ok(triggers.get('app_closed').test({ app: 'game' }, snap));
  assert.ok(!triggers.get('app_closed').test({ app: 'sconosciuta' }, snap));
  assert.ok(triggers.get('music_playing').test({}, snap));
  assert.ok(triggers.get('time_of_day').test({ at: '09:00' }, snap));
  assert.ok(!triggers.get('time_of_day').test({ at: '09:01' }, snap));
  assert.ok(triggers.get('push_compare').test({ name: 'stanza', field: 'temp', op: 'gt', value: '24' }, snap));
  assert.ok(!triggers.get('push_compare').test({ name: 'altro', op: 'gt', value: '1' }, snap));
});

test('salvataggio: controlli e valori di default', function () {
  assert.throws(function () { rules.save([{ when: { type: 'boh' }, then: { type: 'notify', message: 'x' } }]); }, /Quando/);
  assert.throws(function () { rules.save([rule({ then: { type: 'goto' } })]); }, /pagina/);
  assert.throws(function () { rules.save([rule({ when: { type: 'time_of_day', at: '25:99' } })]); }, /HH:MM/);
  assert.throws(function () { rules.save('no'); }, /lista/);
  const saved = rules.save([rule({ name: 'Prova', cooldownSec: undefined })]);
  assert.strictEqual(saved.length, 1);
  assert.strictEqual(saved[0].cooldownSec, 10);
  assert.strictEqual(saved[0].enabled, true);
  assert.strictEqual(rules.list()[0].name, 'Prova');
  assert.deepStrictEqual(rules.save([]), []);
});

function notifies() {
  return events.bus.queue.filter(function (e) { return e.type === 'notify' && e.message === 'CPU alta'; }).length;
}

test('motore: scatta sul fronte salita, non allo stato fisso, rispetta il tempo di attesa', async function () {
  const bus = new events.EventBus();
  const engine = new rules.RulesEngine(bus);
  let usage = 10;
  engine.snapshot = async function () { return { now: Date.now(), system: { cpu: { usage: usage } } }; };
  rules.save([rule({ cooldownSec: 3600 })]);
  usage = 95;
  await engine.tick();
  assert.strictEqual(notifies(), 0, 'primo giro: solo memoria');
  usage = 10;
  await engine.tick();
  usage = 95;
  await engine.tick();
  assert.strictEqual(notifies(), 1);
  await engine.tick();
  assert.strictEqual(notifies(), 1, 'stato fisso: niente ripetizioni');
  usage = 10;
  await engine.tick();
  usage = 95;
  await engine.tick();
  assert.strictEqual(notifies(), 1, 'tempo di attesa non finito');
  assert.strictEqual(engine.last.r1.ok, true);
});

test('motore: eventi webhook e Claude ti aspetta aprono la pagina', async function () {
  rules.save([
    { id: 'claude', when: { type: 'claude_waiting' }, then: { type: 'goto', page: FIRST_PAGE }, cooldownSec: 0 },
    { id: 'mio', when: { type: 'webhook_event', name: 'porta' }, then: { type: 'notify', message: 'Suonano' }, cooldownSec: 0 }
  ]);
  const before = events.bus.seq;
  rules.engine.start();
  try {
    webhooks.emit('claude-waiting', {});
    webhooks.emit('porta', {});
    webhooks.emit('altro', {});
    await new Promise(function (r) { setTimeout(r, 50); });
  } finally { rules.engine.stop(); }
  const got = events.bus.since(before);
  assert.ok(got.some(function (e) { return e.type === 'goto' && e.page === FIRST_PAGE; }));
  assert.ok(got.some(function (e) { return e.type === 'notify' && e.message === 'Suonano'; }));
  assert.strictEqual(got.filter(function (e) { return e.type === 'goto'; }).length, 1);
  rules.save([]);
});

test('prova di una regola e azione che fallisce', async function () {
  rules.save([rule({ id: 'prova' }), { id: 'rotta', when: { type: 'cpu_above', value: 1 }, then: { type: 'launch', app: 'non-esiste' }, cooldownSec: 0 }]);
  const ok = await rules.test('prova');
  assert.strictEqual(ok.ok, true);
  const ko = await rules.test('rotta');
  assert.strictEqual(ko.ok, false);
  await assert.rejects(rules.test('nessuna'), /sconosciuta/);
  rules.save([]);
});

test('descrizioni per il pannello: tutte le voci hanno etichetta e parametri', function () {
  const d = rules.describe();
  assert.ok(d.triggers.length >= 9 && d.reactions.length >= 7);
  d.triggers.concat(d.reactions).forEach(function (x) { assert.ok(x.label && Array.isArray(x.params), x.type); });
  assert.ok(d.pages.some(function (p) { return p.value === FIRST_PAGE; }));
});

test('reazioni dei plugin: offerte solo se il plugin c\'è, parametri obbligatori controllati', function () {
  const names = rules.describe().reactions.map(function (r) { return r.type; });
  assert.ok(names.indexOf('goto') >= 0 && names.indexOf('launch') >= 0);
  assert.throws(function () { rules.save([rule({ then: { type: 'homeassistant.tap' } })]); }, /manca/);
  const saved = rules.save([rule({ then: { type: 'wol.wake', device: 'NAS' } })]);
  assert.strictEqual(saved[0].then.device, 'NAS');
  rules.save([]);
});
