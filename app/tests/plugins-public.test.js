const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-public-'));
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.DOCK_PLUGINS_DIR = path.join(tmp, 'plugins');
process.env.DOCK_OFFICIAL_PLUGINS_DIR = path.join(tmp, 'official');
process.env.DOCK_TOKEN = 'PUBLIC12';
process.env.LOG_LEVEL = 'error';

fs.mkdirSync(path.join(tmp, 'plugins', 'aperto'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'plugins', 'aperto', 'index.js'), [
  'module.exports = {',
  '  publicRoutes: function (router) { router.get("/logo.png", function (req, res) { res.end("png"); }); router.post("/scrivi", function (req, res) { res.end("no"); }); },',
  '  routes: function (router, ctx) { router.get("/segreto", ctx.route(function () { return { ok: 1 }; })); }',
  '};'
].join('\n'));

test('public plugin routes: read-only and without the access code; normal routes still need it', async function () {
  const { app } = require('../server/index.js');
  const server = await new Promise(function (resolve) { const s = app.listen(0, '127.0.0.1', function () { resolve(s); }); });
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const img = await fetch(base + '/plugins-public/aperto/logo.png');
    assert.strictEqual(img.status, 200);
    assert.strictEqual(await img.text(), 'png');
    assert.strictEqual((await fetch(base + '/plugins-public/aperto/scrivi', { method: 'POST' })).status, 405, 'only GET and HEAD');
    assert.strictEqual((await fetch(base + '/api/plugins/aperto/segreto')).status, 401);
    assert.strictEqual((await fetch(base + '/api/plugins/aperto/segreto', { headers: { 'X-Dock-Token': 'PUBLIC12' } })).status, 200);
  } finally {
    server.close();
    try { require('../server/platform').shutdown(); } catch (e) { }
  }
});
