const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-sources-'));
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.DOCK_PLUGINS_DIR = path.join(tmp, 'plugins');
process.env.DOCK_OFFICIAL_PLUGINS_DIR = path.join(tmp, 'official');
process.env.LOG_LEVEL = 'error';

function write(rel, content) {
  const file = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
}

let hits = 0;
const server = http.createServer(function (req, res) {
  hits++;
  if (req.url === '/meteo') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ daily: { time: ['2026-11-23', '2026-11-24'], tmax: [14.6, 12.2], code: [0, 61] } })); return; }
  if (req.url === '/testo') { res.end('riga uno\nriga due'); return; }
  res.statusCode = 500;
  res.end('no');
});

const ready = new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });

write('data/stato.json', { coda: [{ nome: 'build', pct: 40 }, { nome: 'test', pct: 100 }] });
write('data/nota.txt', 'Comprare il latte\nChiamare Marco');
write('plugins/conn/index.js', 'module.exports = { sources: { contatore: { every: 1, read: async function (src, ctx) { return { n: 7, plugin: ctx.name }; } } } };');
write('plugins/conn/widgets/numero.json', { name: 'N', shape: 'value', source: { type: 'conn.contatore' }, show: { value: '{{n}}', sub: '{{plugin}}' } });
write('plugins/altro/widgets/ruba.json', { name: 'Ruba', shape: 'value', source: { type: 'conn.contatore' }, show: { value: '{{n}}' } });
write('plugins/locale/widgets/coda.json', {
  name: 'Coda', shape: 'list', source: { type: 'file', path: 'stato.json' },
  show: { label: 'CODA', items: '{{coda}}', item: { title: '{{item.nome|upper}}', right: '{{item.pct}}%', bar: '{{item.pct}}', warn: 90 } },
  tap: { type: 'fake', say: 'apri {{item.nome}} ({{index}})' }
});
write('plugins/locale/widgets/nota.json', { name: 'Nota', shape: 'text', source: { type: 'file', path: 'nota.txt' }, show: { text: '{{lines|first}}' } });
write('plugins/locale/widgets/fuori.json', { name: 'Fuori', shape: 'text', source: { type: 'file', path: '../segreto.txt' }, show: { text: 'x' } });
write('plugins/locale/widgets/vuota.json', { name: 'Vuota', shape: 'list', source: { type: 'static', data: { l: [] } }, show: { items: '{{l}}', item: { title: 'x' }, empty: 'Tutto fatto' } });
write('plugins/locale/widgets/livello.json', {
  name: 'Livello', shape: 'slider', source: { type: 'static', data: { v: 30 } },
  show: { value: '{{v}}', min: 0, max: 100, step: 5, unit: '%' },
  set: { type: 'fake', level: '{{value}}', say: 'livello {{value}}' }
});

const facade = require('../server/shapes');
const template = require('../server/shapes/template');
const { resolve, parseText, dataPath } = require('../server/shapes/sources');
const plugins = require('../server/plugins');

const done = [];
facade.runner.execute = async function (action) {
  done.push(action);
  return { message: action.say };
};

test.after(function () { server.close(); });

test('new filters: map, zip, first, join, date; deep keeps numbers for a single placeholder', function () {
  const ctx = { maps: { cielo: { '0': 'Sereno', '*': 'Altro' } } };
  assert.strictEqual(template.text('{{c|map:cielo}}', { c: 0 }, ctx), 'Sereno');
  assert.strictEqual(template.text('{{c|map:cielo}}', { c: 99 }, ctx), 'Altro');
  assert.strictEqual(template.text('{{c|map:manca}}', { c: 3 }, ctx), '3');
  assert.deepStrictEqual(template.value('{{d|zip}}', { d: { a: [1, 2], b: ['x', 'y'], n: 3 } }), [{ a: 1, b: 'x' }, { a: 2, b: 'y' }]);
  assert.strictEqual(template.text('{{l|first}}', { l: ['uno', 'due'] }), 'uno');
  assert.strictEqual(template.text('{{l|join: / }}', { l: ['a', 'b'] }), 'a / b');
  assert.strictEqual(template.text('{{t|date:day}}', { t: '2026-11-24' }), 'mar 24');
  assert.strictEqual(template.text('{{t|date}}', { t: '2026-11-24' }), '24 nov');
  assert.deepStrictEqual(template.deep({ value: '{{v}}', label: 'v={{v}}' }, { v: 42 }), { value: 42, label: 'v=42' });
});

