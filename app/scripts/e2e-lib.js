'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

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
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
    return r.result.value;
  }
  async screenshot(file) {
    const shot = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    return file;
  }
  close() { try { this.ws.close(); } catch (e) { } }
}

class Session {
  constructor(opts) {
    this.port = opts.port;
    this.cdpPort = opts.cdpPort;
    this.base = 'http://127.0.0.1:' + opts.port;
    this.env = opts.env || {};
    this.token = 'DEMO1234';
    this.demo = null;
    this.browser = null;
    this.cdp = null;
    this.profile = null;
  }

  async api(method, url, body, headers) {
    const res = await fetch(this.base + url, {
      method: method,
      headers: Object.assign({ 'Content-Type': 'application/json', 'X-Dock-Token': this.token }, headers || {}),
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json();
    if (!json.ok) throw new Error(url + ': ' + json.error.message);
    return json.data;
  }

  async start() {
    const browser = findBrowser();
    if (!browser) throw new Error('Nessun browser trovato (Edge o Chrome): BROWSER=percorso');
    this.demo = spawn(process.execPath, [path.join(__dirname, 'demo.js')], { env: Object.assign({}, process.env, this.env, { DEMO_PORT: String(this.port) }), stdio: 'ignore' });
    this.profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-e2e-profile-'));
    const self = this;
    await waitFor(async function () { return (await fetch(self.base + '/api/health')).ok; }, 20000, 'demo');
    this.browser = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + this.cdpPort, '--user-data-dir=' + this.profile, 'about:blank'], { stdio: 'ignore' });
    const target = await waitFor(async function () {
      const list = await (await fetch('http://127.0.0.1:' + self.cdpPort + '/json/list')).json();
      return list.filter(function (t) { return t.type === 'page'; })[0];
    }, 20000, 'browser');
    this.cdp = new Cdp(target.webSocketDebuggerUrl);
    await this.cdp.open;
    await this.cdp.send('Page.enable');
    await this.cdp.send('Runtime.enable');
    return this;
  }

  async stop() {
    if (this.cdp) this.cdp.close();
    if (this.browser) this.browser.kill();
    if (this.demo) this.demo.kill();
    await sleep(500);
    try { fs.rmSync(this.profile, { recursive: true, force: true }); } catch (e) { }
  }
}

class Report {
  constructor() { this.failed = 0; }
  group(name, extra) { console.log('\n' + name + (extra ? '  (' + extra + ')' : '')); }
  check(name, ok, detail) {
    if (!ok) this.failed++;
    console.log('  ' + (ok ? 'OK ' : 'NO ') + name + (detail ? ' - ' + detail : ''));
    return !!ok;
  }
  end() {
    console.log(this.failed ? '\n' + this.failed + ' controlli NON riusciti' : '\nTutti i controlli riusciti');
    process.exit(this.failed ? 1 : 0);
  }
}

module.exports = { sleep: sleep, waitFor: waitFor, findBrowser: findBrowser, Cdp: Cdp, Session: Session, Report: Report };
