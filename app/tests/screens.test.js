const test = require('node:test');
const assert = require('node:assert');

process.env.DOCK_TOKEN = 'TESTCODE';
process.env.LOG_LEVEL = 'error';
process.env.DOCK_DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'dock-test-'));
const screens = require('../official-plugins/screens/lib/screens');
const common = require('../server/platform/common');
const config = require('../server/config');

const WIDE = { id: 'A', w: 2560, h: 1440, portrait: false, work: { x: 0, y: 0, w: 2560, h: 1392 } };
const TALL = { id: 'B', w: 1080, h: 1920, portrait: true, work: { x: 2560, y: 0, w: 1080, h: 1872 } };

function layout(id) { return screens.LAYOUTS.filter(function (l) { return l.id === id; })[0]; }

test('ogni disposizione copre tutta l\'area senza sovrapposizioni', function () {
  screens.LAYOUTS.forEach(function (l) {
    let area = 0;
    l.zones.forEach(function (z) {
      assert.ok(z[0] >= 0 && z[1] >= 0 && z[0] + z[2] <= 1.0001 && z[1] + z[3] <= 1.0001, l.id + ' esce dallo schermo');
      area += z[2] * z[3];
    });
    assert.ok(Math.abs(area - 1) < 0.001, l.id + ' copre ' + area);
  });
});

test('zone in pixel: metà sinistra e destra si toccano senza buchi', function () {
  const zs = screens._zonesFor(layout('half'), WIDE);
  const a = screens._zoneRect(WIDE, zs[0]), b = screens._zoneRect(WIDE, zs[1]);
  assert.deepStrictEqual(a, { x: 0, y: 0, w: 1280, h: 1392 });
  assert.strictEqual(b.x, a.x + a.w);
  assert.strictEqual(b.x + b.w, 2560);
});

test('monitor verticale: le colonne diventano righe', function () {
  const zs = screens._zonesFor(layout('half'), TALL);
  const top = screens._zoneRect(TALL, zs[0]), bottom = screens._zoneRect(TALL, zs[1]);
  assert.deepStrictEqual(top, { x: 2560, y: 0, w: 1080, h: 936 });
  assert.deepStrictEqual(bottom, { x: 2560, y: 936, w: 1080, h: 936 });
});

test('nome del monitor dall\'EDID abbinato al DeviceID', function () {
  const names = { 'display\\msi3ca4\\5&1a2b&0&uid4352_0': 'MSI MP242', 'display\\aoc2701\\5&1a2b&0&uid4353_0': 'VG270U P' };
  assert.strictEqual(common.monitorName('\\\\?\\DISPLAY#MSI3CA4#5&1a2b&0&UID4352#{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}', names), 'MSI MP242');
  assert.strictEqual(common.monitorName('', names), '');
  assert.strictEqual(common.monitorName('\\\\?\\DISPLAY#XXX#1#{x}', names), '');
});

test('nessun gioco nei default (si aggiungono dal pannello); pagine GAMES e SCHERMI', function () {
  const defApps = config.parseJson(require('fs').readFileSync(require('path').join(__dirname, '..', 'config', 'defaults', 'apps.json'), 'utf8')).apps;
  Object.keys(defApps).forEach(function (id) { assert.ok(!defApps[id].game, id + ': i giochi non vanno nel repository'); });
  const sp = config.parseJson(require('fs').readFileSync(require('path').join(__dirname, '..', 'official-plugins', 'screens', 'pages', 'screens.json'), 'utf8'));
  const raw = Object.assign({}, config.defaultDock(), { pages: config.defaultDock().pages.concat([sp]) });
  assert.strictEqual(raw.pages.filter(function (p) { return p.id === 'games'; })[0].source, 'games');
  const ids = config.normalizeDock(raw, {}, 'windows').pages.map(function (p) { return p.id; });
  assert.ok(ids.indexOf('games') >= 0 && ids.indexOf('screens') >= 0);
  const lin = config.normalizeDock(raw, {}, 'linux').pages.filter(function (p) { return p.id === 'screens'; })[0];
  assert.ok(lin, 'SCHERMI anche su Linux');
  assert.strictEqual(lin.tiles[0].system, 'linux');
});

test('API schermi e Discord richiedono il token', async function () {
  const { app } = require('../server/index.js');
  const server = await new Promise(function (resolve) { const s = app.listen(0, '127.0.0.1', function () { resolve(s); }); });
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    for (const p of ['/api/screens', '/api/screens/windows']) {
      const r = await fetch(base + p);
      assert.strictEqual(r.status, 401, p);
    }
    const r = await fetch(base + '/api/discord/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dock-Token': 'TESTCODE' }, body: JSON.stringify({ what: 'rm -rf' }) });
    assert.strictEqual(r.status, 400);
    const z = await fetch(base + '/api/screens/place', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dock-Token': 'TESTCODE' }, body: JSON.stringify({ window: '1', monitor: 'x', layout: 'nope', zone: 9 }) });
    assert.ok(z.status >= 400, 'posizionamento non valido rifiutato');
  } finally {
    server.close();
    require('../server/platform').shutdown();
  }
});
