const crypto = require('crypto');
const platform = require('../platform');
const config = require('../config');
const bridge = require('./bridge');
const log = require('../log');

const DEFAULT_ALLOW = [
  'spotify', 'applemusic', 'apple music', 'zunemusic', 'microsoft\\.media', 'vlc', 'foobar', 'musicbee',
  'aimp', 'winamp', 'tidal', 'deezer', 'amazon.?music', 'youtube', 'ytmusic', 'th-ch', 'cider',
  'qobuz', 'soundcloud', 'rhythmbox', 'clementine', 'strawberry', 'elisa', 'lollypop', 'audacious', 'mpv'
];
const BROWSERS = /chrome|msedge|edge|brave|firefox|opera|vivaldi|arc\b|chromium/i;
const PROCESS_HINTS = [
  [/spotify/i, ['spotify']], [/vlc/i, ['vlc']], [/foobar/i, ['foobar2000']], [/musicbee/i, ['musicbee']],
  [/aimp/i, ['aimp']], [/tidal/i, ['tidal']], [/deezer/i, ['deezer']], [/ZuneMusic|Microsoft\.Media/i, ['microsoft.media.player']],
  [/winamp/i, ['winamp']], [/brave/i, ['brave']], [/chrome/i, ['chrome']], [/msedge|edge/i, ['msedge']], [/firefox/i, ['firefox']]
];
const SITE_NAMES = { apple: 'Apple Music', ytmusic: 'YouTube Music', youtube: 'YouTube', web: 'Browser' };

let sysCache = { at: 0, data: null, pending: null };
const tracking = {};
let selectedId = null;
let lastError = null;
const artCache = { key: null, data: null, pending: null };
const volumeCache = {};

function settings() {
  const m = (config.get('services').media) || {};
  return {
    allow: (Array.isArray(m.allowApps) ? m.allowApps : []).concat(DEFAULT_ALLOW),
    block: Array.isArray(m.blockApps) ? m.blockApps : ['riot', 'league', 'valorant', 'steam', 'discord', 'nvidia', 'xbox', 'game'],
    browserFallback: m.browserFallback !== false,
    processNames: m.processNames || {}
  };
}

function matchAny(list, text) {
  for (let i = 0; i < list.length; i++) {
    try { if (new RegExp(list[i], 'i').test(text)) return true; } catch (e) { }
  }
  return false;
}

function prettyApp(id) {
  const s = String(id || '');
  const known = [
    [/AppleMusic/i, 'Apple Music'], [/spotify/i, 'Spotify'], [/chrome/i, 'Chrome'],
    [/brave/i, 'Brave'], [/msedge|edge/i, 'Edge'], [/firefox/i, 'Firefox'], [/vlc/i, 'VLC'],
    [/ZuneMusic|Media\.Player|Microsoft\.Media/i, 'Lettore multimediale'], [/tidal/i, 'TIDAL'],
    [/deezer/i, 'Deezer'], [/youtube|th-ch/i, 'YouTube Music'], [/opera/i, 'Opera'], [/rhythmbox/i, 'Rhythmbox']
  ];
  for (let i = 0; i < known.length; i++) if (known[i][0].test(s)) return known[i][1];
  return s.replace(/\.exe$/i, '').replace(/_[a-z0-9]{10,}!.*$/i, '').split(/[.!\\/]/).pop() || s;
}

function hash(parts) {
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
}

function estimate(s, now) {
  const key = hash([s.title, s.artist, s.album]);
  let t = tracking[s.id];
  if (!t || t.key !== key) {
    const trust = !t || (s.updatedAt && s.updatedAt >= now - 4000);
    t = tracking[s.id] = {
      key: key,
      trackStart: now,
      upd: s.updatedAt,
      base: trust ? s.position : 0,
      baseAt: trust ? (s.updatedAt || now) : now,
      duration: trust ? s.duration : 0,
      status: s.status
    };
  } else if (s.updatedAt !== t.upd) {
    t.upd = s.updatedAt;

    t.base = s.position;
    t.baseAt = s.updatedAt || now;
    t.duration = s.duration;
  }
  if (s.status !== t.status) {
    t.base = currentPos(t, now);
    t.baseAt = now;
    t.status = s.status;
  }
  return { position: currentPos(t, now), duration: t.duration };
}

function currentPos(t, now) {
  let p = t.base;
  if (t.status === 'playing') p += Math.max(0, (now - t.baseAt) / 1000);
  if (t.duration) p = Math.min(p, t.duration);
  return p;
}

function processNamesFor(s) {
  const custom = settings().processNames;
  const keys = Object.keys(custom);
  for (let i = 0; i < keys.length; i++) if (new RegExp(keys[i], 'i').test(s.app)) return [].concat(custom[keys[i]]);
  for (let j = 0; j < PROCESS_HINTS.length; j++) if (PROCESS_HINTS[j][0].test(s.app)) return PROCESS_HINTS[j][1];
  return [String(s.app).split(/[\\/!]/).pop().replace(/\.exe$/i, '').toLowerCase()];
}