test('text that is not JSON becomes { text, lines }', function () {
  assert.deepStrictEqual(parseText(' a\nb '), { text: 'a\nb', lines: ['a', 'b'] });
  assert.deepStrictEqual(parseText('[1,2]'), [1, 2]);
  assert.deepStrictEqual(parseText('{rotto'), { text: '{rotto', lines: ['{rotto'] });
});

test('http source: only sites in permissions.http, JSON and text, errors are clear', async function () {
  await ready;
  const host = '127.0.0.1:' + server.address().port;
  const http = resolve('http');
  const ok = { permissions: { http: [host] } };
  assert.deepStrictEqual(http.validate({ url: 'http://' + host + '/meteo' }, ok), []);
  assert.match(http.validate({ url: 'http://' + host + '/meteo' }, { permissions: {} })[0], /permissions\.http/);
  assert.match(http.validate({ url: 'ftp://x' }, ok)[0], /http/);
  assert.strictEqual((await http.read({ url: 'http://' + host + '/meteo' }, {}, ok)).daily.tmax[0], 14.6);
  assert.deepStrictEqual((await http.read({ url: 'http://' + host + '/testo' }, {}, ok)).lines, ['riga uno', 'riga due']);
  await assert.rejects(http.read({ url: 'http://' + host + '/meteo' }, {}, { permissions: {} }), /non consentito/);
  await assert.rejects(http.read({ url: 'http://' + host + '/rotto' }, {}, ok), /ha risposto 500/);
  assert.ok(http.every({ every: 1 }) >= 30, 'internet sources are not polled too often');
});

test('http widget end to end: permissions from plugin.json, list from parallel arrays, cache', async function () {
  await ready;
  const host = '127.0.0.1:' + server.address().port;
  write('plugins/rete/plugin.json', { id: 'rete', name: 'Rete', version: '1.0.0', permissions: { http: [host] } });
  write('plugins/rete/widgets/giorni.json', {
    name: 'Giorni', shape: 'list', source: { type: 'http', url: 'http://' + host + '/meteo' }, every: 600,
    show: { items: '{{daily|zip}}', item: { title: '{{item.time|date:day}} · {{item.code|map:cielo}}', right: '{{item.tmax|round}}°' } },
    maps: { cielo: { '0': 'Sereno', '61': 'Pioggia' } }
  });
  write('plugins/senza/widgets/giorni.json', { name: 'G', shape: 'text', source: { type: 'http', url: 'http://' + host + '/meteo' }, show: { text: 'x' } });
  await new Promise(setImmediate);
  const before = hits;
  const v = await facade.view('rete', 'giorni');
  assert.deepStrictEqual(v.items.map(function (i) { return i.title + ' ' + i.right; }), ['lun 23 · Sereno 15°', 'mar 24 · Pioggia 12°']);
  await facade.view('rete', 'giorni');
  assert.strictEqual(hits - before, 1, 'one request per period');
  const bad = facade.report().filter(function (r) { return /senza/.test(r.where); })[0];
  assert.match(bad.problems[0], /permissions\.http/);
});

test('file source: inside data/ only, JSON or text', async function () {
  assert.ok(dataPath('stato.json'));
  assert.strictEqual(dataPath('../fuori.json'), null);
  assert.strictEqual(dataPath(path.join(tmp, 'altro')), null);
  assert.strictEqual((await facade.view('locale', 'nota')).text, 'Comprare il latte');
  const bad = facade.report().filter(function (r) { return /fuori/.test(r.where); })[0];
  assert.match(bad.problems[0], /dentro data/);
});

test('command source: needs a command id; it is checked like the actions', function () {
  const c = resolve('command');
  assert.deepStrictEqual(c.validate({ id: 'x' }), []);
  assert.match(c.validate({})[0], /commands\.json/);
  assert.ok(c.every({ every: 1 }) >= 10);
});

