const net = require('net');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };
const TIMEOUT = 10000;

function candidates() {
  const out = [];
  for (let i = 0; i < 10; i++) {
    if (process.platform === 'win32') out.push('\\\\?\\pipe\\discord-ipc-' + i);
    else {
      const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || '/tmp';
      out.push(path.join(base, 'discord-ipc-' + i));
      out.push(path.join(base, 'app', 'com.discordapp.Discord', 'discord-ipc-' + i));
      out.push(path.join(base, 'snap.discord', 'discord-ipc-' + i));
    }
  }
  return out;
}

function encode(op, data) {
  const json = Buffer.from(JSON.stringify(data), 'utf8');
  const head = Buffer.alloc(8);
  head.writeInt32LE(op, 0);
  head.writeInt32LE(json.length, 4);
  return Buffer.concat([head, json]);
}

function rpcError(message, code) {
  return Object.assign(new Error(message), { code: 'UNAVAILABLE', discordCode: code });
}

class DiscordIpc extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pending = new Map();
    this.closed = true;
  }

  connect(clientId) {
    const self = this;
    const list = candidates();
    return new Promise(function (resolve, reject) {
      let i = 0;
      function next() {
        if (i >= list.length) return reject(rpcError('Discord non è aperto su questo PC'));
        const sock = net.createConnection(list[i++]);
        let opened = false;
        sock.once('connect', function () {
          opened = true;
          self.attach(sock, clientId).then(resolve, reject);
        });
        sock.once('error', function () { if (!opened) next(); });
      }
      next();
    });
  }

  attach(sock, clientId) {
    const self = this;
    this.socket = sock;
    this.closed = false;
    this.buffer = Buffer.alloc(0);
    return new Promise(function (resolve, reject) {
      const timer = setTimeout(function () { reject(rpcError('Discord non risponde')); self.close(); }, TIMEOUT);
      self.once('ready', function (data) { clearTimeout(timer); resolve(data); });
      self.once('handshake-closed', function (data) {
        clearTimeout(timer);
        reject(rpcError('Discord ha rifiutato il collegamento: ' + ((data && data.message) || 'motivo sconosciuto'), data && data.code));
      });
      sock.on('data', function (chunk) { self.onData(chunk); });
      sock.on('close', function () { self.onClose(); });
      sock.on('error', function () { });
      sock.write(encode(OP.HANDSHAKE, { v: 1, client_id: String(clientId) }));
    });
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 8) {
      const op = this.buffer.readInt32LE(0);
      const len = this.buffer.readInt32LE(4);
      if (this.buffer.length < 8 + len) break;
      let msg = null;
      try { msg = JSON.parse(this.buffer.slice(8, 8 + len).toString('utf8')); } catch (e) { msg = null; }
      this.buffer = this.buffer.slice(8 + len);
      this.onMessage(op, msg);
    }
  }

  onMessage(op, msg) {
    if (op === OP.PING) { this.send(OP.PONG, msg); return; }
    if (op === OP.CLOSE) { this.emit('handshake-closed', msg); this.close(); return; }
    if (op !== OP.FRAME || !msg) return;
    if (msg.cmd === 'DISPATCH' && msg.evt === 'READY') { this.emit('ready', msg.data); return; }
    if (msg.nonce && this.pending.has(msg.nonce)) {
      const p = this.pending.get(msg.nonce);
      this.pending.delete(msg.nonce);
      clearTimeout(p.timer);
      if (msg.evt === 'ERROR') p.reject(rpcError((msg.data && msg.data.message) || 'Errore di Discord', msg.data && msg.data.code));
      else p.resolve(msg.data);
      return;
    }
    if (msg.cmd === 'DISPATCH' && msg.evt) this.emit('event', msg.evt, msg.data);
  }

  onClose() {
    if (this.closed) return;
    this.closed = true;
    this.pending.forEach(function (p) { clearTimeout(p.timer); p.reject(rpcError('Collegamento con Discord chiuso')); });
    this.pending.clear();
    this.emit('close');
  }

  send(op, data) {
    if (this.socket && !this.closed) this.socket.write(encode(op, data));
  }

  request(cmd, args, evt) {
    const self = this;
    if (this.closed) return Promise.reject(rpcError('Discord non collegato'));
    const nonce = crypto.randomUUID();
    return new Promise(function (resolve, reject) {
      const timer = setTimeout(function () {
        self.pending.delete(nonce);
        reject(rpcError('Discord non risponde (' + cmd + ')'));
      }, cmd === 'AUTHORIZE' ? 120000 : TIMEOUT);
      self.pending.set(nonce, { resolve: resolve, reject: reject, timer: timer });
      const frame = { cmd: cmd, args: args || {}, nonce: nonce };
      if (evt) frame.evt = evt;
      self.send(OP.FRAME, frame);
    });
  }

  close() {
    if (this.socket) { try { this.socket.destroy(); } catch (e) { } }
    this.onClose();
  }
}

module.exports = { DiscordIpc: DiscordIpc, encode: encode, OP: OP };
