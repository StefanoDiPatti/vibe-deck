'use strict';
const calendar = require('./lib/calendar');

module.exports = {
  description: 'Agenda from an ICS link or file',
  sources: {
    events: {
      label: 'Calendario',
      description: 'Prossimi eventi del calendario collegato nel pannello (link ICS o file)',
      every: 60,
      fields: [
        { path: 'next.title', label: 'Prossimo evento', type: 'text' },
        { path: 'next.when', label: 'Quando', type: 'text' },
        { path: 'next.time', label: 'Ora', type: 'text' },
        { path: 'next.location', label: 'Luogo', type: 'text' },
        { path: 'today', label: 'Eventi di oggi', type: 'number' },
        { path: 'events', label: 'Eventi dei prossimi giorni', type: 'list' },
        { path: 'error', label: 'Errore', type: 'text' }
      ],
      read: function (src, ctx) { return calendar.read(ctx); }
    }
  },
  control: {
    info: function (ctx) { return calendar.settings(ctx); },
    routes: function (router, ctx) {
      const only = ctx.controlOnly, r = ctx.route;
      router.post('/', only, r(function (req) { calendar.configure(ctx, req.body); return ctx.controlInfo(); }));
      router.post('/test', only, r(async function () {
        const out = await calendar.read(ctx);
        return { count: out.count, today: out.today, next: out.next, error: out.error };
      }));
    }
  }
};
