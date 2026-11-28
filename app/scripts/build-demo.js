'use strict';
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const TOKEN = 'DEMO1234';
const SHIM = path.join(__dirname, 'demo-shim.js');
const HOME = {
  columns: 6, rows: 4,
  tiles: [
    { id: 'meteo.adesso', x: 0, y: 0, w: 3, h: 1 }, { id: 'nowplaying', x: 3, y: 0, w: 3, h: 2 },
    { id: 'meteo.settimana', x: 0, y: 1, w: 3, h: 2 }, { id: 'audio.volume', x: 3, y: 2, w: 3, h: 1 },
    { id: 'clock', x: 0, y: 3, w: 3, h: 1 }, { id: 'pcinfo.cpu', x: 3, y: 3, w: 3, h: 1 }
  ]
};

function freePort() {
  return new Promise(function (resolve, reject) {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', function () { const p = s.address().port; s.close(function () { resolve(p); }); });
    s.on('error', reject);
  });
}

async function waitFor(fn, ms) {
  const end = Date.now() + ms;
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch (e) { }
    if (Date.now() > end) throw new Error('demo server did not start');
    await new Promise(function (r) { setTimeout(r, 200); });
  }
}

function assetsIn(text, base) {
  const out = [];
  const add = function (u) {
    if (!u || /^(?:[a-z]+:|\/\/|#|data:)/i.test(u)) return;
    const clean = u.split('#')[0].split('?')[0];
    if (clean) out.push(path.posix.normalize(path.posix.join(path.posix.dirname(base), clean)));
  };
  String(text).replace(/(?:src|href)="([^"]+)"/g, function (m, u) { add(u); return m; });
  String(text).replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g, function (m, u) { add(u); return m; });
  return out;
}

async function get(base, url) {
  const res = await fetch(base + url, { headers: { 'X-Dock-Token': TOKEN } });
  return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') || '' };
}

function save(out, url, buffer) {
  const file = path.join(out, url.replace(/^\/+/, ''));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
}

async function snapshot(base) {
  const data = {};
  const grab = async function (url) {
    const r = await get(base, url);
    if (r.status === 200) { try { data[url.split('?')[0]] = JSON.parse(r.buffer.toString('utf8')); } catch (e) { return null; } }
    return data[url.split('?')[0]] || null;
  };
  const cfg = await grab('/api/config');
  await grab('/api/state');
  await grab('/api/media/queue');
  await grab('/api/permissions');
  const keys = {};
  ((cfg && cfg.data && cfg.data.dock && cfg.data.dock.pages) || []).forEach(function (p) {
    (p.tiles || []).forEach(function (t) { if (t.widget === 'shape' && t.def) keys[t.def] = true; });
  });
  for (const k of Object.keys(keys)) await grab('/api/shapes/' + k);
  return data;
}

async function build(target) {
  const out = path.resolve(target);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const port = await freePort();
  const base = 'http://127.0.0.1:' + port;
  const child = spawn(process.execPath, [path.join(__dirname, 'demo.js')], { env: Object.assign({}, process.env, { DEMO_PORT: String(port), DEMO_DRY: '1', LOG_LEVEL: 'error' }), stdio: 'ignore' });
  try {
    await waitFor(async function () { return (await fetch(base + '/api/health')).ok; }, 30000);
    const set = await fetch(base + '/api/control/home', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dock-Control': '1', 'X-Dock-Token': TOKEN }, body: JSON.stringify(HOME) });
    if (!set.ok) throw new Error('could not set the demo HOME: ' + set.status);
    await new Promise(function (r) { setTimeout(r, 2500); });
    const data = await snapshot(base);
    const html = (await get(base, '/')).buffer.toString('utf8');
    const queue = assetsIn(html, '/index.html');
    const seen = {};
    while (queue.length) {
      const url = '/' + queue.shift().replace(/^\/+/, '');
      if (seen[url] || /^\/(?:api|control)\//.test(url)) continue;
      seen[url] = true;
      const r = await get(base, url);
      if (r.status !== 200) continue;
      save(out, url, r.buffer);
      if (/css|javascript/.test(r.type) || /\.(?:css|js)$/.test(url)) assetsIn(r.buffer.toString('utf8'), url).forEach(function (a) { queue.push(a); });
    }
    const shim = fs.readFileSync(SHIM, 'utf8');
    fs.writeFileSync(path.join(out, 'demo-shim.js'), shim);
    fs.writeFileSync(path.join(out, 'demo-data.js'), 'window.DEMO_DATA = ' + JSON.stringify(data) + ';\n');
    const page = html.replace('<script id="theme-boot">', '<script src="demo-data.js"></script>\n  <script src="demo-shim.js"></script>\n  <script id="theme-boot">').replace('<title>Vibe Deck</title>', '<title>Vibe Deck demo</title>');
    fs.writeFileSync(path.join(out, 'index.html'), page);
    fs.writeFileSync(path.join(out, '.nojekyll'), '');
    return { dir: out, calls: Object.keys(data).length };
  } finally {
    child.kill();
  }
}

if (require.main === module) {
  build(process.argv[2] || path.join(os.tmpdir(), 'vibe-demo')).then(function (r) { console.log('Demo ready in ' + r.dir + ' (' + r.calls + ' recorded answers)'); }, function (e) { console.error(e.message); process.exit(1); });
}

module.exports = { build: build, assetsIn: assetsIn };
