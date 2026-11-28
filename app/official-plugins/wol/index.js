'use strict';
const wol = require('./lib/wol');

function str(v) { return String(v || ''); }

module.exports = {
  description: 'Wake-on-LAN: wake computers and other devices on the network',
  sources: {
    devices: {
      label: 'Dispositivi Wake-on-LAN',
      description: 'I dispositivi aggiunti nel pannello (nome e indirizzo MAC)',
      every: 10,
      fields: [
        { path: 'devices', label: 'Dispositivi', type: 'list' },
        { path: 'count', label: 'Quanti', type: 'number' }
      ],
      read: function (src, ctx) {
        const devices = wol.list(ctx);
        return { devices: devices, count: devices.length };
      }
    }
  },
  actions: {
    wake: {
      label: 'Sveglia un dispositivo',
      description: 'Manda il pacchetto Wake-on-LAN al dispositivo (nome salvato nel pannello oppure indirizzo MAC)',
      params: [{ name: 'device', label: 'Dispositivo', type: 'template', required: true }],
      run: function (a, ctx) { return wol.wake(ctx, a.device); }
    }
  },
  control: {
    info: function (ctx) { return { devices: wol.list(ctx) }; },
    routes: function (router, ctx) {
      const only = ctx.controlOnly, r = ctx.route;
      router.post('/add', only, r(function (req) { wol.add(ctx, req.body); return ctx.controlInfo(); }));
      router.post('/remove', only, r(function (req) { wol.remove(ctx, str((req.body || {}).name)); return ctx.controlInfo(); }));
      router.post('/wake', only, r(function (req) { return wol.wake(ctx, str((req.body || {}).name)); }));
    }
  }
};
