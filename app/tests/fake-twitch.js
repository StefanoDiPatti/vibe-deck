'use strict';
const http = require('http');
const crypto = require('crypto');
const { frame, readFrames, GUID } = require('./fake-obs');

class FakeTwitch {
  constructor() {
    const self = this;
    this.sockets = new Set();
    this.lines = [];
    this.calls = [];
    this.approved = false;
    this.tokens = 0;
    this.expired = false;
    this.live = true;
    this.channel = { title: 'Ranked fino a Diamante', game_name: 'League of Legends', game_id: '21779' };
    this.chat = { slow_mode: false, emote_mode: false, subscriber_mode: false, follower_mode: false };
    this.server = http.createServer(function (req, res) { self.http(req, res); });
    this.server.on('upgrade', function (req, socket) { self.accept(req, socket); });
  }

  listen() {
    const self = this;
    return new Promise(function (r) { self.server.listen(0, '127.0.0.1', function () { self.port = self.server.address().port; r(self); }); });
  }

  url(kind) { return (kind === 'ws' ? 'ws' : 'http') + '://127.0.0.1:' + this.port + (kind === 'api' ? '/helix' : kind === 'id' ? '/oauth2' : '/irc'); }

  accept(req, socket) {
    const self = this;
    const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    this.sockets.add(socket);
    let buf = Buffer.alloc(0);
    socket.on('data', function (chunk) {
      const r = readFrames(Buffer.concat([buf, chunk]));
      buf = r.rest;
      r.frames.forEach(function (f) {
        if (f.op === 8) { socket.end(); return; }
        if (f.op !== 1) return;
        String(f.data).split('\r\n').filter(Boolean).forEach(function (l) {
          self.lines.push(l);
          const m = /^JOIN #(\w+)/.exec(l);
          if (m) {
            socket.channel = m[1];
            self.send(':tmi.twitch.tv 366 justinfan #' + m[1] + ' :End of /NAMES list', socket);
            self.send('@emote-only=0;followers-only=-1;r9k=0;slow=0;subs-only=0 :tmi.twitch.tv ROOMSTATE #' + m[1], socket);
          }
        });
      });
    });
    socket.on('close', function () { self.sockets.delete(socket); });
    socket.on('error', function () { });
  }

  send(line, only) {
    this.sockets.forEach(function (s) { if ((!only || s === only) && !s.destroyed) s.write(frame(line + '\r\n')); });
  }

  say(user, text, extra) {
    const t = Object.assign({ 'display-name': user, color: '#FF7F50', badges: '', id: crypto.randomUUID(), 'tmi-sent-ts': String(Date.now()) }, extra || {});
    const tags = Object.keys(t).map(function (k) { return k + '=' + String(t[k]).replace(/ /g, '\\s'); }).join(';');
    const login = user.toLowerCase();
    this.sockets.forEach(function (s) { if (!s.destroyed) s.write(frame('@' + tags + ' :' + login + '!' + login + '@' + login + '.tmi.twitch.tv PRIVMSG #' + s.channel + ' :' + text + '\r\n')); });
  }

  sub(user, months) {
    const tags = 'display-name=' + user + ';msg-id=resub;system-msg=' + user + '\\ssi\\sè\\sabbonato\\sda\\s' + months + '\\smesi.;id=' + crypto.randomUUID();
    this.sockets.forEach(function (s) { if (!s.destroyed) s.write(frame('@' + tags + ' :tmi.twitch.tv USERNOTICE #' + s.channel + ' :Grande stream!\r\n')); });
  }

  http(req, res) {
    const self = this;
    let body = '';
    req.on('data', function (c) { body += c; });
    req.on('end', function () {
      const u = new URL(req.url, 'http://x');
      const auth = req.headers.authorization || '';
      self.calls.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), body: body, auth: auth, client: req.headers['client-id'] });
      const out = function (status, data) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
      if (u.pathname === '/oauth2/device') return out(200, { device_code: 'dev-1', user_code: 'ABCD1234', verification_uri: 'https://www.twitch.tv/activate?device-code=ABCD1234', expires_in: 1800, interval: 2 });
      if (u.pathname === '/oauth2/token') {
        const f = new URLSearchParams(body);
        if (f.get('grant_type') === 'refresh_token') { self.expired = false; self.tokens++; return out(200, { access_token: 'tok' + self.tokens, refresh_token: 'ref' + self.tokens }); }
        if (!self.approved) return out(400, { status: 400, message: 'authorization_pending' });
        self.tokens++;
        return out(200, { access_token: 'tok' + self.tokens, refresh_token: 'ref' + self.tokens });
      }
      if (!/^Bearer tok\d+$/.test(auth) || self.expired) return out(401, { error: 'Unauthorized', status: 401, message: 'Invalid OAuth token' });
      const p = u.pathname.replace('/helix', '');
      const json = body ? JSON.parse(body) : {};
      if (p === '/users') return out(200, { data: [{ id: '4242', login: 'stefano', display_name: 'Stefano', profile_image_url: '' }] });
      if (p === '/streams') return out(200, { data: self.live ? [{ viewer_count: 128, started_at: new Date(Date.now() - 3780000).toISOString() }] : [] });
      if (p === '/channels' && req.method === 'GET') return out(200, { data: [Object.assign({ broadcaster_id: '4242' }, self.channel)] });
      if (p === '/channels' && req.method === 'PATCH') {
        if (json.title) self.channel.title = json.title;
        if (json.game_id) { self.channel.game_id = json.game_id; self.channel.game_name = json.game_id === '509658' ? 'Just Chatting' : 'Altro'; }
        res.writeHead(204); return res.end();
      }
      if (p === '/channels/followers') return out(200, { total: 1500, data: [] });
      if (p === '/search/categories') return out(200, { data: [{ id: '509658', name: 'Just Chatting' }, { id: '21779', name: 'League of Legends' }].filter(function (c) { return c.name.toLowerCase().indexOf(String(u.searchParams.get('query')).toLowerCase()) >= 0; }) });
      if (p === '/streams/markers') return out(200, { data: [{ id: 'm1' }] });
      if (p === '/clips') return out(202, { data: [{ id: 'c1', edit_url: 'https://clips.twitch.tv/c1/edit' }] });
      if (p === '/channels/commercial') return self.live ? out(200, { data: [{ length: json.length, retry_after: 480 }] }) : out(400, { message: 'To start a commercial, the broadcaster must be streaming live.' });
      if (p === '/chat/settings' && req.method === 'GET') return out(200, { data: [self.chat] });
      if (p === '/chat/settings' && req.method === 'PATCH') {
        Object.assign(self.chat, json);
        const room = { slow: self.chat.slow_mode ? (self.chat.slow_mode_wait_time || 10) : 0, 'emote-only': self.chat.emote_mode ? 1 : 0, 'subs-only': self.chat.subscriber_mode ? 1 : 0, 'followers-only': self.chat.follower_mode ? 0 : -1 };
        const tags = Object.keys(room).map(function (k) { return k + '=' + room[k]; }).join(';');
        self.sockets.forEach(function (s) { if (!s.destroyed) s.write(frame('@' + tags + ' :tmi.twitch.tv ROOMSTATE #' + s.channel + '\r\n')); });
        return out(200, { data: [self.chat] });
      }
      if (p === '/chat/messages') { self.say('Stefano', json.message, { badges: 'broadcaster/1' }); return out(200, { data: [{ is_sent: true }] }); }
      out(404, { message: 'not found' });
    });
  }

  close() {
    this.sockets.forEach(function (s) { s.destroy(); });
    this.server.close();
  }
}

module.exports = { FakeTwitch: FakeTwitch };
