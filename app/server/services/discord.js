const fs = require('fs');
const path = require('path');
const paths = require('../paths');
const log = require('../log');
const secrets = require('../secrets');
const { DiscordIpc } = require('./discord-ipc');

const FILE = path.join(paths.DATA_DIR, 'discord.json');
const SCOPES = ['rpc', 'identify', 'rpc.voice.read', 'rpc.voice.write'];
const MEDIA_SCOPES = ['rpc.video.write', 'rpc.screenshare.write'];
const REDIRECT = 'http://localhost';
const RETRY_MS = 5000;
const CHANNEL_EVENTS = ['VOICE_STATE_CREATE', 'VOICE_STATE_UPDATE', 'VOICE_STATE_DELETE', 'SPEAKING_START', 'SPEAKING_STOP'];

let creds = null;
let ipc = null;
let connecting = null;
let lastAttempt = 0;
const S = {
  status: 'setup',
  message: '',
  user: null,
  voice: { mute: false, deaf: false },
  media: { video: false, stream: false },
  channel: null,
  speaking: {},
  guilds: null,
  guildNames: {},
  authError: ''
};

function loadCreds() {
  if (creds) return creds;
  creds = secrets.loadJson(FILE, log) || {};
  return creds;
}
function saveCreds(patch) {
  creds = Object.assign({}, loadCreds(), patch);
  secrets.writeJson(FILE, creds);
}
function configured() { const c = loadCreds(); return !!(c.clientId && c.clientSecret); }

async function tokenRequest(params) {
  const c = loadCreds();
  const body = new URLSearchParams(Object.assign({ client_id: c.clientId, client_secret: c.clientSecret }, params));
  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body
  });
  const data = await res.json().catch(function () { return {}; });
  if (!res.ok || !data.access_token) {
    const why = data.error_description || data.error || ('HTTP ' + res.status);
    throw Object.assign(new Error('Token Discord non ottenuto: ' + why), { code: 'UNAVAILABLE', oauth: data.error });
  }
  saveCreds({
    accessToken: data.access_token,
    refreshToken: data.refresh_token || loadCreds().refreshToken,
    expiresAt: Date.now() + (data.expires_in || 604800) * 1000
  });
  return data.access_token;
}

function img(url) {
  const m = /^https:\/\/cdn\.discordapp\.com(\/(?:avatars|icons|embed\/avatars)\/[0-9A-Za-z_\/.-]+)/.exec(String(url || ''));
  return m ? '/api/discord/img?p=' + encodeURIComponent(m[1]) : null;
}
function avatar(user) {
  if (!user) return null;
  if (user.avatar) return img('https://cdn.discordapp.com/avatars/' + user.id + '/' + user.avatar + '.png');
  let n = 0;
  try { n = Number((BigInt(user.id) >> 22n) % 6n); } catch (e) { n = 0; }
  return img('https://cdn.discordapp.com/embed/avatars/' + n + '.png');
}
function member(vs) {
  const u = vs.user || {};
  const st = vs.voice_state || {};
  return {
    id: u.id,
    name: vs.nick || u.global_name || u.username || 'utente',
    avatar: avatar(u),
    mute: !!(st.mute || st.self_mute || st.suppress),
    deaf: !!(st.deaf || st.self_deaf),
    video: !!st.self_video,
    stream: !!st.self_stream,
    mediaKnown: 'self_video' in st || 'self_stream' in st,
    localMute: !!vs.mute,
    volume: typeof vs.volume === 'number' ? Math.round(vs.volume) : 100,
    bot: !!u.bot
  };
}

function setStatus(status, message) {
  S.status = status;
  S.message = message || '';
}

function reset() {
  S.channel = null;
  S.speaking = {};
}

