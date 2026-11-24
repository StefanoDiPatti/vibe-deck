const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-shapes-'));
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.DOCK_PLUGINS_DIR = path.join(tmp, 'plugins');
process.env.DOCK_OFFICIAL_PLUGINS_DIR = path.join(tmp, 'official');
process.env.LOG_LEVEL = 'error';

const OS = process.platform === 'win32' ? 'windows' : 'linux';
const OTHER = OS === 'windows' ? 'linux' : 'windows';

function widget(pluginName, id, def) {
  const dir = path.join(tmp, 'plugins', pluginName, 'widgets');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, id + '.json'), typeof def === 'string' ? def : JSON.stringify(def));
}

widget('demo', 'numero', {
  name: 'Numero', shape: 'value', source: { type: 'static', data: { n: 72.4, ok: true } },
  show: { label: 'CPU', value: '{{n|round}}', unit: '%', bar: '{{n}}', warn: 60, hot: 85 },
  tap: { type: 'fake', say: 'valore {{n|round}}' }
});
widget('demo', 'pulsanti', {
  name: 'Pulsanti', shape: 'buttons',
  buttons: [{ label: 'UNO', action: { type: 'fake', say: 'uno' } }, { label: 'DUE', icon: 'add', action: { type: 'fake', say: 'due' } }]
});
widget('demo', 'voce', {
  name: 'Voce', shape: 'voice',
  voice: {
    commands: [
      { say: ['volume'], action: { type: 'fake', say: 'volume generico' } },
      { say: ['alza il volume', 'più forte'], action: { type: 'fake', say: 'su' }, reply: 'Volume su' }
    ],
    action: { type: 'fake', say: 'https://example.com/?q={{text|url}}' }
  }
});
widget('demo', 'altro-os', { name: 'Altro', shape: 'text', platforms: [OTHER], show: { text: 'x' } });
widget('demo', 'rotto', { name: 'Rotto', shape: 'nuvola', source: { type: 'meteo' } });
widget('demo', 'Maiuscolo', { name: 'Nome file', shape: 'text', show: { text: 'x' } });
widget('demo', 'nonjson', '{ nope');

const template = require('../server/shapes/template');
const { shapes } = require('../server/shapes/shapes');
const { Source, SourceCache } = require('../server/shapes/sources');
const facade = require('../server/shapes');
const Registry = require('../server/shapes/registry');

const done = [];
facade.runner.execute = async function (action) {
  done.push(action);
  return { message: action.say };
};

test('registry: names are unique', function () {
  const r = new Registry('thing');
  r.register('a', 1);
  assert.throws(function () { r.register('a', 2); }, /already registered/);
  assert.deepStrictEqual(r.names(), ['a']);
  assert.strictEqual(r.get('b'), null);
});

test('template: placeholders, nested fields, filters and missing values', function () {
  const data = { cpu: { usage: 61.6, temp: null }, list: [1, 2, 3], when: Date.now() - 5 * 60000, bytes: 3 * 1024 * 1024, up: 3700 };
  assert.strictEqual(template.text('CPU {{cpu.usage|round}}%', data), 'CPU 62%');
  assert.strictEqual(template.value('{{cpu.usage}}', data), 61.6, 'a single placeholder keeps the type');
  assert.strictEqual(template.text('{{cpu.temp|default:–}}°', data), '–°');
  assert.strictEqual(template.text('{{nope.deeper}}', data), '');
  assert.strictEqual(template.value('{{nope}}', data), null);
  assert.strictEqual(template.text('{{cpu.usage|round:1}}', data), '61.6');
  assert.strictEqual(template.text('{{bytes|bytes}}', data), '3 MB');
  assert.strictEqual(template.text('{{up|duration}}', data), '1 h 1 min');
  assert.strictEqual(template.text('{{when|ago}}', data), '5 min fa');
  assert.strictEqual(template.text('{{list|count}}', data), '3');
  assert.strictEqual(template.text('{{cpu.usage|percent}}', data), '62%');
  assert.strictEqual(template.text('{{x|yesno:aperto:chiuso}}', { x: false }), 'chiuso');
  assert.strictEqual(template.text('?q={{t|url}}', { t: 'a b&c' }), '?q=a%20b%26c');
  assert.deepStrictEqual(template.deep({ a: ['{{t|upper}}', 3] }, { t: 'ok' }), { a: ['OK', 3]});
  assert.deepStrictEqual(template.check('{{x|magia}}'), ['filtro sconosciuto "magia" in {{x|magia}}']);
  assert.throws(function () { template.text('{{x|magia}}', {}); }, /Filtro sconosciuto/);
});

