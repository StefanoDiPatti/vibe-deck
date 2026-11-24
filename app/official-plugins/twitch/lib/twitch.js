'use strict';
const { TwitchChat } = require('./chat');
const { Helix, DeviceAuth } = require('./helix');

const LIVE_TTL_MS = 20000;
const NAME_RE = /^[a-zA-Z0-9_]{2,25}$/;
const ADS = [30, 60, 90, 120, 180];

function fail(message, code) { return Object.assign(new Error(message), { code: code || 'BAD_REQUEST' }); }

function uptime(startedAt) {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h + ':' + (m < 10 ? '0' : '') + m;
}

class Twitch {
  constructor(opts) {
    this.secrets = opts.secrets;
    this.file = opts.file;
    this.log = opts.log || { info: function () {}, warn: function () {} };
    this.chat = new TwitchChat();
    this.device = new DeviceAuth();
    this.helix = new Helix(this.session.bind(this));
    this.pending = null;
    this.pollTimer = null;
    this.live = { at: 0, data: null };
  }

  settings() { return this.secrets.loadJson(this.file, this.log) || {}; }

  write(changes) {
    const s = Object.assign(this.settings(), changes);
    Object.keys(s).forEach(function (k) { if (s[k] === undefined) delete s[k]; });
    this.secrets.writeJson(this.file, s);
    return s;
  }

  session() {
    const s = this.settings();
    if (!s.token) return null;
    const self = this;
    return { token: s.token, clientId: s.clientId, onExpired: function () { return self.refresh(); } };
  }

  async refresh() {
    const s = this.settings();
    if (!s.refresh) { this.write({ token: undefined }); this.start(); throw fail('Accesso a Twitch scaduto: ricollega Twitch dal pannello', 'UNAVAILABLE'); }
    try {
      const t = await this.device.refresh(s.clientId, s.refresh);
      this.write({ token: t.access_token, refresh: t.refresh_token || s.refresh });
    } catch (e) {
      this.write({ token: undefined, refresh: undefined });
      this.start();
      throw fail('Accesso a Twitch scaduto: ricollega Twitch dal pannello', 'UNAVAILABLE');
    }
  }

  start() {
    const s = this.settings();
    const channel = s.channel || s.login;
    if (channel) this.chat.join(channel, s.token && s.login && channel === s.login ? { token: s.token, login: s.login } : null);
  }

  stop() { this.chat.stop(); clearTimeout(this.pollTimer); }