async function authenticate() {
  const c = loadCreds();
  let token = c.accessToken;
  if (!token) throw Object.assign(new Error('Da autorizzare'), { needAuth: true });
  if (c.expiresAt && Date.now() > c.expiresAt - 60000 && c.refreshToken) {
    try { token = await tokenRequest({ grant_type: 'refresh_token', refresh_token: c.refreshToken }); } catch (e) {
      throw Object.assign(e, { needAuth: true });
    }
  }
  try {
    const data = await ipc.request('AUTHENTICATE', { access_token: token });
    S.user = data && data.user ? { id: data.user.id, name: data.user.global_name || data.user.username, avatar: avatar(data.user) } : null;
  } catch (e) {
    throw Object.assign(e, { needAuth: true });
  }
}

async function afterReady() {
  const vs = await ipc.request('GET_VOICE_SETTINGS');
  S.voice = { mute: !!(vs && vs.mute), deaf: !!(vs && vs.deaf) };
  await ipc.request('SUBSCRIBE', {}, 'VOICE_SETTINGS_UPDATE');
  await ipc.request('SUBSCRIBE', {}, 'VOICE_CHANNEL_SELECT');
  const sel = await ipc.request('GET_SELECTED_VOICE_CHANNEL');
  await followChannel(sel);
}

async function followChannel(ch) {
  const old = S.channel;
  if (old && (!ch || ch.id !== old.id)) {
    CHANNEL_EVENTS.forEach(function (evt) { ipc.request('UNSUBSCRIBE', { channel_id: old.id }, evt).catch(function () {}); });
  }
  if (!ch) { S.media = { video: false, stream: false }; reset(); return; }
  const members = {};
  (ch.voice_states || []).forEach(function (vs) { const m = member(vs); if (m.id) members[m.id] = m; });
  const same = old && old.id === ch.id;
  if (!same) S.media = { video: false, stream: false };
  S.channel = { id: ch.id, name: ch.name, guild_id: ch.guild_id, members: members };
  if (!same) {
    S.speaking = {};
    for (let i = 0; i < CHANNEL_EVENTS.length; i++) {
      await ipc.request('SUBSCRIBE', { channel_id: ch.id }, CHANNEL_EVENTS[i]).catch(function (e) { log.warn('discord', CHANNEL_EVENTS[i] + ': ' + e.message); });
    }
  }
}

function onEvent(evt, data) {
  data = data || {};
  if (evt === 'VOICE_SETTINGS_UPDATE') { S.voice = { mute: !!data.mute, deaf: !!data.deaf }; return; }
  if (evt === 'VOICE_CHANNEL_SELECT') {
    if (!data.channel_id) { followChannel(null); return; }
    ipc.request('GET_CHANNEL', { channel_id: data.channel_id }).then(followChannel).catch(function () {});
    return;
  }
  if (!S.channel) return;
  if (evt === 'SPEAKING_START' && data.user_id) { S.speaking[data.user_id] = Date.now(); return; }
  if (evt === 'SPEAKING_STOP' && data.user_id) { delete S.speaking[data.user_id]; return; }
  if (evt === 'VOICE_STATE_CREATE' || evt === 'VOICE_STATE_UPDATE') {
    const m = member(data);
    if (m.id) S.channel.members[m.id] = m;
    return;
  }
  if (evt === 'VOICE_STATE_DELETE' && data.user) {
    delete S.channel.members[data.user.id];
    delete S.speaking[data.user.id];
  }
}

function ensure(force) {
  if (!configured()) { setStatus('setup'); return Promise.resolve(); }
  if (S.status === 'ready' && ipc && !ipc.closed) return Promise.resolve();
  if (connecting) return connecting;
  if (!force && Date.now() - lastAttempt < RETRY_MS) return Promise.resolve();
  lastAttempt = Date.now();
  setStatus('connecting');
  connecting = (async function () {
    try {
      await open();
      await authenticate();
      await afterReady();
      setStatus('ready');
      log.info('discord', 'collegato come ' + (S.user ? S.user.name : '?'));
    } catch (e) {
      if (e.needAuth) setStatus('unauthorized', S.authError || 'Autorizza la dock dal pannello di controllo sul PC');
      else setStatus('offline', e.message);
    } finally {
      connecting = null;
    }
  })();
  return connecting;
}

