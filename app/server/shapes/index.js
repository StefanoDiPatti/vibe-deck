const fs = require('fs');
const path = require('path');
const plugins = require('../plugins');
const template = require('./template');
const { shapes } = require('./shapes');
const { sources, resolve, SourceCache } = require('./sources');

const FILE_RE = /^[a-z0-9][a-z0-9_-]*$/;
const PLATFORMS = ['windows', 'linux'];
const MAX_VOICE_TEXT = 500;
const ICONS = { value: 'cpu', bars: 'cpu', status: 'target', text: 'info', buttons: 'apps', voice: 'mic', list: 'layout', slider: 'volup' };
const cache = new SourceCache();
const runner = { execute: function (action) { return require('../actions').execute(action); } };

function currentPlatform() { return process.platform === 'win32' ? 'windows' : 'linux'; }
function fail(message, code) { return Object.assign(new Error(message), { code: code }); }
function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function clamp(v, min, max, def) {
  const n = parseInt(v, 10);
  return isNaN(n) ? def : Math.max(min, Math.min(max, n));
}

function sourceOf(def) { return isObject(def.source) ? def.source : { type: 'static' }; }

function pluginContext(plugin) {
  const m = plugins.manifests().filter(function (x) { return x.id === plugin; })[0];
  return { plugin: plugin, permissions: (m && m.permissions) || {} };
}

function sourceProblems(src, ctx) {
  const source = resolve(src.type);
  if (!source) {
    return ['fonte sconosciuta "' + src.type + '" (valide: ' + sources.names().join(', ') + ', oppure "<plugin>.<fonte>" di un plugin con codice)'];
  }
  const owner = String(src.type).split('.');
  if (owner.length === 2 && ctx && owner[0] !== ctx.plugin) {
    return ['la fonte "' + src.type + '" è di un altro plugin: un plugin deve funzionare da solo'];
  }
  return source.validate(src, ctx);
}

function validate(def, id, ctx) {
  if (!isObject(def)) return ['il widget deve essere un oggetto JSON'];
  const problems = [];
  if (!FILE_RE.test(id)) problems.push('nome del file non valido: usa minuscole, numeri, - e _');
  if (def.id !== undefined && def.id !== id) problems.push('"id" deve essere "' + id + '", come il nome del file');
  if (typeof def.name !== 'string' || !def.name.trim()) problems.push('"name" mancante');
  if (def.source !== undefined && !isObject(def.source)) problems.push('"source" deve essere un oggetto');
  const shape = shapes.get(def.shape);
  if (!shape) problems.push('forma sconosciuta "' + def.shape + '" (valide: ' + shapes.names().join(', ') + ')');
  problems.push.apply(problems, sourceProblems(sourceOf(def), ctx));
  if (def.size !== undefined && !isObject(def.size)) problems.push('"size" deve essere un oggetto { "w", "h", "minW", "minH" }');
  if (def.platforms !== undefined && (!Array.isArray(def.platforms) || !def.platforms.length || def.platforms.some(function (p) { return PLATFORMS.indexOf(p) < 0; }))) {
    problems.push('"platforms" deve elencare "windows" e/o "linux"');
  }
  if (shape) problems.push.apply(problems, shape.validate(def));
  return problems;
}

function readOne(plugin, dir, file) {
  const id = file.replace(/\.json$/i, '');
  const ctx = pluginContext(plugin);
  const entry = { plugin: plugin, id: id, key: plugin + '/' + id, file: path.join(dir, file), def: null, ctx: ctx, problems: [] };
  let def;
  try { def = require('../config').parseJson(fs.readFileSync(entry.file, 'utf8')); } catch (e) {
    entry.problems.push('JSON non valido: ' + e.message);
    return entry;
  }
  entry.problems = validate(def, id, ctx);
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
  return cache.read(e.key, resolve(e.def.source.type), e.def, e.ctx);
}

async function safeData(e) {
  try { return await readData(e); } catch (err) { return {}; }
}

async function run(e, action, scope) {
  if (!action) throw fail('Questo widget non ha un\'azione', 'BAD_CONFIG');
  return runner.execute(template.deep(action, scope, { maps: e.def.maps || {} }));
}

async function view(plugin, id) {
  const e = find(plugin, id);
  const def = e.def;
  const extra = { every: resolve(def.source.type).every(def) };
  if (def.shape === 'voice') extra.voiceServer = require('../services/voice').available();
  let data;
  try { data = await readData(e); } catch (err) {
    return Object.assign({ shape: def.shape, label: def.name, icon: def.icon || '', error: err.message || 'Dati non disponibili' }, extra);
  }
  return Object.assign(shapes.get(def.shape).view(def, data), extra);
}

