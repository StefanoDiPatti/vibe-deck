const fs = require('fs');
const path = require('path');
const plugins = require('../plugins');
const template = require('./template');
const { shapes } = require('./shapes');
const { sources, SourceCache } = require('./sources');

const FILE_RE = /^[a-z0-9][a-z0-9_-]*$/;
const PLATFORMS = ['windows', 'linux'];
function currentPlatform() { return process.platform === 'win32' ? 'windows' : 'linux'; }
const MAX_VOICE_TEXT = 500;
const ICONS = { value: 'cpu', bars: 'cpu', status: 'target', text: 'info', buttons: 'apps', voice: 'mic' };
const cache = new SourceCache();
const runner = { execute: function (action) { return require('../actions').execute(action); } };

function fail(message, code) { return Object.assign(new Error(message), { code: code }); }
function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function clamp(v, min, max, def) {
  const n = parseInt(v, 10);
  return isNaN(n) ? def : Math.max(min, Math.min(max, n));
}

function sourceOf(def) { return isObject(def.source) ? def.source : { type: 'static' }; }

function validate(def, id) {
  if (!isObject(def)) return ['il widget deve essere un oggetto JSON'];
  const problems = [];
  if (!FILE_RE.test(id)) problems.push('nome del file non valido: usa minuscole, numeri, - e _');
  if (def.id !== undefined && def.id !== id) problems.push('"id" deve essere "' + id + '", come il nome del file');
  if (typeof def.name !== 'string' || !def.name.trim()) problems.push('"name" mancante');
  if (def.source !== undefined && !isObject(def.source)) problems.push('"source" deve essere un oggetto');
  const shape = shapes.get(def.shape);
  if (!shape) problems.push('forma sconosciuta "' + def.shape + '" (valide: ' + shapes.names().join(', ') + ')');
  const src = sourceOf(def);
  const source = sources.get(src.type);
  if (!source) problems.push('fonte sconosciuta "' + src.type + '" (valide: ' + sources.names().join(', ') + ')');
  else problems.push.apply(problems, source.validate(src));
  if (def.size !== undefined && !isObject(def.size)) problems.push('"size" deve essere un oggetto { "w", "h", "minW", "minH" }');
  if (def.platforms !== undefined && (!Array.isArray(def.platforms) || !def.platforms.length || def.platforms.some(function (p) { return PLATFORMS.indexOf(p) < 0; }))) {
    problems.push('"platforms" deve elencare "windows" e/o "linux"');
  }
  if (shape) problems.push.apply(problems, shape.validate(def));
  return problems;
}

function readOne(plugin, dir, file) {
  const id = file.replace(/\.json$/i, '');
  const entry = { plugin: plugin, id: id, key: plugin + '/' + id, file: path.join(dir, file), def: null, problems: [] };
  let def;
  try { def = require('../config').parseJson(fs.readFileSync(entry.file, 'utf8')); } catch (e) {
    entry.problems.push('JSON non valido: ' + e.message);
    return entry;
  }
  entry.problems = validate(def, id);
  if (!entry.problems.length) entry.def = Object.assign({}, def, { id: id, source: sourceOf(def) });
  return entry;
}

function all() {
  return plugins.remembered('shapes', function () {
    const out = [];
    plugins.names().forEach(function (plugin) {
      const dir = path.join(plugins.dirOf(plugin), 'widgets');
      let files = [];
      try { files = fs.readdirSync(dir).filter(function (f) { return /\.json$/i.test(f); }).sort(); } catch (e) { files = []; }
      files.forEach(function (f) { out.push(readOne(plugin, dir, f)); });
    });
    return out.filter(function (e) { return !e.def || !e.def.platforms || e.def.platforms.indexOf(currentPlatform()) >= 0; });
  });
}

