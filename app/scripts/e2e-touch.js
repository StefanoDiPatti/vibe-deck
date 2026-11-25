'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { Finger } = require('./e2e-lib');

const PORT = parseInt(process.env.E2E_PORT, 10) || 8792;
const CDP_PORT = parseInt(process.env.E2E_CDP_PORT, 10) || 9333;
const BASE = 'http://127.0.0.1:' + PORT;
const TOKEN = 'DEMO1234';
const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), 'vibe-e2e');

const DEVICES = [
  { name: 'tablet', width: 1280, height: 800, dpr: 1 },
  { name: 'tablet-small', width: 1024, height: 600, dpr: 1 },
  { name: 'phone-landscape', width: 844, height: 390, dpr: 3 },
  { name: 'phone-portrait', width: 390, height: 844, dpr: 3 }
];

const HOME = {
  columns: 6, rows: 5,
  tiles: [
    { id: 'meteo.adesso', x: 0, y: 0, w: 3, h: 1 }, { id: 'audio.volume', x: 3, y: 0, w: 3, h: 1 },
    { id: 'meteo.settimana', x: 0, y: 1, w: 3, h: 2 }, { id: 'pcinfo.dischi', x: 3, y: 1, w: 3, h: 2 },
    { id: 'pcinfo.scorciatoie', x: 0, y: 3, w: 3, h: 2 }, { id: 'audio.microfono', x: 3, y: 3, w: 3, h: 1 },
    { id: 'pcinfo.cpu', x: 3, y: 4, w: 3, h: 1 }
  ]
};

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function api(method, url, body, headers) {
  const res = await fetch(BASE + url, {
    method: method,
    headers: Object.assign({ 'Content-Type': 'application/json', 'X-Dock-Token': TOKEN }, headers || {}),
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json();
  if (!json.ok) throw new Error(url + ': ' + json.error.message);
  return json.data;
}

async function waitFor(fn, ms, what) {
  const end = Date.now() + ms;
  let last = null;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e; }
    await sleep(200);
  }
  throw new Error('Tempo scaduto: ' + what + (last instanceof Error ? ' (' + last.message + ')' : ''));
}

function findBrowser() {
  if (process.env.BROWSER) return process.env.BROWSER;
  const list = process.platform === 'win32' ? [
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe')
  ] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  return list.filter(function (p) { return fs.existsSync(p); })[0];
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = {};
    const self = this;
    this.ws.onmessage = function (e) {
      const m = JSON.parse(e.data);
      if (m.id && self.pending[m.id]) {
        const p = self.pending[m.id];
        delete self.pending[m.id];
        if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
      }
    };
    this.open = new Promise(function (r) { self.ws.onopen = r; });
  }
  send(method, params) {
    const self = this;
    return new Promise(function (resolve, reject) {
      const i = ++self.id;
      self.pending[i] = { resolve: resolve, reject: reject };
      self.ws.send(JSON.stringify({ id: i, method: method, params: params || {} }));
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '') + ' ' + expr.slice(0, 120));
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch (e) { } }
}

function pageId(cdp) { return cdp.eval('typeof D==="undefined"?"NO-D "+location.href+" "+document.title:D.store.get("page","")'); }

function tileExpr(label, inner) {
  return '(function(){var t=[].slice.call(document.querySelectorAll(".w-shape")).filter(function(n){var h=n.querySelector(".w-title");return h&&h.textContent.trim().toUpperCase()==="' + label + '";})[0];if(!t)return null;' + inner + '})()';
}
function rectOf(label, selector, index) {
  return tileExpr(label, 'var n=t.querySelectorAll("' + selector + '")[' + (index || 0) + '];if(!n)return null;var r=n.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};');
}