async function open() {
  if (ipc && !ipc.closed) return;
  reset();
  ipc = new DiscordIpc();
  ipc.on('event', onEvent);
  ipc.on('close', function () {
    if (S.status === 'ready') log.info('discord', 'collegamento chiuso');
    reset();
    if (S.status !== 'setup') setStatus('offline', 'Discord chiuso');
  });
  await ipc.connect(loadCreds().clientId);
}

function explainAuth(e) {
  const m = String((e && e.message) || '');
  if (/redirect_uri/i.test(m)) {
    return 'Nella tua app Discord manca il redirect. Developer Portal > la tua app > OAuth2 > sezione Redirects: premi "Add Redirect", ' +
      'scrivi ' + REDIRECT + ', poi premi "Save Changes" nella barra verde in basso e riprova. (Discord: ' + m + ')';
  }
  if (/invalid_client|client_secret/i.test(m)) return 'Client Secret non valido: copialo di nuovo dal Developer Portal (OAuth2 > Reset Secret).';
  if (/cancel|denied/i.test(m)) return 'Autorizzazione annullata su Discord.';
  return m;
}

async function requestCode() {
  const clientId = loadCreds().clientId;
  let scopes = SCOPES.concat(MEDIA_SCOPES);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await ipc.request('AUTHORIZE', { client_id: clientId, scopes: scopes });
      return { code: r.code, scopes: scopes };
    } catch (e) {
      const m = String(e.message || '');
      log.warn('discord', 'AUTHORIZE (' + scopes.length + ' permessi): ' + m);
      if (/scope/i.test(m) && scopes.length > SCOPES.length) { scopes = SCOPES.slice(); continue; }
      throw e;
    }
  }
  throw new Error('Autorizzazione non riuscita');
}

async function exchangeCode(code) {
  try {
    return await tokenRequest({ grant_type: 'authorization_code', code: code, redirect_uri: REDIRECT });
  } catch (e) {
    if (!/redirect_uri/i.test(e.message)) throw e;
    log.warn('discord', 'token con redirect: ' + e.message);
    return tokenRequest({ grant_type: 'authorization_code', code: code });
  }
}

async function authorize() {
  if (!configured()) throw Object.assign(new Error('Inserisci prima Client ID e Client Secret'), { code: 'BAD_REQUEST' });
  if (ipc && !ipc.closed) ipc.close();
  ipc = null;
  S.authError = '';
  setStatus('connecting', 'In attesa della conferma su Discord');
  try {
    await open();
    const r = await requestCode();
    await exchangeCode(r.code);
    saveCreds({ scopes: r.scopes });
    await authenticate();
    await afterReady();
    setStatus('ready');
    log.info('discord', 'autorizzato come ' + (S.user ? S.user.name : '?') + (r.scopes.length > SCOPES.length ? ' (con webcam e schermo)' : ''));
    return state();
  } catch (e) {
    const why = explainAuth(e);
    S.authError = why;
    log.warn('discord', 'autorizzazione: ' + e.message);
    setStatus(ipc && !ipc.closed ? 'unauthorized' : 'offline', why);
    throw Object.assign(new Error(why), { code: e.code || 'UNAVAILABLE' });
  }
}

function setup(clientId, clientSecret) {
  clientId = String(clientId || '').trim();
  clientSecret = String(clientSecret || '').trim();
  if (!/^\d{15,22}$/.test(clientId)) throw Object.assign(new Error('Client ID non valido: sono solo cifre (Application ID)'), { code: 'BAD_REQUEST' });
  const patch = { clientId: clientId };
  if (clientSecret) patch.clientSecret = clientSecret;
  else if (!loadCreds().clientSecret || loadCreds().clientId !== clientId) throw Object.assign(new Error('Manca il Client Secret'), { code: 'BAD_REQUEST' });
  if (loadCreds().clientId !== clientId) Object.assign(patch, { accessToken: null, refreshToken: null, expiresAt: null });
  saveCreds(patch);
  return authorize();
}

