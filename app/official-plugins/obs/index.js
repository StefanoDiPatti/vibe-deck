'use strict';
const path = require('path');
const secrets = require('../../server/secrets');
const paths = require('../../server/paths');
const { Obs } = require('./lib/obs');

let obs = null;
function client(ctx) {
  if (!obs) {
    obs = new Obs({
      secrets: secrets,
      file: path.join(process.env.DOCK_DATA_DIR || paths.DATA_DIR, 'obs.json'),
      log: ctx ? ctx.log : null
    });
  }
  return obs;
}

const STREAM_OPTIONS = [{ value: 'toggle', label: 'Avvia / ferma' }, { value: 'start', label: 'Avvia' }, { value: 'stop', label: 'Ferma' }];

module.exports = {
  description: 'OBS Studio: live and recording, scenes, audio sources, program preview (obs-websocket)',
  hooks: {
    start: function () { client().ensure().catch(function () {}); },
    stop: function () { if (obs) obs.stop(); }
  },
  sources: {
    state: {
      label: 'OBS Studio',
      description: 'Diretta, registrazione, scena in onda e statistiche di OBS',
      every: 2,
      fields: [
        { path: 'stream.active', label: 'In diretta', type: 'boolean' },
        { path: 'stream.time', label: 'Durata della diretta', type: 'text' },
        { path: 'stream.congestion', label: 'Rete congestionata', type: 'number', unit: '%' },
        { path: 'record.active', label: 'In registrazione', type: 'boolean' },
        { path: 'record.time', label: 'Durata della registrazione', type: 'text' },
        { path: 'scene', label: 'Scena in onda', type: 'text' },
        { path: 'scenes', label: 'Scene', type: 'list' },
        { path: 'stats.fps', label: 'FPS', type: 'number' },
        { path: 'stats.cpu', label: 'CPU di OBS', type: 'number', unit: '%' },
        { path: 'stats.outputSkipped', label: 'Frame persi', type: 'number' },
        { path: 'virtualcam', label: 'Webcam virtuale attiva', type: 'boolean' }
      ],
      read: function () { return client().state(); }
    }
  },
  actions: {
    stream: { label: 'OBS: diretta', description: 'Avvia o ferma la diretta in OBS', params: [{ name: 'do', label: 'Cosa', type: 'select', options: STREAM_OPTIONS, default: 'toggle' }], run: function (a) { return client().stream(a.do); } },
    record: { label: 'OBS: registrazione', description: 'Avvia, ferma o metti in pausa la registrazione', params: [{ name: 'do', label: 'Cosa', type: 'select', options: STREAM_OPTIONS.concat([{ value: 'pause', label: 'Pausa / riprendi' }]), default: 'toggle' }], run: function (a) { return client().record(a.do); } },
    scene: { label: 'OBS: cambia scena', description: 'Mette in onda una scena', params: [{ name: 'name', label: 'Scena', type: 'template', required: true }], run: function (a) { return client().scene(a.name); } },
    mute: { label: 'OBS: muto', description: 'Attiva o toglie il muto a una sorgente audio (es. Mic/Aux)', params: [{ name: 'input', label: 'Sorgente audio', type: 'text', required: true }], run: function (a) { return client().mute(a.input); } },
    virtualcam: { label: 'OBS: webcam virtuale', description: 'Accende o spegne la webcam virtuale', params: [], run: function () { return client().virtualcam(); } },
    replay: { label: 'OBS: salva replay', description: 'Salva il replay buffer', params: [], run: function () { return client().replay(); } }
  },
  routes: function (router, ctx) {
    const r = ctx.route;
    router.get('/state', r(function () { return client(ctx).state(); }));
    router.get('/preview', r(function (req) { return client(ctx).preview(req.query.w); }));
    router.post('/stream', r(function (req) { return client(ctx).stream((req.body || {}).do); }));
    router.post('/record', r(function (req) { return client(ctx).record((req.body || {}).do); }));
    router.post('/scene', r(function (req) { return client(ctx).scene((req.body || {}).name); }));
    router.post('/mute', r(function (req) { return client(ctx).mute((req.body || {}).input); }));
    router.post('/virtualcam', r(function () { return client(ctx).virtualcam(); }));
    router.post('/replay', r(function () { return client(ctx).replay(); }));
  },
  control: {
    info: function () { return client().panelInfo(); },
    prepare: function () { return client().ensure().catch(function () {}); },
    routes: function (router, ctx) {
      const only = ctx.controlOnly, r = ctx.route;
      router.post('/', only, r(async function (req) {
        const b = req.body || {};
        await client(ctx).save(b.host, b.port, b.password === '' ? undefined : b.password);
        return ctx.controlInfo();
      }));
    }
  }
};
