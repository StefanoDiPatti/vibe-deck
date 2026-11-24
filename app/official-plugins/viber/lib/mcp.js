'use strict';
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const childProcess = require('child_process');

const PROTOCOL = '2024-11-05';
const IDLE_MS = 5 * 60 * 1000;

function err(msg, code) { return Object.assign(new Error(msg), { code: code || 'UNAVAILABLE' }); }

function endpointFile() {
  return process.env.VIBER_MCP_ENDPOINT || path.join(os.homedir(), '.viber', 'browser-mcp.json');
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}

function registered() {
  const cfg = readJson(path.join(os.homedir(), '.claude.json'));
  const s = cfg && cfg.mcpServers && cfg.mcpServers['viber-browser'];
  if (!s || typeof s.command !== 'string' || !Array.isArray(s.args)) return null;
  return { command: s.command, args: s.args.map(String), env: s.env && typeof s.env === 'object' ? s.env : {} };
}

function installed() {
  const home = os.homedir();
  const list = process.platform === 'win32'
    ? [path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Programs', 'Viber', 'resources'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Viber', 'resources')]
    : [path.join(home, '.local', 'opt', 'Viber', 'resources'), '/opt/Viber/resources', '/usr/lib/viber/resources'];
  for (let i = 0; i < list.length; i++) {
    const file = path.join(list[i], 'browser-mcp-server.cjs');
    if (fs.existsSync(file)) return { command: 'node', args: [file], env: {} };
  }
  return null;
}

function serverCommand() {
  if (process.env.VIBER_MCP_SERVER) return { command: 'node', args: [process.env.VIBER_MCP_SERVER], env: {} };
  const s = registered() || installed();
  if (!s) return null;
  const script = s.args[0];
  if (s.command === 'node' && script && !fs.existsSync(script)) return installed();
  return s;
}

function reachable(timeout) {
  const cfg = readJson(endpointFile());
  if (!cfg || typeof cfg.port !== 'number') return Promise.resolve(false);
  return new Promise(function (resolve) {
    const sock = net.connect({ host: '127.0.0.1', port: cfg.port });
    const done = function (ok) { sock.destroy(); resolve(ok); };
    sock.setTimeout(timeout || 1000, function () { done(false); });
    sock.on('connect', function () { done(true); });
    sock.on('error', function () { done(false); });
  });
}

function textOf(result) {
  return ((result && result.content) || []).filter(function (c) { return c && c.type === 'text'; }).map(function (c) { return c.text; }).join('\n');
}

function parsed(text) {
  try { return JSON.parse(text); } catch (e) { return text; }
}

function Session(opts) {
  this.args = opts.args || [];
  this.cwd = opts.cwd || os.homedir();
  this.proc = null;
  this.ready = null;
  this.pending = {};
  this.seq = 0;
  this.idle = null;
}

Session.prototype.start = function () {
  if (this.ready) return this.ready;
  const cmd = serverCommand();
  if (!cmd) return Promise.reject(err('Non trovo il server MCP di Viber: installa Viber e aprilo almeno una volta'));
  const self = this;
  const bin = cmd.command === 'node' ? process.execPath : cmd.command;
  const env = Object.assign({}, process.env, cmd.env);
  let proc;
  try {
    proc = childProcess.spawn(bin, cmd.args.concat(this.args), { cwd: this.cwd, env: env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  } catch (e) {
    return Promise.reject(err('Non riesco ad avviare il server MCP di Viber: ' + e.message));
  }
  this.proc = proc;
  let buf = '', stderr = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', function (d) {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let m = null;
      try { m = JSON.parse(line); } catch (e) { continue; }
      const p = m && m.id !== undefined ? self.pending[m.id] : null;
      if (!p) continue;
      delete self.pending[m.id];
      clearTimeout(p.timer);
      if (m.error) p.reject(err('Viber: ' + (m.error.message || 'errore MCP')));
      else p.resolve(m.result);
    }
  });
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', function (d) { stderr = (stderr + d).slice(-500); });
  const gone = function (why) {
    if (self.proc !== proc) return;
    self.proc = null;
    self.ready = null;
    clearTimeout(self.idle);
    self.failAll(/not running/i.test(stderr) ? 'Viber non è aperto su questo PC' : why);
  };
  proc.on('error', function (e) { gone('Server MCP di Viber: ' + e.message); });
  proc.on('exit', function () { gone('Il server MCP di Viber si è chiuso'); });
  proc.stdin.on('error', function () { });
  this.ready = this.rpc('initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'vibe-deck', version: '1' } }, 10000)
    .then(function () { self.notify('notifications/initialized'); });
  this.ready.catch(function () { self.stop(); });
  return this.ready;
};

Session.prototype.send = function (msg) {
  if (this.proc) this.proc.stdin.write(JSON.stringify(Object.assign({ jsonrpc: '2.0' }, msg)) + '\n');
};

Session.prototype.notify = function (method, params) {
  this.send({ method: method, params: params || {} });
};

Session.prototype.rpc = function (method, params, timeout) {
  const self = this;
  const id = ++this.seq;
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      delete self.pending[id];
      reject(err('Viber non risponde'));
    }, timeout || 10000);
    self.pending[id] = { resolve: resolve, reject: reject, timer: timer };
    self.send({ id: id, method: method, params: params || {} });
  });
};

Session.prototype.touch = function () {
  const self = this;
  clearTimeout(this.idle);
  this.idle = setTimeout(function () { self.stop(); }, IDLE_MS);
  if (this.idle.unref) this.idle.unref();
};

Session.prototype.call = function (tool, args, timeout) {
  const self = this;
  return this.start().then(function () {
    self.touch();
    return self.rpc('tools/call', { name: tool, arguments: args || {} }, timeout);
  }).then(function (result) {
    const text = textOf(result);
    if (result && result.isError) throw err(text.replace(/^Error:\s*/, ''), 'TOOL_ERROR');
    const data = parsed(text);
    if (data && typeof data === 'object' && typeof data.error === 'string') throw err(data.error, 'TOOL_ERROR');
    return data;
  });
};

Session.prototype.failAll = function (why) {
  const pending = this.pending;
  this.pending = {};
  Object.keys(pending).forEach(function (id) {
    clearTimeout(pending[id].timer);
    pending[id].reject(err(why));
  });
};

Session.prototype.stop = function () {
  const proc = this.proc;
  this.proc = null;
  this.ready = null;
  clearTimeout(this.idle);
  this.failAll('Collegamento con Viber chiuso');
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve();
  return new Promise(function (resolve) {
    proc.once('exit', function () { resolve(); });
    try { proc.kill(); } catch (e) { resolve(); }
  });
};

module.exports = { Session: Session, serverCommand: serverCommand, reachable: reachable, endpointFile: endpointFile, err: err };