function logout() {
  if (ipc && !ipc.closed) ipc.close();
  ipc = null;
  creds = {};
  try { fs.unlinkSync(FILE); } catch (e) { }
  S.user = null;
  S.guilds = null;
  S.authError = '';
  reset();
  setStatus('setup');
}

function state() {
  const now = Date.now();
  let channel = null;
  if (S.channel) {
    const list = Object.keys(S.channel.members).map(function (id) {
      const m = S.channel.members[id];
      const isMe = !!(S.user && S.user.id === id);
      const extra = { speaking: !!(S.speaking[id] && now - S.speaking[id] < 4000) || false, me: isMe };
      if (isMe && !m.mediaKnown) { extra.video = S.media.video; extra.stream = S.media.stream; }
      return Object.assign({}, m, extra);
    });
    list.sort(function (a, b) { return (b.me - a.me) || a.name.localeCompare(b.name); });
    channel = { id: S.channel.id, name: S.channel.name, guild_id: S.channel.guild_id, guild: S.guildNames[S.channel.guild_id] || '', members: list };
  }
  const me = S.channel && S.user ? S.channel.members[S.user.id] : null;
  return {
    status: S.status,
    message: S.message,
    configured: configured(),
    user: S.user,
    voice: {
      mute: S.voice.mute, deaf: S.voice.deaf,
      video: me && me.mediaKnown ? !!me.video : !!(S.channel && S.media.video),
      stream: me && me.mediaKnown ? !!me.stream : !!(S.channel && S.media.stream)
    },
    media: mediaAllowed(),
    channel: channel
  };
}

async function ready() {
  await ensure();
  if (S.status !== 'ready') throw Object.assign(new Error(S.status === 'setup' ? 'Discord non configurato: apri il pannello di controllo sul PC' : (S.message || 'Discord non collegato')), { code: 'UNAVAILABLE' });
}

async function guilds(refresh) {
  await ready();
  if (!refresh && S.guilds && Date.now() - S.guilds.at < 120000) return S.guilds.list;
  const d = await ipc.request('GET_GUILDS');
  const list = ((d && d.guilds) || []).map(function (g) {
    S.guildNames[g.id] = g.name;
    return { id: g.id, name: g.name, icon: img(g.icon_url) };
  });
  S.guilds = { at: Date.now(), list: list };
  return list;
}

async function channels(guildId) {
  await ready();
  if (!/^\d+$/.test(String(guildId || ''))) throw Object.assign(new Error('Server non valido'), { code: 'BAD_REQUEST' });
  const d = await ipc.request('GET_CHANNELS', { guild_id: String(guildId) });
  const voiceChannels = ((d && d.channels) || []).filter(function (c) { return c.type === 2 || c.type === 13; });
  const out = [];
  for (let i = 0; i < voiceChannels.length; i += 4) {
    const chunk = await Promise.all(voiceChannels.slice(i, i + 4).map(function (c) {
      return ipc.request('GET_CHANNEL', { channel_id: c.id }).then(function (full) {
        return { id: c.id, name: c.name, stage: c.type === 13, members: ((full && full.voice_states) || []).map(member) };
      }).catch(function () { return { id: c.id, name: c.name, stage: c.type === 13, members: [] }; });
    }));
    Array.prototype.push.apply(out, chunk);
  }
  return out;
}

async function toggle(what) {
  await ready();
  if (what !== 'mute' && what !== 'deaf') throw Object.assign(new Error('Comando non valido'), { code: 'BAD_REQUEST' });
  const args = {};
  args[what] = !S.voice[what];
  const r = await ipc.request('SET_VOICE_SETTINGS', args);
  if (r) S.voice = { mute: !!r.mute, deaf: !!r.deaf };
  return state();
}

async function join(channelId) {
  await ready();
  if (channelId !== null && !/^\d+$/.test(String(channelId || ''))) throw Object.assign(new Error('Canale non valido'), { code: 'BAD_REQUEST' });
  const args = channelId === null ? { channel_id: null } : { channel_id: String(channelId), force: true };
  const ch = await ipc.request('SELECT_VOICE_CHANNEL', args);
  await followChannel(channelId === null ? null : ch);
  return state();
}

