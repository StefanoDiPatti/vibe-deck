const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const log = require('../log');

const SCRIPT = path.join(__dirname, 'windows-helper.ps1');
const MARK = '@@DOCK ';

function PsHelper(name) {
  this.name = name;
  this.proc = null;
  this.nextId = 1;
  this.pending = {};
  this.ready = null;
  this.info = {};
  this.restarts = 0;
  this.stopped = false;
}

PsHelper.prototype.start = function () {
  if (this.ready) return this.ready;
  const self = this;
  this.ready = new Promise(function (resolve, reject) {
    const proc = spawn('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    self.proc = proc;
    let resolved = false;
    const startTimer = setTimeout(function () {
      if (!resolved) reject(new Error('helper ' + self.name + ': avvio troppo lento'));
    }, 30000);

    readline.createInterface({ input: proc.stdout }).on('line', function (line) {
      const at = line.indexOf(MARK);
      if (at < 0) { if (line.trim()) log.debug('helper:' + self.name, line); return; }
      let msg;
      try { msg = JSON.parse(line.slice(at + MARK.length)); } catch (e) { return; }
      if (msg.ready) {
        resolved = true;
        clearTimeout(startTimer);
        self.info = msg;
        self.restarts = 0;
        log.debug('helper:' + self.name, 'pronto (WinRT: ' + msg.winrt + ')');
        resolve(msg);
        return;
      }
      const p = self.pending[msg.id];
      if (!p) return;
      delete self.pending[msg.id];
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.data); else p.reject(new Error(msg.error || 'errore helper'));
    });
    readline.createInterface({ input: proc.stderr }).on('line', function (line) {
      if (line.trim()) log.warn('helper:' + self.name, line);
    });
    proc.on('error', function (err) {
      clearTimeout(startTimer);
      if (!resolved) reject(err);
    });
    proc.on('exit', function (code) {
      clearTimeout(startTimer);
      self.proc = null;
      self.ready = null;
      Object.keys(self.pending).forEach(function (id) {
        clearTimeout(self.pending[id].timer);
        self.pending[id].reject(new Error('helper terminato'));
      });
      self.pending = {};
      if (!resolved) reject(new Error('helper ' + self.name + ' uscito con codice ' + code));
      if (self.stopped) return;
      self.restarts++;
      const delay = Math.min(30000, 1000 * Math.pow(2, self.restarts));
      log.warn('helper:' + self.name, 'terminato (codice ' + code + '), riavvio tra ' + delay / 1000 + 's');
      setTimeout(function () { if (!self.stopped) self.start().catch(function () {}); }, delay);
    });
  });
  this.ready.catch(function (e) { log.error('helper:' + self.name, e.message); });
  return this.ready;
};

PsHelper.prototype.call = function (cmd, args, timeoutMs) {
  const self = this;
  return this.start().then(function () {
    return new Promise(function (resolve, reject) {
      const id = self.nextId++;
      const timer = setTimeout(function () {
        delete self.pending[id];
        reject(new Error('timeout (' + cmd + ')'));
      }, timeoutMs || 6000);
      self.pending[id] = { resolve: resolve, reject: reject, timer: timer };
      self.proc.stdin.write(JSON.stringify(Object.assign({}, args || {}, { id: id, cmd: cmd })) + '\n');
    });
  });
};

PsHelper.prototype.stop = function () {
  this.stopped = true;
  if (this.proc) { try { this.proc.stdin.end(); this.proc.kill(); } catch (e) { } }
};

module.exports = PsHelper;
