'use strict';
const { EventEmitter } = require('events');

function ircUrl() { return process.env.TWITCH_IRC || 'wss://irc-ws.chat.twitch.tv:443'; }
const MAX_MESSAGES = 150;
const RETRY_MS = [2000, 5000, 15000, 30000];

function unescapeTag(v) {
  return String(v || '').replace(/\\s/g, ' ').replace(/\\:/g, ';').replace(/\\\\/g, '\\').replace(/\\r/g, '').replace(/\\n/g, '');
}

function parseLine(line) {
  let rest = line;
  const msg = { tags: {}, prefix: '', command: '', params: [] };
  if (rest[0] === '@') {
    const sp = rest.indexOf(' ');
    rest.slice(1, sp).split(';').forEach(function (kv) {
      const eq = kv.indexOf('=');
      msg.tags[eq < 0 ? kv : kv.slice(0, eq)] = eq < 0 ? '' : unescapeTag(kv.slice(eq + 1));
    });
    rest = rest.slice(sp + 1);
  }
  if (rest[0] === ':') {
    const sp = rest.indexOf(' ');
    msg.prefix = rest.slice(1, sp);
    rest = rest.slice(sp + 1);
  }
  const trail = rest.indexOf(' :');
  const head = trail >= 0 ? rest.slice(0, trail) : rest;
  const parts = head.split(' ').filter(Boolean);
  msg.command = parts.shift() || '';
  msg.params = parts;
  if (trail >= 0) msg.params.push(rest.slice(trail + 2));
  return msg;
}

function badgesOf(tags) {
  return String(tags.badges || '').split(',').map(function (b) { return b.split('/')[0]; }).filter(Boolean);
}

class TwitchChat extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.channel = '';
    this.auth = null;
    this.messages = [];
    this.seq = 0;
    this.epoch = 0;
    this.status = 'off';
    this.room = {};
    this.retry = 0;
    this.timer = null;
  }

  join(channel, auth) {
    const c = String(channel || '').toLowerCase().replace(/^#/, '');
    if (c === this.channel && JSON.stringify(auth || null) === JSON.stringify(this.auth) && this.ws) return;
    this.stop();
    this.channel = c;
    this.auth = auth || null;
    this.messages = [];
    this.epoch++;
    if (c) this.open();
  }

  open() {
    const self = this;
    this.status = 'connecting';
    let ws;
    try { ws = new WebSocket(ircUrl()); } catch (e) { this.retryLater(); return; }
    this.ws = ws;
    ws.onopen = function () {
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      if (self.auth && self.auth.token) {
        ws.send('PASS oauth:' + self.auth.token);
        ws.send('NICK ' + self.auth.login);
      } else {
        ws.send('PASS SCHMOOPIIE');
        ws.send('NICK justinfan' + (10000 + Math.floor(Math.random() * 80000)));
      }
      ws.send('JOIN #' + self.channel);
    };
    ws.onmessage = function (e) { String(e.data).split('\r\n').filter(Boolean).forEach(function (l) { self.handle(parseLine(l)); }); };
    ws.onclose = function () { if (self.ws === ws) { self.ws = null; self.status = 'offline'; self.retryLater(); } };
    ws.onerror = function () { };
  }

  retryLater() {
    clearTimeout(this.timer);
    const self = this;
    const wait = RETRY_MS[Math.min(this.retry++, RETRY_MS.length - 1)];
    this.timer = setTimeout(function () { if (self.channel) self.open(); }, wait);
    if (this.timer.unref) this.timer.unref();
  }

  push(m) {
    m.seq = ++this.seq;
    this.messages.push(m);
    if (this.messages.length > MAX_MESSAGES) this.messages.splice(0, this.messages.length - MAX_MESSAGES);
    this.emit('message', m);
  }

  handle(msg) {
    const t = msg.tags;
    switch (msg.command) {
      case 'PING': if (this.ws) this.ws.send('PONG :' + (msg.params[0] || 'tmi.twitch.tv')); break;
      case '366': this.status = 'ready'; this.retry = 0; break;
      case 'RECONNECT': if (this.ws) this.ws.close(); break;
      case 'ROOMSTATE':
        ['slow', 'emote-only', 'subs-only', 'followers-only'].forEach(function (k) { if (t[k] !== undefined) this.room[k] = t[k]; }, this);
        break;
      case 'PRIVMSG':
        this.push({
          kind: 'chat', id: t.id || '', user: t['display-name'] || msg.prefix.split('!')[0], login: msg.prefix.split('!')[0],
          color: /^#[0-9A-Fa-f]{6}$/.test(t.color || '') ? t.color : '', badges: badgesOf(t), text: msg.params[1] || '', time: Number(t['tmi-sent-ts']) || Date.now()
        });
        break;
      case 'USERNOTICE':
        this.push({ kind: 'notice', id: t.id || '', type: t['msg-id'] || '', user: t['display-name'] || '', text: t['system-msg'] || '', extra: msg.params[1] || '', time: Number(t['tmi-sent-ts']) || Date.now() });
        break;
      case 'CLEARMSG': this.epoch++; this.messages = this.messages.filter(function (m) { return m.id !== t['target-msg-id']; }); break;
      case 'CLEARCHAT': {
        const login = msg.params[1];
        this.epoch++;
        this.messages = login ? this.messages.filter(function (m) { return m.login !== login; }) : [];
        break;
      }
      case 'NOTICE': if (/Login authentication failed/i.test(msg.params[1] || '')) { this.auth = null; this.status = 'auth'; } break;
      default: break;
    }
  }

  since(seq) {
    const n = Number(seq) || 0;
    return this.messages.filter(function (m) { return m.seq > n; });
  }

  modes() {
    const r = this.room;
    return {
      slow: Number(r.slow) || 0,
      emoteOnly: r['emote-only'] === '1',
      subsOnly: r['subs-only'] === '1',
      followersOnly: r['followers-only'] !== undefined && r['followers-only'] !== '-1'
    };
  }

  stop() {
    clearTimeout(this.timer);
    this.status = 'off';
    if (this.ws) { const ws = this.ws; this.ws = null; ws.onclose = null; try { ws.close(); } catch (e) { } }
  }
}

module.exports = { TwitchChat: TwitchChat, parseLine: parseLine };
