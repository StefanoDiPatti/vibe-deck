const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-plugins-'));
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.DOCK_PLUGINS_DIR = path.join(tmp, 'plugins');
process.env.DOCK_OFFICIAL_PLUGINS_DIR = path.join(tmp, 'official');
process.env.DOCK_TOKEN = 'TESTCODE';
process.env.LOG_LEVEL = 'error';

const newWidget = require('../scripts/new-widget');
const logs = console.log;
console.log = function () {};
assert.strictEqual(newWidget.main(['meteo']), 0);
assert.strictEqual(newWidget.main(['meteo']), 1, 'non sovrascrive un plugin esistente');
assert.strictEqual(newWidget.main(['clock']), 1, 'non usa il nome di un widget del progetto');
console.log = logs;
const P = path.join(process.env.DOCK_PLUGINS_DIR, 'meteo');
fs.mkdirSync(path.join(P, 'apps'));
fs.writeFileSync(path.join(P, 'apps', 'radar.json'), '// app del plugin\n{ "label": "Radar", "windows": { "path": "radar.exe" }, "linux": { "path": "radar" } }');
fs.mkdirSync(path.join(P, 'commands'));
fs.writeFileSync(path.join(P, 'commands', 'previsioni.json'), '{ "label": "Previsioni", "windows": { "cmd": "echo" }, "linux": { "cmd": "echo" } }');
fs.mkdirSync(path.join(process.env.DOCK_PLUGINS_DIR, '_spento', 'pages'), { recursive: true });
fs.writeFileSync(path.join(process.env.DOCK_PLUGINS_DIR, '_spento', 'pages', 'spenta.json'), '{ "id": "spenta", "tiles": [] }');
fs.mkdirSync(path.join(process.env.DOCK_PLUGINS_DIR, 'rotto'));
fs.writeFileSync(path.join(process.env.DOCK_PLUGINS_DIR, 'rotto', 'index.js'), 'throw new Error("guasto");');

const { app } = require('../server/index.js');
const config = require('../server/config');
const actions = require('../server/actions');
const check = require('../server/check');
const plugins = require('../server/plugins');

let server, base;
test.before(function () {
  return new Promise(function (resolve) {
    server = app.listen(0, '127.0.0.1', function () { base = 'http://127.0.0.1:' + server.address().port; resolve(); });
  });
});
test.after(function () { server.close(); });

function get(p, token) { return fetch(base + p, { headers: token ? { 'X-Dock-Token': token } : {} }); }

test('plugin trovati: spenti ("_") ignorati', function () {
  assert.deepStrictEqual(plugins.names(), ['meteo', 'rotto']);
});

test('azioni del plugin come "<plugin>.<azione>"', async function () {
  assert.ok(actions.HANDLERS['meteo.saluta']);
  assert.ok(actions.BUILTIN.indexOf('meteo.saluta') < 0);
  const r = await actions.execute({ type: 'meteo.saluta', nome: 'Ste' });
  assert.strictEqual(r.message, 'Ciao Ste da meteo!');
  const p = await actions.press('meteo', 'saluta');
  assert.match(p.message, /Ciao Vibe Deck/);
});

test('rotte del plugin sotto /api/plugins/<nome>, col codice', async function () {
  assert.strictEqual((await get('/api/plugins/meteo/dati')).status, 401);
  const r = await (await get('/api/plugins/meteo/dati', 'TESTCODE')).json();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.tocchi, 0);
  const t = await (await fetch(base + '/api/plugins/meteo/tocca', { method: 'POST', headers: { 'X-Dock-Token': 'TESTCODE', 'Content-Type': 'application/json' }, body: '{}' })).json();
  assert.deepStrictEqual(t, { ok: true, data: { tocchi: 1 } });
});

test('pagina, app e comandi del plugin come quelli predefiniti', function () {
  const page = config.dock().pages.filter(function (p) { return p.id === 'meteo'; })[0];
  assert.ok(page, 'pagina del plugin');
  assert.strictEqual(page.tab, false, 'disponibile, la attivi dal pannello');
  assert.ok(!config.dock().pages.some(function (p) { return p.id === 'spenta'; }));
  assert.strictEqual(config.apps().radar.label, 'Radar');
  assert.strictEqual(config.commands().previsioni.label, 'Previsioni');
  fs.mkdirSync(path.join(process.env.DOCK_CONFIG_DIR, 'pages'), { recursive: true });
  fs.writeFileSync(path.join(process.env.DOCK_CONFIG_DIR, 'pages', 'meteo.json'), '{ "id": "meteo", "title": "MIO METEO", "tiles": [] }');
  assert.strictEqual(config.dock().pages.filter(function (p) { return p.id === 'meteo'; })[0].title, 'MIO METEO');
  fs.unlinkSync(path.join(process.env.DOCK_CONFIG_DIR, 'pages', 'meteo.json'));
});