async function systemSessions() {
  if (Date.now() - sysCache.at < 1000 && sysCache.data) return sysCache.data;
  if (sysCache.pending) return sysCache.pending;
  sysCache.pending = platform.sessions().then(function (d) {
    lastError = null;
    sysCache = { at: Date.now(), data: d, pending: null };
    return d;
  }).catch(function (e) {
    if (lastError !== e.message) log.warn('media', 'sessioni: ' + e.message);
    lastError = e.message;
    sysCache.pending = null;
    return { supported: true, sessions: [], error: true };
  });
  return sysCache.pending;
}

async function sources() {
  const now = Date.now();
  const s = settings();
  const out = [];

  bridge.players().forEach(function (t) {
    const st = t.state;
    out.push({
      id: 'bridge:' + t.key,
      kind: 'bridge',
      tabKey: t.key,
      appName: SITE_NAMES[st.site] || 'Browser',
      site: st.site,
      title: st.title,
      artist: st.artist,
      album: st.album,
      status: st.playing ? 'playing' : 'paused',
      position: Math.min(st.duration || Infinity, st.position + (st.playing ? (now - t.at) / 1000 : 0)),
      duration: st.duration,
      artwork: st.artwork,
      hasArt: !!st.artwork,
      volume: st.volume,
      muted: st.muted,
      shuffle: st.shuffle,
      repeat: st.repeat,
      canSeek: st.duration > 0,
      canVolume: st.volume !== null,
      canShuffle: st.shuffle !== null,
      canRepeat: st.repeat !== null,
      canQueue: !!(st.queue && st.queue.length),
      queue: st.queue,
      since: t.firstAt
    });
  });

  const sys = await systemSessions();
  const useBrowsers = s.browserFallback && !bridge.connected();
  (sys.sessions || []).forEach(function (ss) {
    if (matchAny(s.block, ss.app)) return;
    const isBrowser = BROWSERS.test(ss.app);
    if (isBrowser ? !useBrowsers : !matchAny(s.allow, ss.app)) return;
    if (!ss.title) return;
    const est = estimate(ss, now);
    const id = 'sys:' + ss.id;
    out.push({
      id: id,
      kind: 'system',
      session: ss,
      appName: prettyApp(ss.app),
      title: ss.title,
      artist: ss.artist,
      album: ss.album,
      status: ss.status,
      position: est.position,
      duration: est.duration,
      hasArt: ss.hasArt,
      volume: volumeCache[id] === undefined ? null : volumeCache[id],
      muted: false,
      shuffle: ss.canShuffle ? ss.shuffle : null,
      repeat: null,
      canSeek: ss.canSeek && est.duration > 0,
      canVolume: !!platform.capabilities().appVolume,
      canShuffle: ss.canShuffle,
      canRepeat: false,
      canQueue: false,
      queue: null,
      since: tracking[ss.id] ? tracking[ss.id].trackStart : now
    });
  });
  return { supported: sys.supported !== false || out.length > 0, list: out };
}

function pick(list) {
  if (!list.length) return null;
  const sticky = list.filter(function (x) { return x.id === selectedId; })[0];
  const playing = list.filter(function (x) { return x.status === 'playing'; });
  let chosen;
  if (sticky && sticky.status === 'playing') chosen = sticky;
  else if (playing.length) {
    playing.sort(function (a, b) { return (b.kind === 'bridge') - (a.kind === 'bridge') || b.since - a.since; });
    chosen = playing[0];
  } else if (sticky) chosen = sticky;
  else {
    list.sort(function (a, b) { return (b.kind === 'bridge') - (a.kind === 'bridge') || b.since - a.since; });
    chosen = list[0];
  }
  selectedId = chosen.id;
  return chosen;
}

async function active() {
  const s = await sources();
  return { supported: s.supported, src: pick(s.list), count: s.list.length };
}

async function nowPlaying() {
  const a = await active();
  if (!a.src) return { supported: a.supported, active: false, bridge: bridge.connected() };
  const x = a.src;
  return {
    supported: true,
    active: true,
    bridge: bridge.connected(),
    source: x.kind,
    appName: x.appName,
    title: x.title,
    artist: x.artist,
    album: x.album,
    status: x.status,
    position: x.position,
    duration: x.duration,
    updatedAt: Date.now(),
    key: hash([x.id, x.title, x.artist, x.album]),
    hasArt: x.hasArt,
    volume: x.volume,
    muted: x.muted,
    shuffle: x.shuffle,
    repeat: x.repeat,
    canSeek: x.canSeek,
    canVolume: x.canVolume,
    canShuffle: x.canShuffle,
    canRepeat: x.canRepeat,
    canQueue: x.canQueue,
    queueKey: x.queue ? hash(x.queue.map(function (q) { return q.title + (q.current ? '*' : ''); })) : null,
    others: a.count - 1
  };
}

