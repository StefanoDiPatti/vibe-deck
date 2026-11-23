const common = require('./common');

function pct(volume) {
  const ch = volume && typeof volume === 'object' ? Object.keys(volume).map(function (k) { return volume[k]; }) : [];
  if (!ch.length) return null;
  const vals = ch.map(function (c) { return parseInt(String(c.value_percent || '').replace('%', ''), 10); }).filter(function (n) { return !isNaN(n); });
  return vals.length ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : null;
}

function parse(sinks, sources, inputs, defSink, defSource) {
  const devices = [];
  (sinks || []).forEach(function (s) {
    devices.push({ flow: 'out', id: s.name, name: s.description || s.name, default: s.name === defSink, volume: pct(s.volume), mute: !!s.mute });
  });
  (sources || []).forEach(function (s) {
    if (/\.monitor$/.test(s.name || '')) return;
    devices.push({ flow: 'in', id: s.name, name: s.description || s.name, default: s.name === defSource, volume: pct(s.volume), mute: !!s.mute });
  });
  const byIndex = {};
  (sinks || []).forEach(function (s) { byIndex[s.index] = s.description || s.name; });
  const apps = (inputs || []).map(function (i) {
    const p = i.properties || {};
    return {
      id: String(i.index),
      pid: Number(p['application.process.id']) || 0,
      process: String(p['application.process.binary'] || '').toLowerCase(),
      name: p['application.name'] || p['media.name'] || p['application.process.binary'] || 'App',
      volume: pct(i.volume),
      mute: !!i.mute,
      active: !i.corked,
      device: byIndex[i.sink] || ''
    };
  });
  return { devices: devices, apps: apps };
}

async function pactl(args) {
  const r = await common.run('pactl', args, { timeout: 6000 });
  if (!r.ok) throw new Error('pactl: ' + (r.stderr.trim() || r.error));
  return r.stdout;
}
async function json(what) {
  const out = await pactl(['-f', 'json', 'list', what]);
  try { return JSON.parse(out); } catch (e) { throw new Error('pactl troppo vecchio: serve la versione 15 o successiva'); }
}

async function mixer() {
  if (!common.which('pactl')) throw new Error('Installa pactl (pulseaudio-utils) per il mixer');
  const all = await Promise.all([json('sinks'), json('sources'), json('sink-inputs'),
    pactl(['get-default-sink']).catch(function () { return ''; }), pactl(['get-default-source']).catch(function () { return ''; })]);
  return parse(all[0], all[1], all[2], all[3].trim(), all[4].trim());
}

async function setDefaultDevice(id) {
  const m = await mixer();
  const dev = m.devices.filter(function (d) { return d.id === id; })[0];
  if (!dev) throw new Error('Dispositivo non trovato');
  await pactl([dev.flow === 'out' ? 'set-default-sink' : 'set-default-source', id]);
  if (dev.flow === 'out') {
    const inputs = await json('sink-inputs').catch(function () { return []; });
    for (const i of inputs) await pactl(['move-sink-input', String(i.index), id]).catch(function () {});
  }
  return { done: true };
}

function muteArg(m) { return m === 'toggle' ? 'toggle' : m === true ? '1' : m === false ? '0' : null; }

async function setDeviceVolume(id, volume, mute) {
  const m = await mixer();
  const dev = m.devices.filter(function (d) { return d.id === id; })[0];
  if (!dev) throw new Error('Dispositivo non trovato');
  const kind = dev.flow === 'out' ? 'sink' : 'source';
  if (volume !== null && volume !== undefined) await pactl(['set-' + kind + '-volume', id, Math.max(0, Math.min(100, Math.round(volume))) + '%']);
  if (muteArg(mute)) await pactl(['set-' + kind + '-mute', id, muteArg(mute)]);
  return { done: true };
}

async function setAppVolume(id, volume, mute) {
  if (!/^\d+$/.test(String(id))) throw new Error('App non valida');
  if (volume !== null && volume !== undefined) await pactl(['set-sink-input-volume', String(id), Math.max(0, Math.min(100, Math.round(volume))) + '%']);
  if (muteArg(mute)) await pactl(['set-sink-input-mute', String(id), muteArg(mute)]);
  return { done: 1 };
}

module.exports = { mixer: mixer, setDefaultDevice: setDefaultDevice, setDeviceVolume: setDeviceVolume, setAppVolume: setAppVolume, _parse: parse };