function mediaAllowed() {
  const sc = loadCreds().scopes || [];
  return MEDIA_SCOPES.every(function (x) { return sc.indexOf(x) >= 0; });
}

async function toggleMedia(what, pid) {
  await ready();
  if (what !== 'video' && what !== 'stream') throw Object.assign(new Error('Comando non valido'), { code: 'BAD_REQUEST' });
  if (!mediaAllowed()) {
    throw Object.assign(new Error('Per webcam e Go Live riautorizza la dock: pannello di controllo sul PC > Discord > Riautorizza'), { code: 'UNAVAILABLE' });
  }
  if (!S.channel) throw Object.assign(new Error('Entra prima in un canale vocale'), { code: 'BAD_REQUEST' });
  const args = {};
  if (what === 'stream' && pid) args.pid = Number(pid);
  const cmd = what === 'video' ? 'TOGGLE_VIDEO' : 'TOGGLE_SCREENSHARE';
  try {
    try {
      await ipc.request(cmd, args);
    } catch (e) {
      if (!args.pid || /scope|authenticated/i.test(e.message)) throw e;
      log.debug('discord', 'Go Live con pid ' + args.pid + ': ' + e.message);
      await ipc.request(cmd, {});
    }
    S.media[what] = !S.media[what];
  } catch (e) {
    if (/scope|authenticated/i.test(e.message)) {
      throw Object.assign(new Error('Discord non ha concesso questo permesso alla dock: riautorizza dal pannello di controllo'), { code: 'UNAVAILABLE' });
    }
    throw e;
  }
  return state();
}

async function userVoice(userId, patch) {
  await ready();
  if (!/^\d+$/.test(String(userId || ''))) throw Object.assign(new Error('Utente non valido'), { code: 'BAD_REQUEST' });
  const args = { user_id: String(userId) };
  if (typeof patch.mute === 'boolean') args.mute = patch.mute;
  if (typeof patch.volume === 'number') args.volume = Math.max(0, Math.min(200, Math.round(patch.volume)));
  await ipc.request('SET_USER_VOICE_SETTINGS', args);
  if (S.channel && S.channel.members[userId]) {
    if ('mute' in args) S.channel.members[userId].localMute = args.mute;
    if ('volume' in args) S.channel.members[userId].volume = args.volume;
  }
  return state();
}

const imgCache = new Map();
async function image(p) {
  if (!/^\/(?:avatars|icons|embed\/avatars)\/[0-9A-Za-z_\/.-]+\.(png|jpg|webp|gif)$/.test(String(p || '')) || p.indexOf('..') >= 0) {
    throw Object.assign(new Error('Immagine non valida'), { code: 'BAD_REQUEST' });
  }
  if (imgCache.has(p)) return imgCache.get(p);
  const res = await fetch('https://cdn.discordapp.com' + p.replace(/\.(webp|gif)$/, '.png') + '?size=64');
  if (!res.ok) throw Object.assign(new Error('Immagine non trovata'), { code: 'NOT_FOUND' });
  const out = { type: res.headers.get('content-type') || 'image/png', body: Buffer.from(await res.arrayBuffer()) };
  if (imgCache.size > 300) imgCache.delete(imgCache.keys().next().value);
  imgCache.set(p, out);
  return out;
}

function panelInfo() {
  const c = loadCreds();
  return Object.assign(state(), { clientId: c.clientId || '', hasSecret: !!c.clientSecret, redirect: REDIRECT, authError: S.authError });
}

module.exports = {
  ensure: ensure,
  state: state,
  guilds: guilds,
  channels: channels,
  toggle: toggle,
  toggleMedia: toggleMedia,
  join: join,
  userVoice: userVoice,
  image: image,
  setup: setup,
  authorize: authorize,
  logout: logout,
  panelInfo: panelInfo,
  configured: configured,
  _member: member,
  _img: img
};