test('list: rows, bars, empty text; a tap runs the action for that row', async function () {
  const v = await facade.view('locale', 'coda');
  assert.strictEqual(v.rowTap, true);
  assert.strictEqual(v.tappable, false);
  assert.deepStrictEqual(v.items, [
    { title: 'BUILD', sub: '', right: '40%', bar: 40, level: 'ok' },
    { title: 'TEST', sub: '', right: '100%', bar: 100, level: 'warn' }
  ]);
  done.length = 0;
  assert.strictEqual((await facade.tap('locale', 'coda', 1)).message, 'apri test (1)');
  await assert.rejects(facade.tap('locale', 'coda', 9), function (e) { return e.code === 'CONFIG_CHANGED'; });
  const empty = await facade.view('locale', 'vuota');
  assert.deepStrictEqual(empty.items, []);
  assert.strictEqual(empty.empty, 'Tutto fatto');
});

test('slider: value snapped to step and limits, numeric {{value}} in the action', async function () {
  const v = await facade.view('locale', 'livello');
  assert.deepStrictEqual([v.value, v.min, v.max, v.step, v.unit], [30, 0, 100, 5, '%']);
  done.length = 0;
  const r = await facade.set('locale', 'livello', 47);
  assert.strictEqual(r.value, 45);
  assert.strictEqual(done[0].level, 45);
  assert.strictEqual((await facade.set('locale', 'livello', 900)).value, 100);
  await assert.rejects(facade.set('locale', 'livello', 'tanto'), function (e) { return e.code === 'BAD_REQUEST'; });
  await assert.rejects(facade.set('locale', 'coda', 3), function (e) { return e.code === 'BAD_REQUEST'; });
  assert.deepStrictEqual(facade.validate({ name: 's', shape: 'slider', show: { value: '1', min: 5, max: 5 } }, 's'),
    ['"show.min" e "show.max" devono essere numeri, min < max', '"set": azione senza "type"']);
});

test('plugin sources (connectors): usable by the same plugin only', async function () {
  const v = await facade.view('conn', 'numero');
  assert.strictEqual(v.value, '7');
  assert.strictEqual(v.sub, 'conn', 'the source gets the plugin context');
  const bad = facade.report().filter(function (r) { return /ruba/.test(r.where); })[0];
  assert.match(bad.problems[0], /un plugin deve funzionare da solo/);
  assert.strictEqual(resolve('conn.manca'), null);
});

test('plugin translations: words and $rules, served as one script', function () {
  write('plugins/locale/lang/en.json', { 'Ciao': 'Hello', '$rules': [['^vento (.+)$', 'wind $1'], ['(rotta', 'x'], 'no'] });
  plugins.reset();
  const d = plugins.dictionary('en');
  assert.deepStrictEqual(d.words, { Ciao: 'Hello' });
  assert.deepStrictEqual(d.rules, [['^vento (.+)$', 'wind $1']], 'broken rules are left out');
  const js = plugins.langScript(d);
  const added = [], rules = [];
  new Function('I18n', js)({ add: function (m) { added.push(m); }, rules: function (r) { rules.push.apply(rules, r); } });
  assert.deepStrictEqual(added, [{ Ciao: 'Hello' }]);
  assert.strictEqual('vento 5 km/h'.replace(rules[0][0], rules[0][1]), 'wind 5 km/h');
});

test('every official JSON widget is valid with its plugin permissions', function () {
  const parse = require('../server/config').parseJson;
  const root = path.join(__dirname, '..', 'official-plugins');
  let count = 0;
  fs.readdirSync(root).forEach(function (p) {
    const dir = path.join(root, p, 'widgets');
    if (!fs.existsSync(dir)) return;
    const manifest = parse(fs.readFileSync(path.join(root, p, 'plugin.json'), 'utf8'));
    const ctx = { plugin: p, permissions: manifest.permissions || {} };
    fs.readdirSync(dir).filter(function (f) { return /\.json$/.test(f); }).forEach(function (f) {
      const def = parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const own = /^([a-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(def.source && def.source.type || '');
      if (own) {
        assert.strictEqual(own[1], p, p + '/' + f + ': only its own sources');
        assert.match(fs.readFileSync(path.join(root, p, 'index.js'), 'utf8'), new RegExp('\\b' + own[2] + ':'), p + ' must export sources.' + own[2]);
        def.source = { type: 'static' };
      }
      assert.deepStrictEqual(facade.validate(def, f.replace(/\.json$/, ''), ctx), [], p + '/' + f);
      count++;
    });
  });
  assert.ok(count >= 13, 'pcinfo, meteo and audio widgets');
});