  setChannel(name) {
    const c = String(name || '').trim().toLowerCase().replace(/^#|^https?:\/\/(www\.)?twitch\.tv\//, '');
    if (c && !NAME_RE.test(c)) throw fail('Nome del canale non valido');
    this.write({ channel: c || undefined });
    this.start();
  }

  async login(clientId) {
    const id = String(clientId || this.settings().clientId || '').trim();
    if (!/^[a-z0-9]{20,40}$/.test(id)) throw fail('Client ID non valido: copialo dalla tua app su dev.twitch.tv');
    this.write({ clientId: id });
    const d = await this.device.start(id);
    this.pending = { code: d.user_code, url: d.verification_uri, device: d.device_code, until: Date.now() + (d.expires_in || 1800) * 1000, every: Math.max(2, d.interval || 5) * 1000, error: '' };
    this.schedulePoll();
    return { code: d.user_code, url: d.verification_uri };
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    const self = this;
    if (!this.pending) return;
    this.pollTimer = setTimeout(function () { self.pollOnce().catch(function () {}); }, this.pending.every);
    if (this.pollTimer.unref) this.pollTimer.unref();
  }

  async pollOnce() {
    const p = this.pending;
    if (!p) return;
    if (Date.now() > p.until) { this.pending = null; return; }
    try {
      const t = await this.device.poll(this.settings().clientId, p.device);
      this.pending = null;
      this.write({ token: t.access_token, refresh: t.refresh_token });
      const me = await this.helix.me();
      this.write({ userId: me.id, login: me.login, name: me.display_name, avatar: me.profile_image_url, channel: this.settings().channel || me.login });
      this.log.info('collegato a Twitch come ' + me.login);
      this.start();
    } catch (e) {
      const msg = e.data && (e.data.message || '');
      if (/authorization_pending|slow_down/i.test(msg)) { this.schedulePoll(); return; }
      this.pending = Object.assign({}, p, { error: msg || e.message });
    }
  }

  logout() {
    this.write({ token: undefined, refresh: undefined, userId: undefined, login: undefined, name: undefined, avatar: undefined });
    this.pending = null;
    this.live = { at: 0, data: null };
    this.start();
  }

  needUser() {
    const s = this.settings();
    if (!s.token || !s.userId) throw fail('Collega Twitch dal pannello di controllo sul PC', 'UNAVAILABLE');
    return s.userId;
  }

  async liveState(force) {
    const s = this.settings();
    if (!s.token || !s.userId) return null;
    if (!force && this.live.data && Date.now() - this.live.at < LIVE_TTL_MS) return this.live.data;
    const [stream, channel, followers] = await Promise.all([this.helix.stream(s.userId), this.helix.channel(s.userId), this.helix.followers(s.userId).catch(function () { return null; })]);
    const data = {
      active: !!stream, viewers: stream ? stream.viewer_count : 0, uptime: stream ? uptime(stream.started_at) : '',
      title: (channel && channel.title) || '', game: (channel && channel.game_name) || '', gameId: (channel && channel.game_id) || '', followers: followers
    };
    this.live = { at: Date.now(), data: data };
    return data;
  }

  async state() {
    const s = this.settings();
    const channel = s.channel || s.login || '';
    let live = null, error = '';
    try { live = await this.liveState(false); } catch (e) { error = e.message; }
    return {
      status: s.token && s.userId ? 'ready' : channel ? 'chat' : 'setup',
      channel: channel, name: s.name || channel, chat: this.chat.status, modes: this.chat.modes(),
      canControl: !!(s.token && s.userId), canSend: !!(s.token && s.userId && channel === s.login),
      live: live, error: error, ads: ADS
    };
  }

  messages(after) { return { messages: this.chat.since(after), last: this.chat.seq, epoch: this.chat.epoch }; }

  async marker(description) { await this.helix.marker(this.needUser(), String(description || '').slice(0, 140)); return { message: 'Marker aggiunto' }; }

  async clip() {
    const c = await this.helix.clip(this.needUser());
    return { message: 'Clip creata', url: c && c.edit_url };
  }

  async ad(length) {
    const l = parseInt(length, 10) || 30;
    if (ADS.indexOf(l) < 0) throw fail('Durata della pubblicità non valida');
    const r = await this.helix.commercial(this.needUser(), l);
    return { message: 'Pubblicità di ' + l + ' s avviata' + (r && r.retry_after ? ' (la prossima tra ' + Math.round(r.retry_after / 60) + ' min)' : '') };
  }

  async mode(name, on) {
    const user = this.needUser();
    const map = { slow: 'slow_mode', emote: 'emote_mode', subs: 'subscriber_mode', followers: 'follower_mode' };
    if (!map[name]) throw fail('Modalità non valida');
    const current = await this.helix.chatSettings(user);
    const value = typeof on === 'boolean' ? on : !current[map[name]];
    const body = {};
    body[map[name]] = value;
    if (name === 'slow' && value) body.slow_mode_wait_time = 10;
    await this.helix.setChatSettings(user, body);
    this.chat.room[{ slow: 'slow', emote: 'emote-only', subs: 'subs-only', followers: 'followers-only' }[name]] = name === 'followers' ? (value ? '0' : '-1') : name === 'slow' ? (value ? '10' : '0') : (value ? '1' : '0');
    return { message: null, on: value };
  }

  async title(text) {
    const t = String(text || '').trim();
    if (!t || t.length > 140) throw fail('Il titolo deve avere da 1 a 140 caratteri');
    await this.helix.setChannel(this.needUser(), { title: t });
    this.live.at = 0;
    return { message: 'Titolo aggiornato' };
  }

  async category(id, name) {
    if (!/^\d+$/.test(String(id || ''))) throw fail('Categoria non valida');
    await this.helix.setChannel(this.needUser(), { game_id: String(id) });
    this.live.at = 0;
    return { message: 'Categoria: ' + (name || id) };
  }

  searchCategories(q) {
    const query = String(q || '').trim();
    if (query.length < 2) return Promise.resolve([]);
    this.needUser();
    return this.helix.categories(query.slice(0, 60));
  }

  async say(text) {
    const t = String(text || '').trim();
    if (!t || t.length > 500) throw fail('Messaggio vuoto o troppo lungo');
    const s = this.settings();
    if (!(s.token && s.userId && (s.channel || s.login) === s.login)) throw fail('Puoi scrivere solo nella chat del tuo canale, dopo aver collegato Twitch');
    await this.helix.say(s.userId, t);
    return { message: null };
  }

  panelInfo() {
    const s = this.settings();
    return {
      status: s.token && s.userId ? 'ready' : (s.channel ? 'chat' : 'setup'), channel: s.channel || s.login || '', clientId: s.clientId || '',
      user: s.token && s.login ? { login: s.login, name: s.name, avatar: s.avatar } : null,
      pending: this.pending ? { code: this.pending.code, url: this.pending.url, error: this.pending.error } : null
    };
  }
}

module.exports = { Twitch: Twitch, uptime: uptime };