async function runDevice(cdp, dev) {
  const result = { device: dev.name, checks: [] };
  const check = function (name, ok, detail) { result.checks.push({ name: name, ok: !!ok, detail: detail || '' }); };
  const finger = new Finger(cdp);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: dev.width, height: dev.height, deviceScaleFactor: dev.dpr, mobile: true });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Page.navigate', { url: BASE + '/?t=' + TOKEN + '&page=main' });
  await waitFor(function () { return cdp.eval(tileExpr('PROSSIMI GIORNI', 'return t.querySelectorAll(".sh-row").length>=7;')); }, 20000, 'lista meteo');
  await waitFor(function () { return cdp.eval(tileExpr('DISCHI', 'return t.querySelectorAll(".sh-row").length>=1;')); }, 20000, 'lista dischi');
  await sleep(600);

  const listSel = '.sh-list';
  const box = await cdp.eval(rectOf('PROSSIMI GIORNI', listSel));
  const sizes = await cdp.eval(tileExpr('PROSSIMI GIORNI', 'var l=t.querySelector(".sh-list");return {sh:l.scrollHeight,ch:l.clientHeight};'));
  if (sizes.sh <= sizes.ch + 2) {
    check('scroll lista meteo', true, 'tutto visibile, niente da scorrere');
  } else {
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const vert = [cx, box.y + box.h * 0.8, cx, box.y + box.h * 0.2], rotUp = [box.x + box.w * 0.2, cy, box.x + box.w * 0.8, cy];
    const attempts = dev.height > dev.width && dev.width < 600 ? [rotUp] : [vert];
    let top = 0;
    for (let i = 0; i < attempts.length && !top; i++) {
      await finger.drag(attempts[i][0], attempts[i][1], attempts[i][2], attempts[i][3]);
      await sleep(400);
      top = await cdp.eval(tileExpr('PROSSIMI GIORNI', 'return t.querySelector(".sh-list").scrollTop;'));
    }
    check('scroll lista meteo', top > 0, 'scrollTop=' + top + ' (contenuto ' + sizes.sh + ' px, visibili ' + sizes.ch + ')');
    await cdp.eval(tileExpr('PROSSIMI GIORNI', 't.querySelector(".sh-list").scrollTop=0;return true;'));
  }

  const before = (await api('GET', '/api/demo/actions')).length;
  const row = await cdp.eval(rectOf('DISCHI', '.sh-row'));
  await finger.tap(row.x + row.w / 2, row.y + row.h / 2);
  const afterRow = await waitFor(async function () { const a = await api('GET', '/api/demo/actions'); return a.length > before ? a : null; }, 4000, 'tocco riga disco').catch(function () { return null; });
  check('tocco riga disco', afterRow && afterRow[afterRow.length - 1].type === 'open_path', afterRow ? JSON.stringify(afterRow[afterRow.length - 1]) : 'nessuna azione');

  const n1 = (await api('GET', '/api/demo/actions')).length;
  const btn = await cdp.eval(rectOf('SCORCIATOIE', '.sh-btn', 1));
  if (!btn) check('tocco pulsante scorciatoie', false, 'pulsante non trovato');
  else {
    await cdp.eval(tileExpr('SCORCIATOIE', 'var b=t.querySelectorAll(".sh-btn")[1];window.__ev=[];["touchstart","touchmove","touchend","touchcancel","click"].forEach(function(k){b.addEventListener(k,function(e){var p=e.changedTouches&&e.changedTouches[0];window.__ev.push(k+(p?"@"+Math.round(p.clientX)+","+Math.round(p.clientY):""));},true);});return true;'));
    await finger.tap(btn.x + btn.w / 2, btn.y + btn.h / 2);
    const afterBtn = await waitFor(async function () { const a = await api('GET', '/api/demo/actions'); return a.length > n1 ? a : null; }, 4000, 'tocco pulsante').catch(function () { return null; });
    const last = afterBtn && afterBtn[afterBtn.length - 1];
    const under = last ? '' : await cdp.eval('(function(){var n=document.elementFromPoint(' + (btn.x + btn.w / 2) + ',' + (btn.y + btn.h / 2) + ');return n?(n.tagName+"."+n.className.baseVal+n.className):"niente";})()');
    check('tocco pulsante scorciatoie', last && last.type === 'hotkey' && last.keys.join('+') === 'WIN+D', last ? JSON.stringify(last) : 'nessuna azione; sotto il dito: ' + under + ' ' + JSON.stringify(btn) + ' eventi: ' + JSON.stringify(await cdp.eval('window.__ev')));
  }

  await api('POST', '/api/shapes/audio/volume/set', { value: 20 });
  await sleep(3500);
  const track = await cdp.eval(rectOf('VOLUME USCITA', '.sh-track'));
  const horizontal = track.w >= track.h;
  const from = horizontal ? [track.x + track.w * 0.2, track.y + track.h / 2] : [track.x + track.w / 2, track.y + track.h * 0.2];
  const to = horizontal ? [track.x + track.w * 0.8, track.y + track.h / 2] : [track.x + track.w / 2, track.y + track.h * 0.8];
  await finger.drag(from[0], from[1], to[0], to[1], 16);
  const vol = await waitFor(async function () { const v = await api('GET', '/api/shapes/audio/volume'); return v.value >= 60 ? v.value : null; }, 4000, 'volume').catch(function () { return null; });
  const shown = await cdp.eval(tileExpr('VOLUME USCITA', 'return t.querySelector(".sh-sval").textContent;'));
  check('slider volume', vol !== null, 'PC=' + vol + ' tablet="' + shown + '"');

  check('slider non cambia pagina', (await pageId(cdp)) === 'main', 'pagina=' + (await pageId(cdp)));

  const tabs = await cdp.eval('[].map.call(document.querySelectorAll("#tabs .tab"),function(t){return t.getAttribute("data-page");})');
  const st = await cdp.eval('(function(){var r=document.getElementById("stage").getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};})()');
  const rot = await cdp.eval('document.body.className.indexOf("rot")>=0');
  const scx = st.x + st.w / 2, scy = st.y + st.h / 2;
  const swipeNext = rot ? [scx, st.y + st.h * 0.8, scx, st.y + st.h * 0.2] : [st.x + st.w * 0.8, scy, st.x + st.w * 0.2, scy];
  const swipePrev = [swipeNext[2], swipeNext[3], swipeNext[0], swipeNext[1]];
  const i0 = tabs.indexOf('main');
  await finger.drag(swipeNext[0], swipeNext[1], swipeNext[2], swipeNext[3], 8);
  await sleep(500);
  const afterNext = await pageId(cdp);
  check('swipe: pagina successiva', afterNext === tabs[i0 + 1], 'da main a ' + afterNext + ' (attesa ' + tabs[i0 + 1] + ', rot=' + rot + ')');
  const shotSwipe = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, dev.name + '-swipe.png'), Buffer.from(shotSwipe.data, 'base64'));
  await finger.drag(swipePrev[0], swipePrev[1], swipePrev[2], swipePrev[3], 8);
  await sleep(500);
  check('swipe: pagina precedente', (await pageId(cdp)) === 'main', 'tornata a ' + (await pageId(cdp)));
  const nAct = (await api('GET', '/api/demo/actions')).length;
  await finger.drag(swipePrev[0], swipePrev[1], swipePrev[2], swipePrev[3], 8);
  await sleep(500);
  const firstOk = i0 > 0 ? (await pageId(cdp)) === tabs[i0 - 1] : (await pageId(cdp)) === 'main';
  check('swipe: prima pagina / nessun tocco', firstOk && (await api('GET', '/api/demo/actions')).length === nAct, 'pagina=' + (await pageId(cdp)));
  const rb = await cdp.eval('(function(){var n=document.getElementById("refresh-btn"),h=document.getElementById("host");if(!n||!n.querySelector("svg"))return null;var b=n.getBoundingClientRect(),c=h.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2,w:b.width,hostRight:c.right,hostTop:c.top,vw:innerWidth,vh:innerHeight};})()');
  const nextToHost = rb && (rot ? rb.y > rb.hostTop && rb.x > rb.vw / 2 : rb.x > rb.hostRight && rb.x < rb.vw / 3);
  check('pulsante aggiorna accanto al nome del PC', nextToHost, JSON.stringify(rb));
  if (rb) {
    await cdp.eval('window.__prima=1;true');
    await finger.tap(rb.x, rb.y);
    const reloaded = await waitFor(function () { return cdp.eval('!window.__prima&&!!window.D&&document.querySelectorAll("#stage .tile").length>0'); }, 15000, 'ricarica').catch(function () { return false; });
    check('tocco su aggiorna: la pagina si ricarica', reloaded);
    await sleep(600);
  }
  await cdp.eval('location.hash="";D.store.set("page","main");location.reload();true');
  await waitFor(function () { return cdp.eval(tileExpr('PROSSIMI GIORNI', 'return t.querySelectorAll(".sh-row").length>=7;')); }, 20000, 'ritorno a main');
  await sleep(600);

  const glyphs = await cdp.eval('document.querySelectorAll(".w-shape svg.pic").length');
  check('illustrazioni meteo', glyphs >= 8, glyphs + ' illustrazioni');

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(OUT, dev.name + '.png');
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  result.screenshot = file;
  return result;
}

