'use strict';
const mail = require('./lib/mail');

function str(v) { return String(v || ''); }

module.exports = {
  description: 'Inbox of your Thunderbird accounts on the tablet',
  hooks: {
    start: function (payload, ctx) {
      mail.startupCheck().catch(function (e) { ctx.log.info('controllo all\'avvio: ' + e.message); });
    }
  },
  routes: function (router, ctx) {
    const r = ctx.route;
    router.get('/', r(function () { return mail.state(); }));
    router.get('/list', r(function (req) { return mail.list(str(req.query.account), req.query.refresh === '1'); }));
    router.get('/message', r(function (req) { return mail.message(str(req.query.account), req.query.uid); }));
    router.post('/open', r(function (req) { return mail.openWebmail(str((req.body || {}).account)); }));
  },
  control: {
    info: function () { return mail.panelInfo(); },
    routes: function (router, ctx) {
      const only = ctx.controlOnly, r = ctx.route;
      router.post('/check', only, r(async function () { await mail.check(); return ctx.controlInfo(); }));
      router.post('/open', only, r(function () { return mail.openWebmail(); }));
      router.post('/show', only, r(function (req) { const b = req.body || {}; mail.setShown(str(b.id), b.shown !== false); return ctx.controlInfo(); }));
    }
  }
};
