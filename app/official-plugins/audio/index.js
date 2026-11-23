'use strict';
const mixer = require('./lib/mixer');

function str(v) { return String(v || ''); }

module.exports = {
  description: 'Outputs, microphones and per-app volume',
  routes: function (router, ctx) {
    const r = ctx.route;
    router.get('/', r(function () { return mixer.state(); }));
    router.post('/default', r(function (req) { return mixer.setDefault(str((req.body || {}).id)); }));
    router.post('/device', r(function (req) { const b = req.body || {}; return mixer.device(str(b.id), b); }));
    router.post('/app', r(function (req) { const b = req.body || {}; return mixer.app(str(b.id), b); }));
  }
};
