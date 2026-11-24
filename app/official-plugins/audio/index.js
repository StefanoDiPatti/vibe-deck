'use strict';
const mixer = require('./lib/mixer');

function str(v) { return String(v || ''); }

function defaults(state) {
  const devices = (state && state.devices) || [];
  const pick = function (flow) { return devices.filter(function (d) { return d.flow === flow && d.default; })[0] || null; };
  return { output: pick('out'), input: pick('in') };
}

async function setDefaultVolume(flow, value) {
  const n = Math.max(0, Math.min(100, Math.round(Number(value))));
  if (isNaN(n)) throw Object.assign(new Error('Volume non valido'), { code: 'BAD_REQUEST' });
  const dev = defaults(await mixer.state(true))[flow === 'in' ? 'input' : 'output'];
  if (!dev) throw Object.assign(new Error('Nessun dispositivo predefinito'), { code: 'UNAVAILABLE' });
  await mixer.device(dev.id, { volume: n });
  return { message: null };
}

module.exports = {
  description: 'Outputs, microphones and per-app volume',
  sources: {
    mixer: {
      every: 2,
      read: async function () {
        const state = await mixer.state();
        return Object.assign({}, state, defaults(state));
      }
    }
  },
  actions: {
    volume: function (action) { return setDefaultVolume(action.flow, action.value); }
  },
  routes: function (router, ctx) {
    const r = ctx.route;
    router.get('/', r(function () { return mixer.state(); }));
    router.post('/default', r(function (req) { return mixer.setDefault(str((req.body || {}).id)); }));
    router.post('/device', r(function (req) { const b = req.body || {}; return mixer.device(str(b.id), b); }));
    router.post('/app', r(function (req) { const b = req.body || {}; return mixer.app(str(b.id), b); }));
  }
};
