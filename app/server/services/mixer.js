const platform = require('../platform');

let cache = { at: 0, data: null, pending: null };

function supported() { return typeof platform.mixer === 'function'; }
function fail(msg, code) { return Object.assign(new Error(msg), { code: code || 'BAD_REQUEST' }); }

function state(force) {
  if (!supported()) return Promise.reject(fail('Mixer non disponibile su questo sistema', 'UNSUPPORTED'));
  if (!force && cache.data && Date.now() - cache.at < 800) return Promise.resolve(cache.data);
  if (cache.pending) return cache.pending;
  cache.pending = platform.mixer().then(function (m) {
    m.apps.sort(function (a, b) { return (b.active - a.active) || String(a.name).localeCompare(String(b.name)); });
    cache = { at: Date.now(), data: m, pending: null };
    return m;
  }).catch(function (e) { cache.pending = null; throw e; });
  return cache.pending;
}

async function target(list, id, body) {
  const cur = list.filter(function (x) { return x.id === String(id); })[0];
  if (!cur) throw fail('Non trovato (aggiorna la pagina)', 'NOT_FOUND');
  let volume = null;
  if (typeof body.volume === 'number' && isFinite(body.volume)) volume = Math.max(0, Math.min(100, Math.round(body.volume)));
  else if (typeof body.delta === 'number' && isFinite(body.delta) && cur.volume !== null) volume = Math.max(0, Math.min(100, cur.volume + Math.round(body.delta)));
  const mute = body.mute === 'toggle' || body.mute === true || body.mute === false ? body.mute : null;
  if (volume === null && mute === null) throw fail('Niente da cambiare');
  return { cur: cur, volume: volume, mute: mute };
}

async function setDefault(id) {
  const m = await state(true);
  if (!m.devices.some(function (d) { return d.id === String(id); })) throw fail('Dispositivo non trovato', 'NOT_FOUND');
  await platform.setDefaultDevice(String(id));
  return state(true);
}

async function device(id, body) {
  const m = await state(true);
  const t = await target(m.devices, id, body || {});
  await platform.setDeviceVolume(t.cur.id, t.volume, t.mute);
  return state(true);
}

async function app(id, body) {
  const m = await state(true);
  const t = await target(m.apps, id, body || {});
  await platform.setAppVolume(t.cur.id, t.volume, t.mute);
  return state(true);
}

module.exports = { state: state, setDefault: setDefault, device: device, app: app, supported: supported };
