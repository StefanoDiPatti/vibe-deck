'use strict';
const crypto = require('crypto');
const { EventEmitter } = require('events');

const OP = { HELLO: 0, IDENTIFY: 1, IDENTIFIED: 2, EVENT: 5, REQUEST: 6, RESPONSE: 7 };
const SUBSCRIBE_ALL = 0x7ff;
const REQUEST_TIMEOUT_MS = 8000;
const CONNECT_TIMEOUT_MS = 6000;

function fail(message, code) { return Object.assign(new Error(message), { code: code || 'UNAVAILABLE' }); }

function sha256b64(text) { return crypto.createHash('sha256').update(text).digest('base64'); }

function authString(password, salt, challenge) {
  return sha256b64(sha256b64(password + salt) + challenge);
}

class ObsSocket extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.ready = false;
    this.seq = 0;
    this.pending = new Map();
  }

  connect(url, password) {
    this.close();
    const self = this;
    return new Promise(function (resolve, reject) {
      let settled = false;
      const done = function (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) { self.close(); reject(err); } else resolve();
      };
      const timer = setTimeout(function () { done(fail('OBS non risponde (è aperto? WebSocket attivo?)')); }, CONNECT_TIMEOUT_MS);
      let ws;
      try { ws = new WebSocket(url, 'obswebsocket.json'); } catch (e) { done(fail('Indirizzo di OBS non valido')); return; }
      self.ws = ws;
      ws.onmessage = function (e) {
        let msg;
        try { msg = JSON.parse(e.data); } catch (x) { return; }
        self.handle(msg, password, done);
      };
      ws.onerror = function () { done(fail('OBS non raggiungibile (è aperto? WebSocket attivo?)')); };
      ws.onclose = function (e) {
        const was = self.ready;
        self.ready = false;
        self.rejectAll(fail('Collegamento con OBS chiuso'));
        if (e && e.code === 4009) done(fail('Password di OBS sbagliata', 'BAD_AUTH'));
        else done(fail('OBS ha chiuso il collegamento' + (e && e.reason ? ': ' + e.reason : '')));
        if (was) self.emit('closed');
      };
    });
  }

  handle(msg, password, done) {
    const d = msg.d || {};
    if (msg.op === OP.HELLO) {
      const identify = { rpcVersion: 1, eventSubscriptions: SUBSCRIBE_ALL };
      if (d.authentication) {
        if (!password) { done(fail('OBS chiede una password: inseriscila nel pannello', 'BAD_AUTH')); return; }
        identify.authentication = authString(password, d.authentication.salt, d.authentication.challenge);
      }
      this.send(OP.IDENTIFY, identify);
    } else if (msg.op === OP.IDENTIFIED) {
      this.ready = true;
      done(null);
    } else if (msg.op === OP.RESPONSE) {
      const p = this.pending.get(d.requestId);
      if (!p) return;
      this.pending.delete(d.requestId);
      clearTimeout(p.timer);
      const st = d.requestStatus || {};
      if (st.result) p.resolve(d.responseData || {});
      else p.reject(fail('OBS: ' + (st.comment || 'richiesta non riuscita (' + st.code + ')'), 'BAD_REQUEST'));
    } else if (msg.op === OP.EVENT) {
      this.emit('event', d.eventType, d.eventData || {});
    }
  }

  send(op, d) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ op: op, d: d }));
  }

  request(type, data) {
    if (!this.ready) return Promise.reject(fail('OBS non collegato'));
    const id = String(++this.seq);
    const self = this;
    return new Promise(function (resolve, reject) {
      const timer = setTimeout(function () { self.pending.delete(id); reject(fail('OBS non ha risposto a ' + type)); }, REQUEST_TIMEOUT_MS);
      self.pending.set(id, { resolve: resolve, reject: reject, timer: timer });
      self.send(OP.REQUEST, { requestType: type, requestId: id, requestData: data || {} });
    });
  }

  rejectAll(err) {
    this.pending.forEach(function (p) { clearTimeout(p.timer); p.reject(err); });
    this.pending.clear();
  }

  close() {
    this.ready = false;
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      try { ws.close(); } catch (e) { }
    }
    this.rejectAll(fail('Collegamento con OBS chiuso'));
  }
}

module.exports = { ObsSocket: ObsSocket, authString: authString };
