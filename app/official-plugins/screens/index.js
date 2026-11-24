'use strict';
const screens = require('./lib/screens');
const vdesk = require('./lib/vdesk');

function str(v) { return String(v || ''); }
function bad(msg) { return Object.assign(new Error(msg), { code: 'BAD_REQUEST' }); }

module.exports = {
  description: 'PC monitors, window layouts and virtual desktops',
  hooks: {
    launch: function (info) { return screens.followLaunch(info.processes); }
  },
  routes: function (router, ctx) {
    const r = ctx.route;
    router.get('/', r(function () { return screens.info(); }));
    router.get('/windows', r(function () { return screens.windows(); }));
    router.post('/target', r(function (req) {
      const m = (req.body || {}).monitor;
      return screens.setTarget(m === null || m === undefined || m === '' ? null : String(m));
    }));
    router.post('/place', r(function (req) {
      const b = req.body || {};
      return screens.place(str(b.window), str(b.monitor), str(b.layout), b.zone, b.focus !== false);
    }));
    router.post('/window', r(function (req) { const b = req.body || {}; return screens.act(str(b.window), str(b.action)); }));
    router.get('/desktops', r(function () { return vdesk.list(); }));
    router.post('/move', r(function (req) {
      const b = req.body || {};
      if (b.monitor) return screens.moveWindowToMonitor(str(b.window), String(b.monitor));
      if (b.desktop) return vdesk.moveWindow(str(b.window), String(b.desktop));
      throw bad('desktop o monitor richiesti');
    }));
    router.post('/desktops', r(function (req) { const b = req.body || {}; return vdesk.action(str(b.action), b.desktop ? String(b.desktop) : ''); }));
  }
};
