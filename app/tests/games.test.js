const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-games-'));
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.LOG_LEVEL = 'error';

const games = require('../server/services/games');
const config = require('../server/config');

const EXE = path.join(tmp, process.platform === 'win32' ? 'MioGioco.exe' : 'miogioco.sh');
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

function gamesPage() {
  return config.dock().pages.filter(function (p) { return p.id === 'games'; })[0];
}

test.before(function () { fs.writeFileSync(EXE, 'x'); });

test('senza giochi: un pulsante che rimanda al pannello', function () {
  const p = gamesPage();
  assert.ok(p, 'pagina GAMES');
  assert.strictEqual(p.tiles.length, 1);
  assert.strictEqual(p.tiles[0].id, 'games-empty');
});

test('aggiunta: diventa app (gioco, primo piano) e pulsante della pagina', async function () {
  await assert.rejects(games.add({ path: path.join(tmp, 'non-esiste.exe'), label: 'X' }), /non trovato/);
  await assert.rejects(games.add({ path: EXE, label: '  ' }), /nome/);
  await games.add({ path: EXE, label: 'Mio Gioco', process: 'MioGioco.exe' });
  await games.add({ path: EXE, label: 'Mio Gioco' });
  const apps = config.apps();
  const a = apps.game_mio_gioco;
  assert.ok(a);
  assert.strictEqual(a.game, true);
  assert.strictEqual(a.whenRunning, 'focus');
  assert.strictEqual(a.process, 'miogioco');
  assert.strictEqual(a[process.platform === 'win32' ? 'windows' : 'linux'].path, EXE);
  assert.ok(apps.game_mio_gioco_2);
  const p = gamesPage();
  assert.deepStrictEqual(p.tiles.map(function (t) { return t.id; }), ['game_mio_gioco', 'game_mio_gioco_2']);
  assert.strictEqual(p.tiles[0].label, 'MIO GIOCO');
  assert.deepStrictEqual(p.tiles[0].action, { type: 'launch', app: 'game_mio_gioco' });
  assert.strictEqual(p.tiles[0].showRunning, 'game_mio_gioco');
  assert.ok(!p.tiles[0].image, 'senza icona: quella di riserva');
  assert.ok(fs.existsSync(path.join(process.env.DOCK_DATA_DIR, 'games.json')));
});

test('icona: solo immagini vere, servita al tablet; ordine e rimozione', async function () {
  await assert.rejects(games.setIcon('mio_gioco', { url: 'http://esempio.it/a.png' }), /non valido/);
  const tok = 'abc';
  const tmpPng = path.join(tmp, 'anteprima.png');
  fs.writeFileSync(tmpPng, PNG);
  assert.throws(function () { games.previewFile(tok); }, /scaduta/);
  assert.strictEqual(games.imageType(PNG), 'png');
  assert.strictEqual(games.imageType(Buffer.from('<svg/>')), '');
  games.reorder(['mio_gioco_2', 'mio_gioco']);
  assert.strictEqual(gamesPage().tiles[0].id, 'game_mio_gioco_2');
  games.remove('mio_gioco_2');
  games.remove('mio_gioco');
  assert.strictEqual(gamesPage().tiles[0].id, 'games-empty');
  assert.throws(function () { games.remove('mio_gioco'); }, /sconosciuto/);
});

test('nome proposto: senza "Launcher", "Beta" e simili', function () {
  assert.strictEqual(games.cleanLabel('Nome Gioco Beta Launcher'), 'Nome Gioco');
  assert.strictEqual(games.cleanLabel('Super_Game_x64'), 'Super Game');
  assert.strictEqual(games.cleanLabel('Launcher'), 'Launcher');
});