test('value shape: text, bar and level from warn/hot', function () {
  const def = { name: 'X', shape: 'value', show: { value: '{{n}}', bar: '{{n}}', warn: 60, hot: 85 } };
  assert.strictEqual(shapes.get('value').view(def, { n: 50 }).level, 'ok');
  assert.strictEqual(shapes.get('value').view(def, { n: 70 }).level, 'warn');
  const hot = shapes.get('value').view(def, { n: 120 });
  assert.strictEqual(hot.level, 'hot');
  assert.strictEqual(hot.bar, 100, 'the bar stays within 0-100');
  assert.strictEqual(hot.label, 'X', 'label falls back to the name');
  assert.strictEqual(shapes.get('value').view(def, {}).bar, null);
});

test('bars, status, text: views', function () {
  const bars = shapes.get('bars').view({ name: 'B', shape: 'bars', show: { rows: [{ label: 'A', value: '{{a}}%', bar: '{{a}}', warn: 50 }, { label: 'N', value: 'x' }] } }, { a: 55 });
  assert.deepStrictEqual(bars.rows, [{ label: 'A', value: '55%', bar: 55, level: 'warn' }, { label: 'N', value: 'x', bar: null, level: '' }]);
  const st = shapes.get('status').view({ name: 'S', shape: 'status', show: { on: '{{apps.discord}}', onText: 'Aperto', offText: 'Chiuso' } }, { apps: { discord: true } });
  assert.strictEqual(st.on, true);
  assert.strictEqual(st.text, 'Aperto');
  assert.strictEqual(shapes.get('status').view({ name: 'S', shape: 'status', show: { on: '{{x}}', text: 'T' } }, {}).text, 'T');
  assert.strictEqual(shapes.get('text').view({ name: 'T', shape: 'text', show: { text: 'Su da {{s|duration}}' } }, { s: 120 }).text, 'Su da 2 min');
});

test('validation: every problem has a clear message', function () {
  assert.ok(facade.validate({ name: 'x', shape: 'nuvola' }, 'x')[0].indexOf('forma sconosciuta') === 0);
  assert.ok(facade.validate({ name: 'x', shape: 'text', show: { text: 'a' }, source: { type: 'meteo' } }, 'x').some(function (p) { return /fonte sconosciuta/.test(p); }));
  assert.deepStrictEqual(facade.validate({ name: 'x', shape: 'bars', show: {} }, 'x'), ['"show.rows" deve essere una lista di righe']);
  assert.deepStrictEqual(facade.validate({ name: 'x', shape: 'buttons', buttons: [{ label: 'a' }] }, 'x'), ['pulsante 1: azione senza "type"']);
  assert.deepStrictEqual(facade.validate({ name: 'x', shape: 'voice', voice: {} }, 'x'), ['servono "voice.commands" o "voice.action"']);
  assert.deepStrictEqual(facade.validate({ name: 'x', shape: 'voice', voice: { commands: [{ say: [' ! '], action: { type: 'a' } }] } }, 'x'), ['comando vocale 1: "say" deve elencare almeno una frase']);
  assert.deepStrictEqual(facade.validate({ id: 'y', name: 'x', shape: 'text', show: { text: 'a' } }, 'x'), ['"id" deve essere "x", come il nome del file']);
  assert.deepStrictEqual(facade.validate({ name: 'x', shape: 'text', show: { text: '{{a|boh}}' } }, 'x'), ['filtro sconosciuto "boh" in {{a|boh}}']);
  assert.deepStrictEqual(facade.validate({ name: 'x', shape: 'text', show: { text: 'a' }, platforms: ['mac'] }, 'x'), ['"platforms" deve elencare "windows" e/o "linux"']);
  assert.deepStrictEqual(facade.validate({ name: 'x', shape: 'value', show: { value: '1' } }, 'x'), []);
});

test('plugin widgets: valid ones in the HOME catalog, broken ones reported, other OS left out', function () {
  const ids = facade.catalog().map(function (c) { return c.id; }).sort();
  assert.deepStrictEqual(ids, ['demo.numero', 'demo.pulsanti', 'demo.voce']);
  const num = facade.catalog().filter(function (c) { return c.id === 'demo.numero'; })[0];
  assert.deepStrictEqual(num.props, { def: 'demo/numero' });
  assert.strictEqual(num.widget, 'shape');
  const bad = facade.report().filter(function (r) { return r.problems.length; }).map(function (r) { return r.where; }).sort();
  assert.deepStrictEqual(bad, ['plugin demo › widgets/Maiuscolo.json', 'plugin demo › widgets/nonjson.json', 'plugin demo › widgets/rotto.json']);
  const home = require('../server/home');
  assert.ok(home.catalog().some(function (c) { return c.id === 'demo.voce' && c.icon === 'mic'; }), 'JSON widgets reach the HOME catalog');
});

