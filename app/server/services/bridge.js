const log = require('../log');

const PLAYING_TTL = 12000;
const PAUSED_TTL = 150000;
const tabs = {};
let lastSeen = 0;

function clean() {
  const now = Date.now();
  Object.keys(tabs).forEach(function (k) {
    const t = tabs[k];
    const ttl = t.state && t.state.playing ? PLAYING_TTL : PAUSED_TTL;
    if (now - t.at > ttl) delete tabs[k];
  });
}

function num(v, def) { const n = Number(v); return isFinite(n) ? n : def; }
function str(v, max) { return typeof v === 'string' ? v.slice(0, max || 300) : ''; }

function sanitize(s) {
  s = s || {};
  const queue = Array.isArray(s.queue) ? s.queue.slice(0, 120).map(function (q, i) {
    return {
      index: num(q && q.index, i),
      title: str(q && q.title, 200),
      artist: str(q && q.artist, 200),
      current: !!(q && q.current)
    };
  }) : null;
  return {
    site: /^(apple|ytmusic|youtube)$/.test(s.site) ? s.site : 'web',
    title: str(s.title),
    artist: str(s.artist),
    album: str(s.album),
    artwork: /^https:\/\//.test(s.artwork || '') ? str(s.artwork, 1000) : '',
    duration: Math.max(0, num(s.duration, 0)),
    position: Math.max(0, num(s.position, 0)),
    playing: !!s.playing,
    volume: s.volume === null || s.volume === undefined ? null : Math.max(0, Math.min(1, num(s.volume, 0))),
    muted: !!s.muted,
    shuffle: typeof s.shuffle === 'boolean' ? s.shuffle : null,
    repeat: /^(none|one|all)$/.test(s.repeat) ? s.repeat : null,
    queue: queue
  };
}

function update(key, rawState) {
  key = str(String(key), 80);
  const now = Date.now();
  lastSeen = now;
  const t = tabs[key] || (tabs[key] = { key: key, commands: [], firstAt: now });
  if (!rawState) {
    delete tabs[key];
    return [];
  }
  t.state = sanitize(rawState);
  t.at = now;
  const cmds = t.commands;
  t.commands = [];
  return cmds;
}

function remove(key) { delete tabs[String(key)]; }

function players() {
  clean();
  return Object.keys(tabs).map(function (k) { return tabs[k]; }).filter(function (t) {
    return t.state && (t.state.title || t.state.playing);
  });
}

function send(key, command) {
  const t = tabs[key];
  if (!t) throw new Error('Scheda del browser non più disponibile');
  t.commands.push(command);
  if (t.commands.length > 20) t.commands.shift();
  log.debug('bridge', 'comando ' + command.type + ' -> ' + key);
}

function hasSite(site) {
  clean();
  return Object.keys(tabs).some(function (k) { return tabs[k].state && tabs[k].state.site === site; });
}

function sendSite(site, command) {
  clean();
  Object.keys(tabs).forEach(function (k) {
    if (tabs[k].state && tabs[k].state.site === site) send(k, command);
  });
}

function isStale(key, ms) {
  const t = tabs[key];
  return !t || Date.now() - t.at > ms;
}

module.exports = {
  update: update,
  remove: remove,
  players: players,
  send: send,
  isStale: isStale,
  hasSite: hasSite,
  sendSite: sendSite,
  lastSeen: function () { return lastSeen; },
  connected: function () { return Date.now() - lastSeen < 5 * 60000; },
  _reset: function () { Object.keys(tabs).forEach(function (k) { delete tabs[k]; }); lastSeen = 0; }
};
