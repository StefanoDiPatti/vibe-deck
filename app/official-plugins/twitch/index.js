'use strict';
const path = require('path');
const secrets = require('../../server/secrets');
const paths = require('../../server/paths');
const { Twitch } = require('./lib/twitch');

let twitch = null;
function client(ctx) {
  if (!twitch) twitch = new Twitch({ secrets: secrets, file: path.join(process.env.DOCK_DATA_DIR || paths.DATA_DIR, 'twitch.json'), log: ctx ? ctx.log : null });
  return twitch;
}

const MODES = [{ value: 'slow', label: 'Lenta' }, { value: 'emote', label: 'Solo emote' }, { value: 'subs', label: 'Solo abbonati' }, { value: 'followers', label: 'Solo follower' }];

module.exports = {
  description: 'Twitch: live chat, viewers, title and category, markers, clips, ads and chat modes',
  hooks: {
    start: function () { client().start(); },
    stop: function () { if (twitch) twitch.stop(); }
  },
  sources: {
    state: {
      label: 'Twitch',
      description: 'La tua diretta su Twitch: spettatori, durata, titolo, categoria, follower',
      every: 20,
      fields: [
        { path: 'live.active', label: 'In diretta', type: 'boolean' },
        { path: 'live.viewers', label: 'Spettatori', type: 'number' },
        { path: 'live.uptime', label: 'Durata (h:mm)', type: 'text' },
        { path: 'live.title', label: 'Titolo', type: 'text' },
        { path: 'live.game', label: 'Categoria', type: 'text' },
        { path: 'live.followers', label: 'Follower', type: 'number' },
        { path: 'channel', label: 'Canale', type: 'text' }
      ],
      read: function () { return client().state(); }
    }
  },
  actions: {
    marker: { label: 'Twitch: marker', description: 'Segna questo momento della diretta', params: [{ name: 'description', label: 'Descrizione', type: 'template' }], run: function (a) { return client().marker(a.description); } },
    clip: { label: 'Twitch: crea clip', description: 'Crea una clip degli ultimi secondi', params: [], run: function () { return client().clip(); } },
    ad: { label: 'Twitch: pubblicità', description: 'Manda una pubblicità', params: [{ name: 'length', label: 'Durata', type: 'select', options: [30, 60, 90, 120, 180].map(function (n) { return { value: n, label: n + ' s' }; }), default: 30 }], run: function (a) { return client().ad(a.length); } },
    mode: { label: 'Twitch: modalità chat', description: 'Attiva o disattiva una modalità della chat', params: [{ name: 'mode', label: 'Modalità', type: 'select', options: MODES, required: true }], run: function (a) { return client().mode(a.mode); } },
    say: { label: 'Twitch: scrivi in chat', description: 'Manda un messaggio nella chat del tuo canale', params: [{ name: 'text', label: 'Messaggio', type: 'template', required: true }], run: function (a) { return client().say(a.text); } }
  },
  routes: function (router, ctx) {
    const r = ctx.route;
    router.get('/state', r(function () { return client(ctx).state(); }));
    router.get('/chat', r(function (req) { return client(ctx).messages(req.query.after); }));
    router.get('/categories', r(function (req) { return client(ctx).searchCategories(req.query.q); }));
    router.post('/marker', r(function (req) { return client(ctx).marker((req.body || {}).description); }));
    router.post('/clip', r(function () { return client(ctx).clip(); }));
    router.post('/ad', r(function (req) { return client(ctx).ad((req.body || {}).length); }));
    router.post('/mode', r(function (req) { const b = req.body || {}; return client(ctx).mode(b.mode, typeof b.on === 'boolean' ? b.on : undefined); }));
    router.post('/title', r(function (req) { return client(ctx).title((req.body || {}).title); }));
    router.post('/category', r(function (req) { const b = req.body || {}; return client(ctx).category(b.id, b.name); }));
    router.post('/say', r(function (req) { return client(ctx).say((req.body || {}).text); }));
  },
  control: {
    info: function () { return client().panelInfo(); },
    routes: function (router, ctx) {
      const only = ctx.controlOnly, r = ctx.route;
      router.post('/channel', only, r(function (req) { client(ctx).setChannel((req.body || {}).channel); return ctx.controlInfo(); }));
      router.post('/login', only, r(async function (req) { await client(ctx).login((req.body || {}).clientId); return ctx.controlInfo(); }));
      router.post('/check', only, r(async function () { await client(ctx).pollOnce(); return ctx.controlInfo(); }));
      router.post('/logout', only, r(function () { client(ctx).logout(); return ctx.controlInfo(); }));
    }
  }
};