test('view: data from the source, filled on the PC; unknown widget is NOT_FOUND', async function () {
  const v = await facade.view('demo', 'numero');
  assert.strictEqual(v.shape, 'value');
  assert.strictEqual(v.value, '72');
  assert.strictEqual(v.bar, 72.4);
  assert.strictEqual(v.level, 'warn');
  assert.strictEqual(v.tappable, true);
  assert.ok(v.every >= 1);
  await assert.rejects(facade.view('demo', 'manca'), function (e) { return e.code === 'NOT_FOUND'; });
  await assert.rejects(facade.view('demo', 'rotto'), function (e) { return e.code === 'BAD_CONFIG'; });
});

test('tap: runs the configured action with placeholders; buttons by index', async function () {
  done.length = 0;
  assert.strictEqual((await facade.tap('demo', 'numero')).message, 'valore 72');
  assert.strictEqual((await facade.tap('demo', 'pulsanti', 1)).message, 'due');
  await assert.rejects(facade.tap('demo', 'pulsanti', 7), function (e) { return e.code === 'BAD_CONFIG'; });
  assert.deepStrictEqual(done.map(function (a) { return a.say; }), ['valore 72', 'due']);
});

test('voice: longest phrase wins, accents and punctuation ignored, fallback gets the text', async function () {
  done.length = 0;
  const r = await facade.voice('demo', 'voce', 'Ehi, ALZA il volume!');
  assert.strictEqual(r.message, 'Volume su');
  assert.strictEqual(r.heard, 'Ehi, ALZA il volume!');
  assert.strictEqual((await facade.voice('demo', 'voce', 'piu forte')).message, 'Volume su', 'più = piu');
  assert.strictEqual((await facade.voice('demo', 'voce', 'il volume')).message, 'volume generico');
  assert.strictEqual((await facade.voice('demo', 'voce', 'gatti & cani')).message, 'https://example.com/?q=gatti%20%26%20cani');
  assert.strictEqual((await facade.voice('demo', 'voce', 'volumetto')).message, 'https://example.com/?q=volumetto', 'whole words only');
  await assert.rejects(facade.voice('demo', 'voce', '   '), function (e) { return e.code === 'BAD_REQUEST'; });
  await assert.rejects(facade.voice('demo', 'numero', 'ciao'), function (e) { return e.code === 'BAD_REQUEST'; });
  assert.strictEqual(done.length, 5);
});

test('source cache: one read per period, shared while pending, errors not kept', async function () {
  let reads = 0, failNext = false;
  class Counting extends Source {
    constructor() { super('counting', 1); }
    async read() {
      reads++;
      if (failNext) { failNext = false; throw new Error('giù'); }
      return { n: reads };
    }
  }
  const cache = new SourceCache();
  const src = new Counting();
  const def = { every: 60, source: { type: 'counting' } };
  const both = await Promise.all([cache.read('k', src, def), cache.read('k', src, def)]);
  assert.deepStrictEqual(both, [{ n: 1 }, { n: 1 }]);
  assert.deepStrictEqual(await cache.read('k', src, def), { n: 1 });
  assert.strictEqual(reads, 1);
  failNext = true;
  await assert.rejects(cache.read('other', src, def), /giù/);
  assert.deepStrictEqual(await cache.read('other', src, def), { n: 3 });
});

test('official pcinfo widgets are all valid and work alone', async function () {
  const dir = path.join(__dirname, '..', 'official-plugins', 'pcinfo', 'widgets');
  const parse = require('../server/config').parseJson;
  const files = fs.readdirSync(dir).filter(function (f) { return /\.json$/.test(f); });
  assert.ok(files.length >= 8);
  files.forEach(function (f) {
    const def = parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.deepStrictEqual(facade.validate(def, f.replace(/\.json$/, '')), [], f);
    const view = shapes.get(def.shape).view(def, { cpu: { usage: 10, cores: 8 }, ram: { usage: 50, usedGb: 8, totalGb: 16 }, gpu: null, net: {}, apps: {}, uptimeSeconds: 60, hostname: 'pc' });
    assert.strictEqual(view.shape, def.shape, f);
  });
});
