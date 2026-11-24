'use strict';
const fs = require('fs');
const path = require('path');
const games = require('./lib/games');

function sendImage(res, file, cache) {
  res.setHeader('Cache-Control', cache || 'no-cache');
  res.sendFile(file);
}

module.exports = {
  description: 'Your games on the tablet, picked in the control panel',
  hooks: {
    apps: function () { return games.apps(); },
    stamp: function (payload, ctx) {
      try { return Math.round(fs.statSync(path.join(ctx.paths.DATA_DIR, 'games.json')).mtimeMs); } catch (e) { return 0; }
    }
  },
  sources: {
    games: function () { return games.tiles(); }
  },
  routes: function (router) {
    router.get('/icon/:id', function (req, res) {
      try { sendImage(res, games.icon(req.params.id), 'private, max-age=86400'); } catch (e) { res.status(404).end(); }
    });
  },
  control: {
    info: function () { return games.panelInfo(); },
    routes: function (router, ctx) {
      const only = ctx.controlOnly, r = ctx.route;
      router.post('/pick', only, r(async function () {
        const picked = await games.pickFile();
        if (!picked.path) return { path: '' };
        const info = await games.fileInfo(picked.path);
        const icon = await games.fileIcon(picked.path).catch(function (e) { ctx.log.info('icona del file: ' + e.message); return { token: '' }; });
        return Object.assign(info, { iconToken: icon.token });
      }));
      router.post('/fileicon', only, r(function (req) { return games.fileIconOf((req.body || {}).id); }));
      router.post('/search', only, r(function (req) { return games.searchIcons((req.body || {}).name); }));
      router.post('/', only, r(async function (req) { await games.add(req.body || {}); return ctx.controlInfo(); }));
      router.post('/remove', only, r(function (req) { games.remove((req.body || {}).id); return ctx.controlInfo(); }));
      router.post('/icon', only, r(async function (req) { const b = req.body || {}; await games.setIcon(b.id, b.icon); return ctx.controlInfo(); }));
      router.post('/order', only, r(function (req) { games.reorder((req.body || {}).ids); return ctx.controlInfo(); }));
      router.get('/preview/:token', function (req, res) {
        try { sendImage(res, games.previewFile(req.params.token)); } catch (e) { res.status(404).end(); }
      });
      router.get('/icon/:id', function (req, res) {
        try { sendImage(res, games.icon(req.params.id)); } catch (e) { res.status(404).end(); }
      });
    }
  }
};