async function main() {
  const browser = findBrowser();
  if (!browser) { console.error('Nessun browser trovato (Edge o Chrome): BROWSER=percorso npm run e2e'); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const demo = spawn(process.execPath, [path.join(__dirname, 'demo.js')], { env: Object.assign({ DEMO_DRY: '1' }, process.env, { DEMO_PORT: String(PORT) }), stdio: 'ignore' });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-e2e-profile-'));
  let edge = null, cdp = null, failed = 0;
  try {
    await waitFor(async function () { return (await fetch(BASE + '/api/health')).ok; }, 20000, 'demo');
    await api('POST', '/api/control/home', HOME, { 'x-dock-control': '1' });
    edge = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
    const target = await waitFor(async function () {
      const list = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json();
      return list.filter(function (t) { return t.type === 'page'; })[0];
    }, 20000, 'browser');
    cdp = new Cdp(target.webSocketDebuggerUrl);
    await cdp.open;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    for (const dev of DEVICES) {
      let r;
      try { r = await runDevice(cdp, dev); } catch (e) { r = { device: dev.name, checks: [{ name: 'pagina', ok: false, detail: e.message }] }; }
      console.log('\n' + r.device + (r.screenshot ? '  (' + r.screenshot + ')' : ''));
      r.checks.forEach(function (c) {
        if (!c.ok) failed++;
        console.log('  ' + (c.ok ? 'OK ' : 'NO ') + c.name + (c.detail ? ' - ' + c.detail : ''));
      });
    }
  } finally {
    if (cdp) cdp.close();
    if (edge) edge.kill();
    demo.kill();
    await sleep(500);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { }
  }
  console.log(failed ? '\n' + failed + ' controlli NON riusciti' : '\nTutti i controlli riusciti');
  process.exit(failed ? 1 : 0);
}

main().catch(function (e) { console.error(e); process.exit(1); });
