'use strict';
const discord = require('./lib/discord');
const appsState = require('../../server/services/apps');

const COMMANDS = ['mute', 'deaf', 'video', 'stream'];

function fail(msg, code) { return Object.assign(new Error(msg), { code: code || 'ACTION_FAILED' }); }

async function runningGame(ctx) {
  const platform = ctx.platform;
  if (typeof platform.windowList !== 'function') return null;
  const forPlatform = require('../../server/platform/common').forPlatform;
  const all = ctx.config.apps();
  const games = Object.keys(all).map(function (id) { return { id: id, app: forPlatform(all[id]) }; })
    .filter(function (g) { return g.app && g.app.game; });
  if (!games.length) return null;
  const wins = await platform.windowList().catch(function () { return []; });
  wins.sort(function (x, y) { return (y.active ? 1 : 0) - (x.active ? 1 : 0); });
  for (let i = 0; i < wins.length; i++) {
    if (wins[i].state === 'min') continue;
    for (let j = 0; j < games.length; j++) {
      if (appsState.processNames(games[j].app).indexOf(wins[i].process) >= 0) return { pid: wins[i].pid, label: games[j].app.label || games[j].id };
    }
  }
  return null;
}

async function command(a, ctx) {
  const what = String(a.command || '');
  if (COMMANDS.indexOf(what) < 0) throw fail('Comando Discord sconosciuto: ' + what, 'BAD_CONFIG');
  await discord.ensure();
  if (discord.state().status !== 'ready') {
    if (what === 'video' || what === 'stream') throw fail('Per webcam e Go Live collega Discord dal pannello di controllo sul PC', 'UNAVAILABLE');
    await ctx.execute({ type: 'hotkey', keys: ['CTRL', 'SHIFT', what === 'mute' ? 'M' : 'D'], focus: 'discord' });
    return Object.assign(discord.state(), { message: (what === 'mute' ? 'Mute' : 'Silenzia') + ' inviato a Discord (scorciatoia)' });
  }
  if (what === 'mute' || what === 'deaf') return Object.assign(await discord.toggle(what), { message: null });
  const was = discord.state().voice[what];
  const game = what === 'stream' && !was ? await runningGame(ctx) : null;
  const st = await discord.toggleMedia(what, game ? game.pid : null);
  const message = what === 'video' ? (was ? 'Webcam spenta' : 'Webcam accesa') :
    was ? 'Condivisione fermata' : 'Go Live' + (game ? ': ' + game.label : ' avviato');
  return Object.assign(st, { message: message });
}

module.exports = {
  description: 'Discord voice from the tablet: rooms, who is talking, mute, webcam, Go Live',
  actions: { discord: command },
  routes: function (router, ctx) {
    const r = ctx.route;
    router.get('/state', r(async function () { await discord.ensure(); return discord.state(); }));
    router.get('/guilds', r(function (req) { return discord.guilds(req.query.refresh === '1'); }));
    router.get('/channels', r(function (req) { return discord.channels(String(req.query.guild || '')); }));
    router.post('/toggle', r(function (req) {
      const what = String((req.body || {}).what || '');
      if (COMMANDS.indexOf(what) < 0) throw fail('Comando non valido', 'BAD_REQUEST');
      return ctx.execute({ type: 'discord', command: what });
    }));
    router.post('/join', r(function (req) {
      const c = (req.body || {}).channel;
      return discord.join(c === null || c === undefined || c === '' ? null : String(c));
    }));
    router.post('/user', r(function (req) {
      const b = req.body || {};
      return discord.userVoice(String(b.user || ''), { mute: typeof b.mute === 'boolean' ? b.mute : undefined, volume: typeof b.volume === 'number' ? b.volume : undefined });
    }));
    router.get('/img', function (req, res) {
      discord.image(String(req.query.p || '')).then(function (im) {
        res.setHeader('Cache-Control', 'max-age=86400');
        res.type(im.type).send(im.body);
      }).catch(function () { res.status(404).end(); });
    });
  },
  control: {
    info: function () { return discord.panelInfo(); },
    prepare: function () { return discord.ensure(); },
    routes: function (router, ctx) {
      const only = ctx.controlOnly, r = ctx.route;
      router.post('/', only, r(async function (req) { const b = req.body || {}; await discord.setup(b.clientId, b.clientSecret); return ctx.controlInfo(); }));
      router.post('/authorize', only, r(async function () { await discord.authorize(); return ctx.controlInfo(); }));
      router.post('/logout', only, r(function () { discord.logout(); return ctx.controlInfo(); }));
    }
  }
};