async function tap(plugin, id, index) {
  const e = find(plugin, id);
  const shape = shapes.get(e.def.shape);
  const i = Math.max(0, parseInt(index, 10) || 0);
  const scope = shape.scope(e.def, await safeData(e), i);
  if (e.def.shape === 'list' && (!scope || scope.item === undefined)) throw fail('Riga non trovata (la lista è cambiata?)', 'CONFIG_CHANGED');
  return run(e, shape.action(e.def, i), scope);
}

async function set(plugin, id, value) {
  const e = find(plugin, id);
  if (e.def.shape !== 'slider') throw fail('Questo widget non è uno slider', 'BAD_REQUEST');
  const shape = shapes.get('slider');
  const v = shape.clamp(e.def, value);
  if (v === null) throw fail('Valore non valido', 'BAD_REQUEST');
  const result = await run(e, shape.action(e.def), shape.scope(e.def, await safeData(e), v));
  cache.forget(e.key);
  return Object.assign({}, result, { value: v });
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
      category: typeof def.category === 'string' ? def.category : '',
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
  if (def.set) out.push({ where: 'slider', action: def.set });
  (def.buttons || []).forEach(function (b, i) { out.push({ where: 'pulsante ' + (i + 1), action: b.action }); });
  const v = def.voice || {};
  (v.commands || []).forEach(function (c, i) { out.push({ where: 'comando vocale ' + (i + 1), action: c.action }); });
  if (v.action) out.push({ where: 'voce', action: v.action });
  if (def.source && def.source.type === 'command') out.push({ where: 'fonte', action: { type: 'command', id: def.source.id } });
  return out;
}

function report() {
  return all().map(function (e) {
    return { where: 'plugin ' + e.plugin + ' › widgets/' + e.id + '.json', problems: e.problems, actions: e.def ? actionsOf(e.def) : [] };
  });
}

function keys() { return all().filter(function (e) { return e.def; }).map(function (e) { return e.key; }); }

const PREVIEW_MAX = 4000;

function checkPlugin(plugin, src, opts) {
  const p = String(plugin || '');
  if (!FILE_RE.test(p)) throw fail('Nome del plugin non valido', 'BAD_REQUEST');
  const ctx = pluginContext(p);
  if (!(opts && opts.allowHost && isObject(src) && src.type === 'http')) return ctx;
  let host = '';
  try { const u = new URL(src.url); host = /^https?:$/.test(u.protocol) ? u.host.toLowerCase() : ''; } catch (e) { host = ''; }
  if (!host) return ctx;
  const http = (Array.isArray(ctx.permissions.http) ? ctx.permissions.http : []).concat([host]);
  return { plugin: ctx.plugin, permissions: Object.assign({}, ctx.permissions, { http: http }) };
}

async function sample(plugin, src, opts) {
  const ctx = checkPlugin(plugin, src, opts);
  if (!isObject(src) || typeof src.type !== 'string') throw fail('Manca la fonte da provare', 'BAD_REQUEST');
  const problems = sourceProblems(src, ctx);
  if (problems.length) throw fail(problems[0], 'BAD_REQUEST');
  const data = await resolve(src.type).read(src, { source: src }, ctx);
  const text = JSON.stringify(data === undefined ? null : data);
  return {
    fields: require('./fields').fieldsOf(data),
    preview: text.length > PREVIEW_MAX ? text.slice(0, PREVIEW_MAX) + '…' : text
  };
}

async function preview(plugin, def, id, opts) {
  const ctx = checkPlugin(plugin, def && def.source, opts);
  const name = FILE_RE.test(String(id || '')) ? String(id) : 'anteprima';
  const problems = validate(def, name, ctx);
  if (problems.length) return { problems: problems, view: null };
  const full = Object.assign({}, def, { id: name, source: sourceOf(def) });
  const source = resolve(full.source.type);
  let data;
  try { data = await source.read(full.source, full, ctx); } catch (err) {
    return { problems: [], view: { shape: full.shape, label: full.name, icon: full.icon || '', error: err.message || 'Dati non disponibili', every: source.every(full) } };
  }
  return { problems: [], view: Object.assign(shapes.get(full.shape).view(full, data), { every: source.every(full) }) };
}

module.exports = { all: all, view: view, tap: tap, set: set, voice: voice, sample: sample, preview: preview, catalog: catalog, report: report, keys: keys, validate: validate, cache: cache, runner: runner };