test('script e stile del plugin nella pagina del tablet, prima di app.js', async function () {
  const html = await (await get('/')).text();
  const s = html.indexOf('src="plugins/meteo/meteo.js?v=');
  assert.ok(s > 0, 'script del plugin');
  assert.ok(s > html.indexOf('js/widgets.js') && s < html.indexOf('js/app.js'), 'tra widgets.js e app.js');
  assert.ok(html.indexOf('href="plugins/meteo/meteo.css?v=') > 0, 'stile del plugin');
  const js = await get('/plugins/meteo/meteo.js');
  assert.strictEqual(js.status, 200);
  assert.match(await js.text(), /Widgets\.register\('meteo'/);
  assert.strictEqual((await get('/plugins/meteo/..%2Findex.js')).status, 404, 'solo la cartella public');
  assert.strictEqual((await get('/plugins/meteo/index.js')).status, 404);
  assert.strictEqual((await get('/plugins/_spento/x.js')).status, 404);
});

test('controllo: widget e icone del plugin conosciuti, plugin rotto segnalato', function () {
  assert.ok(check.widgetNames().indexOf('meteo') >= 0);
  assert.ok(check.iconNames().meteo, 'icona registrata dal plugin');
  const errs = check.run().filter(function (x) { return x.level === 'error'; });
  assert.strictEqual(errs.length, 1, JSON.stringify(errs));
  assert.match(errs[0].where + ': ' + errs[0].message, /plugin rotto: index\.js non caricato: guasto/);
});

test('pannello: elenco dei plugin', function () {
  const info = plugins.info();
  const m = info.filter(function (p) { return p.name === 'meteo'; })[0];
  assert.deepStrictEqual(m.actions, ['meteo.saluta']);
  assert.deepStrictEqual(m.widgets, ['meteo']);
  assert.deepStrictEqual(m.icons, ['meteo']);
  assert.strictEqual(m.pages, 1);
  assert.strictEqual(m.error, '');
});

test('npm run new:page crea una pagina valida', function () {
  const newPage = require('../scripts/new-page');
  console.log = function () {};
  assert.strictEqual(newPage.main(['stream', 'Live']), 0);
  assert.strictEqual(newPage.main(['stream']), 1);
  assert.strictEqual(newPage.main(['main']), 1, 'pagina predefinita');
  assert.strictEqual(newPage.main(['Non Valido!']), 1);
  console.log = logs;
  const page = config.dock().pages.filter(function (p) { return p.id === 'stream'; })[0];
  assert.strictEqual(page.title, 'LIVE');
  assert.ok(page.tab, 'compare nella barra');
  const errs = check.run().filter(function (x) { return x.level === 'error' && /STREAM|LIVE/.test(x.where); });
  assert.deepStrictEqual(errs, []);
});

test('widget del plugin nel catalogo della HOME: home.json (anche più versioni dello stesso widget)', async function () {
  const home = require('../server/home');
  await new Promise(setImmediate);
  let c = home.catalog().filter(function (x) { return x.plugin === 'meteo'; });
  assert.deepStrictEqual(c.map(function (x) { return x.id + ' ' + x.label + ' ' + x.w + 'x' + x.h + ' min ' + x.minW + 'x' + x.minH + ' ' + x.page; }),
    ['meteo METEO 2x2 min 2x1 PLUGIN METEO'], 'dal home.json del generatore');
  fs.writeFileSync(path.join(P, 'home.json'), '// prova\n{ "meteo": { "label": "Meteo", "icon": "meteo", "w": 3, "h": 2 },' +
    ' "meteo-roma": { "widget": "meteo", "label": "Meteo Roma", "props": { "citta": "Roma" } },' +
    ' "furbo": { "widget": "clock" } }');
  await new Promise(setImmediate);
  c = home.catalog().filter(function (x) { return x.plugin === 'meteo'; });
  assert.deepStrictEqual(c.map(function (x) { return x.id + ':' + x.label; }), ['meteo:Meteo', 'meteo-roma:Meteo Roma']);
  config.saveHome({ columns: 6, rows: 4, tiles: [{ id: 'meteo-roma', x: 0, y: 0, w: 2, h: 2 }, { id: 'clock', x: 2, y: 0, w: 2, h: 2 }] });
  const t = config.dock().pages.filter(function (p) { return p.id === 'main'; })[0].tiles[0];
  assert.strictEqual(t.widget, 'meteo');
  assert.strictEqual(t.citta, 'Roma', 'le props arrivano al widget');
  config.saveHome(null);
});
