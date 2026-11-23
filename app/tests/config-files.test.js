const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-cfgfiles-'));
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.LOG_LEVEL = 'error';
const CONF = process.env.DOCK_CONFIG_DIR;
fs.mkdirSync(CONF, { recursive: true });

const config = require('../server/config');

function write(rel, text) {
  const f = path.join(CONF, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  const t = new Date(Date.now() + Math.floor(Math.random() * 100000));
  fs.utimesSync(f, t, t);
}
function ids() { return config.dock().pages.map(function (p) { return p.id; }); }
function page(id) { return config.dock().pages.filter(function (p) { return p.id === id; })[0]; }

test('senza file tuoi: le pagine predefinite arrivano dai file di config/defaults/pages', function () {
  const list = ids();
  ['main', 'apps', 'games', 'screens', 'viber'].forEach(function (id) { assert.ok(list.indexOf(id) >= 0, id); });
  assert.strictEqual(list[0], 'main');
});

test('una pagina nuova in config/pages si aggiunge da sola, con i commenti ammessi', function () {
  const before = config.version();
  write('pages/stream.json', '// pagina mia\n{ "id": "stream", "title": "STREAM", "tiles": [ { "id": "s1", "label": "SCENA 1", "action": { "type": "hotkey", "keys": ["CTRL", "F1"] } } ] }\n');
  const p = page('stream');
  assert.ok(p, 'pagina STREAM');
  assert.strictEqual(p.title, 'STREAM');
  assert.strictEqual(p.tab, true, 'le tue pagine vanno nella barra');
  assert.notStrictEqual(config.version(), before, 'il tablet si ricarica');
});

test('una copia in config/pages vince sulla pagina predefinita con lo stesso id', function () {
  write('pages/apps.json', '{ "id": "apps", "title": "LE MIE APP", "tiles": [ { "id": "x", "label": "X" } ] }\n');
  const p = page('apps');
  assert.strictEqual(p.title, 'LE MIE APP');
  assert.deepStrictEqual(p.tiles.map(function (t) { return t.id; }), ['x']);
  fs.unlinkSync(path.join(CONF, 'pages', 'apps.json'));
  assert.notStrictEqual(page('apps').title, 'LE MIE APP');
});

test('dock.json tuo: id e pagine scritte dentro insieme, id senza file segnalati', function () {
  write('dock.json', '{ "home": "stream", "pages": [ "stream", "main", { "id": "inline", "title": "QUI", "tiles": [] }, "manca" ] }\n');
  const list = ids();
  assert.deepStrictEqual(list.slice(0, 3), ['stream', 'main', 'inline']);
  assert.deepStrictEqual(config.missingPages(), ['manca']);
  const games = page('games');
  assert.ok(games);
  assert.strictEqual(games.tab, false);
  fs.unlinkSync(path.join(CONF, 'dock.json'));
});

test('app e comandi a file: un file per voce o una sezione con più voci', function () {
  write('apps/obs.json', '{ "label": "OBS Studio", "windows": { "path": "obs64.exe" }, "linux": { "path": "obs" } }\n');
  write('apps/varie.json', '{ "apps": { "uno": { "label": "Uno" }, "due": { "label": "Due" } } }\n');
  write('commands/ip.json', '{ "label": "IP", "windows": { "cmd": "ipconfig" }, "linux": { "cmd": "ip", "args": ["a"] } }\n');
  const apps = config.apps();
  assert.strictEqual(apps.obs.label, 'OBS Studio');
  assert.strictEqual(apps.due.label, 'Due');
  assert.ok(apps.blender, 'le app predefinite restano');
  const cmds = config.commands();
  assert.strictEqual(cmds.ip.label, 'IP');
  assert.ok(cmds.lock_pc, 'i comandi predefiniti restano');
});

test('file non valido: errore chiaro e si tiene l\'ultima versione buona', function () {
  write('pages/rotta.json', '{ "id": "rotta", "title": "OK", "tiles": [] }\n');
  assert.strictEqual(page('rotta').title, 'OK');
  write('pages/rotta.json', '{ "id": "rotta", "title": ');
  assert.strictEqual(page('rotta').title, 'OK');
  assert.ok(config.errors().some(function (e) { return /pages\/rotta\.json non valido/.test(e); }));
});
