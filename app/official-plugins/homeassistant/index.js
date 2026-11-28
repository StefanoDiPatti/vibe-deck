'use strict';
const path = require('path');
const secrets = require('../../server/secrets');
const { HomeAssistant, webhook } = require('./lib/ha');

let instance = null;
function ha(ctx) {
  if (!instance) instance = new HomeAssistant({ secrets: secrets, file: path.join(ctx.paths.DATA_DIR, 'homeassistant.json'), log: ctx.log });
  return instance;
}

function str(v) { return String(v || ''); }

function parseData(text) {
  if (text === undefined || text === '') return {};
  if (typeof text === 'object') return text;
  try { return JSON.parse(String(text)); } catch (e) { throw Object.assign(new Error('"data" deve essere un JSON, es. {"brightness_pct": 40}'), { code: 'BAD_REQUEST' }); }
}

module.exports = {
  description: 'Smart home through Home Assistant, and a webhook action',
  sources: {
    devices: {
      label: 'Casa: i tuoi dispositivi',
      description: 'I dispositivi scelti nel pannello con il loro stato (Home Assistant)',
      every: 3,
      fields: [
        { path: 'devices', label: 'Dispositivi', type: 'list' },
        { path: 'count', label: 'Quanti', type: 'number' },
        { path: 'on', label: 'Quanti accesi', type: 'number' },
        { path: 'error', label: 'Errore', type: 'text' }
      ],
      read: function (src, ctx) { return ha(ctx).view(); }
    },
    entity: {
      label: 'Casa: un dispositivo',
      description: 'Stato e attributi di un dispositivo di Home Assistant (es. sensor.temperatura_salotto)',
      every: 5,
      params: [{ name: 'entity', label: 'Dispositivo (entity id)', type: 'text', required: true }],
      read: function (src, ctx) { return ha(ctx).read(str(src.entity)); }
    }
  },
  actions: {
    tap: {
      label: 'Casa: tocco su un dispositivo',
      description: 'Accende o spegne luci e interruttori, lancia scene e script, premi pulsanti (le serrature e gli allarmi sono esclusi)',
      params: [{ name: 'entity', label: 'Dispositivo', type: 'template', required: true }],
      run: function (a, ctx) { return ha(ctx).tap(str(a.entity)); }
    },
    service: {
      label: 'Casa: chiama un servizio',
      description: 'Qualsiasi servizio di Home Assistant (es. light.turn_on con {"brightness_pct": 40}); serrature, allarmi e riavvii sono esclusi',
      params: [
        { name: 'domain', label: 'Dominio', type: 'text', required: true },
        { name: 'service', label: 'Servizio', type: 'text', required: true },
        { name: 'entity', label: 'Dispositivo', type: 'template' },
        { name: 'data', label: 'Dati (JSON)', type: 'template' }
      ],
      run: function (a, ctx) {
        const data = parseData(a.data);
        if (a.entity) data.entity_id = str(a.entity);
        return ha(ctx).service(str(a.domain), str(a.service), data);
      }
    },
    webhook: {
      label: 'Chiama un indirizzo web (webhook)',
      description: 'Per Alexa e Google tramite IFTTT o Voice Monkey, e per Shelly, Tasmota, Hue, Home Assistant webhook e simili',
      params: [
        { name: 'url', label: 'Indirizzo', type: 'template', required: true },
        { name: 'method', label: 'Metodo', type: 'select', options: [{ value: 'POST', label: 'POST' }, { value: 'GET', label: 'GET' }], default: 'POST' },
        { name: 'body', label: 'Corpo (testo o JSON)', type: 'template' }
      ],
      run: function (a) { return webhook(a); }
    }
  },
  control: {
    info: function (ctx) { return ha(ctx).panelInfo(); },
    routes: function (router, ctx) {
      const only = ctx.controlOnly, r = ctx.route;
      router.post('/', only, r(async function (req) {
        const client = ha(ctx);
        client.save(req.body);
        let test = null;
        if (client.settings().url && client.settings().token) {
          try { test = await client.test(); } catch (e) { test = { error: e.message }; }
        }
        return Object.assign({ info: ctx.controlInfo(), test: test });
      }));
      router.get('/entities', only, r(function () { return ha(ctx).catalog(); }));
      router.post('/favorites', only, r(function (req) { ha(ctx).setFavorites((req.body || {}).list); return ctx.controlInfo(); }));
    }
  }
};