function find(plugin, id) {
  const e = all().filter(function (x) { return x.plugin === plugin && x.id === id; })[0];
  if (!e) throw fail('Widget "' + plugin + '/' + id + '" non trovato (plugin tolto?)', 'NOT_FOUND');
  if (!e.def) throw fail('Widget "' + plugin + '/' + id + '" non valido: ' + e.problems[0], 'BAD_CONFIG');
  return e;
}

function readData(e) {
  return cache.read(e.key, sources.get(e.def.source.type), e.def);
}

async function view(plugin, id) {
  const e = find(plugin, id);
  const def = e.def;
  const source = sources.get(def.source.type);
  const extra = { every: source.every(def) };
  if (def.shape === 'voice') extra.voiceServer = require('../services/voice').available();
  let data;
  try { data = await readData(e); } catch (err) {
    return Object.assign({ shape: def.shape, label: def.name, icon: def.icon || '', error: err.message || 'Dati non disponibili' }, extra);
  }
  return Object.assign(shapes.get(def.shape).view(def, data), extra);
}

async function tap(plugin, id, index) {
  const e = find(plugin, id);
  const action = shapes.get(e.def.shape).action(e.def, parseInt(index, 10) || 0);
  if (!action) throw fail('Questo widget non ha un\'azione', 'BAD_CONFIG');
  let data = {};
  try { data = await readData(e); } catch (err) { data = {}; }
  return runner.execute(template.deep(action, data));
}

async function voice(plugin, id, said) {
  const e = find(plugin, id);
  if (e.def.shape !== 'voice') throw fail('Questo widget non accetta comandi vocali', 'BAD_REQUEST');
  const text = String(said || '').trim();
  if (!text) throw fail('Non ho sentito niente', 'BAD_REQUEST');
  if (text.length > MAX_VOICE_TEXT) throw fail('Testo troppo lungo', 'BAD_REQUEST');
  const hit = shapes.get('voice').resolve(e.def, text);
  if (!hit) throw fail('Comando non riconosciuto: "' + text + '"', 'BAD_REQUEST');
  const result = await runner.execute(hit.action);
  return Object.assign({}, result, { heard: text, message: hit.reply || (result && result.message) || 'Fatto' });
}

function catalog() {
  return all().filter(function (e) { return e.def; }).map(function (e) {
    const def = e.def, size = def.size || {};
    const minW = clamp(size.minW, 1, 8, 1), minH = clamp(size.minH, 1, 6, 1);
    return {
      id: e.plugin + '.' + e.id,
      widget: 'shape',
      plugin: e.plugin,
      page: 'PLUGIN ' + e.plugin.toUpperCase(),
      label: def.name,
      icon: def.icon || ICONS[def.shape] || 'apps',
      description: typeof def.description === 'string' ? def.description : 'Widget del plugin ' + e.plugin,
      w: Math.max(minW, clamp(size.w, 1, 8, 2)),
      h: Math.max(minH, clamp(size.h, 1, 6, 1)),
      minW: minW,
      minH: minH,
      props: { def: e.key }
    };
  });
}

function actionsOf(def) {
  const out = [];
  if (def.tap) out.push({ where: 'tocco', action: def.tap });
  (def.buttons || []).forEach(function (b, i) { out.push({ where: 'pulsante ' + (i + 1), action: b.action }); });
  const v = def.voice || {};
  (v.commands || []).forEach(function (c, i) { out.push({ where: 'comando vocale ' + (i + 1), action: c.action }); });
  if (v.action) out.push({ where: 'voce', action: v.action });
  return out;
}

function report() {
  return all().map(function (e) {
    return { where: 'plugin ' + e.plugin + ' › widgets/' + e.id + '.json', problems: e.problems, actions: e.def ? actionsOf(e.def) : [] };
  });
}

function keys() { return all().filter(function (e) { return e.def; }).map(function (e) { return e.key; }); }

module.exports = { all: all, view: view, tap: tap, voice: voice, catalog: catalog, report: report, keys: keys, validate: validate, cache: cache, runner: runner };