async function queue() {
  const a = await active();
  if (!a.src || !a.src.queue) return { available: false, items: [] };
  return { available: true, appName: a.src.appName, items: a.src.queue };
}

async function fetchImage(url) {
  const ctrl = new AbortController();
  const t = setTimeout(function () { ctrl.abort(); }, 6000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || 'image/jpeg';
    if (!/^image\//.test(type)) return null;
    return { mime: type, data: Buffer.from(await res.arrayBuffer()) };
  } catch (e) { return null; } finally { clearTimeout(t); }
}

async function artwork() {
  const a = await active();
  const x = a.src;
  if (!x || !x.hasArt) return null;
  const key = hash([x.id, x.title, x.artist, x.album]);
  if (artCache.key === key && artCache.data) return artCache.data;
  if (artCache.pending && artCache.pendingKey === key) return artCache.pending;
  artCache.pendingKey = key;
  artCache.pending = (async function () {
    let data = null;
    if (x.kind === 'bridge') data = await fetchImage(x.artwork);
    else {
      data = await platform.art(x.session).catch(function () { return null; });
      if (data && data.url) data = await fetchImage(data.url);
    }
    artCache.key = key;
    artCache.data = data;
    artCache.pending = null;
    return data;
  })();
  return artCache.pending;
}

function badRequest(msg) { return Object.assign(new Error(msg), { code: 'BAD_REQUEST' }); }

const COMMANDS = ['play_pause', 'next', 'previous', 'stop', 'volume_up', 'volume_down', 'mute', 'seek', 'shuffle', 'repeat', 'queue_play'];
const VOLUME_STEP = 0.06;

async function command(cmd, value) {
  if (COMMANDS.indexOf(cmd) < 0) throw badRequest('Comando media sconosciuto: ' + cmd);
  const a = await active();
  const x = a.src;
  if (!x) throw Object.assign(new Error('Nessun player musicale attivo'), { code: 'NOT_FOUND' });
  sysCache.at = 0;

  if (x.kind === 'bridge') {
    const c = { type: cmd };
    if (cmd === 'volume_up' || cmd === 'volume_down') {
      const v = Math.max(0, Math.min(1, (x.volume === null ? 0.5 : x.volume) + (cmd === 'volume_up' ? VOLUME_STEP : -VOLUME_STEP)));
      c.type = 'volume';
      c.value = Math.round(v * 100) / 100;
    } else if (cmd === 'seek') {
      c.value = Math.max(0, Number(value) || 0);
    } else if (cmd === 'queue_play') {
      c.value = parseInt(value, 10);
      if (isNaN(c.value)) throw badRequest('Brano non valido');
    }
    bridge.send(x.tabKey, c);
    if (['play_pause', 'next', 'previous'].indexOf(cmd) >= 0 && bridge.isStale(x.tabKey, 3000)) {
      const sys = await systemSessions();
      const browsers = (sys.sessions || []).filter(function (s) { return BROWSERS.test(s.app); });
      if (browsers.length === 1) await platform.control(browsers[0], cmd).catch(function () {});
    }
    return { done: cmd, volume: c.type === 'volume' ? c.value : undefined };
  }

  const s = x.session;
  if (cmd === 'volume_up' || cmd === 'volume_down' || cmd === 'mute') {
    const delta = cmd === 'mute' ? 0 : (cmd === 'volume_up' ? VOLUME_STEP : -VOLUME_STEP);
    const level = await platform.appVolume(processNamesFor(s), delta, cmd === 'mute' ? 2 : -1, s);
    if (level < 0) throw new Error(x.appName + ': volume dell\'app non trovato (l\'app sta suonando?)');
    volumeCache[x.id] = Math.round(level * 100) / 100;
    return { done: cmd, volume: volumeCache[x.id] };
  }
  if (cmd === 'seek') {
    if (!x.canSeek) throw new Error(x.appName + ' non permette di spostarsi nel brano');
    await platform.control(s, 'seek', Math.max(0, Number(value) || 0));
    if (tracking[s.id]) { tracking[s.id].base = Number(value) || 0; tracking[s.id].baseAt = Date.now(); }
    return { done: cmd };
  }
  if (cmd === 'shuffle') {
    if (!x.canShuffle) throw new Error(x.appName + ' non supporta lo shuffle da remoto');
    await platform.control(s, 'shuffle', !x.shuffle);
    return { done: cmd };
  }
  if (cmd === 'repeat' || cmd === 'queue_play') {
    throw new Error('Disponibile solo per Apple Music e YouTube nel browser (con l\'estensione)');
  }
  await platform.control(s, cmd);
  return { done: cmd };
}

module.exports = {
  nowPlaying: nowPlaying,
  queue: queue,
  artwork: artwork,
  command: command,
  prettyApp: prettyApp,
  _internals: { estimate: estimate, tracking: tracking, matchAny: matchAny, pick: pick, settings: settings }
};
