'use strict';
const path = require('path');
const secrets = require('../../server/secrets');
const paths = require('../../server/paths');
const voice = require('../../server/services/voice');
const { DeepSeek } = require('./lib/deepseek');

let service = null;
function client(ctx) {
  if (!service) {
    service = new DeepSeek({
      secrets: secrets,
      file: path.join(process.env.DOCK_DATA_DIR || paths.DATA_DIR, 'deepseek.json'),
      log: ctx ? ctx.log : null
    });
  }
  return service;
}

function str(v) { return String(v === undefined || v === null ? '' : v); }

module.exports = {
  description: 'DeepSeek chat with live answers, model choice and account balance',
  sources: {
    balance: {
      label: 'Saldo DeepSeek',
      description: 'Credito rimasto sull\'account DeepSeek (serve la chiave API nel pannello)',
      every: 300,
      fields: [
        { path: 'total', label: 'Saldo', type: 'number' },
        { path: 'currency', label: 'Valuta', type: 'text' },
        { path: 'toppedUp', label: 'Ricaricato', type: 'number' },
        { path: 'granted', label: 'Regalato', type: 'number' },
        { path: 'available', label: 'Utilizzabile', type: 'boolean' }
      ],
      read: function () { return client().balance(false); }
    }
  },
  routes: function (router, ctx) {
    const r = ctx.route;
    router.get('/info', r(async function () {
      const m = await client(ctx).safeModels();
      return Object.assign(m, { voiceServer: voice.available() });
    }));
    router.get('/balance', r(function (req) { return client(ctx).balance(req.query.refresh === '1'); }));
    router.post('/send', r(function (req) {
      const b = req.body || {};
      return client(ctx).send(b.sessionId ? str(b.sessionId) : null, str(b.model), str(b.text));
    }));
    router.get('/job', r(function (req) { return client(ctx).job(str(req.query.id)); }));
    router.post('/stop', r(function (req) { return client(ctx).stop(str((req.body || {}).id)); }));
  },
  control: {
    info: function () { return client().panelInfo(); },
    prepare: function () { return client().settings().key && !client().cache.modelsAt ? client().check() : null; },
    routes: function (router, ctx) {
      const only = ctx.controlOnly, r = ctx.route;
      router.post('/', only, r(async function (req) {
        await client(ctx).save(req.body || {});
        return ctx.controlInfo();
      }));
    }
  }
};
