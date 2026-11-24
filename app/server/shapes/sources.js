const fs = require('fs');
const path = require('path');
const Registry = require('./registry');

const sources = new Registry('source');
const HTTP_TIMEOUT_MS = 8000;
const HTTP_MAX_BYTES = 512 * 1024;
const FILE_MAX_BYTES = 1024 * 1024;

function fail(message, code) { return Object.assign(new Error(message), { code: code || 'UNAVAILABLE' }); }

function parseText(text) {
  const trimmed = String(text || '').trim();
  if (/^[[{]/.test(trimmed)) {
    try { return JSON.parse(trimmed); } catch (e) { }
  }
  const lines = trimmed ? trimmed.split(/\r?\n/) : [];
  return { text: trimmed, lines: lines };
}

class Source {
  constructor(name, minEvery) {
    this.name = name;
    this.minEvery = minEvery;
  }
  validate() { return []; }
  async read() { return {}; }
  every(def) {
    const want = parseInt(def.every, 10);
    return Math.max(this.minEvery, isNaN(want) ? 5 : want);
  }
}

class StaticSource extends Source {
  constructor() { super('static', 60); }
  validate(src) {
    return src.data !== undefined && (typeof src.data !== 'object' || src.data === null) ? ['"source.data" deve essere un oggetto o una lista'] : [];
  }
  async read(src) { return src.data === undefined ? {} : src.data; }
}

class PcSource extends Source {
  constructor() { super('pc', 2); }
  async read() {
    const system = require('../services/system').get() || {};
    let apps = {};
    try { apps = await require('../services/apps').running(); } catch (e) { apps = {}; }
    return Object.assign({}, system, { apps: apps || {} });
  }
}

function hostOf(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.host.toLowerCase() : '';
  } catch (e) { return ''; }
}

function allowedHosts(ctx) {
  const list = ctx && ctx.permissions && ctx.permissions.http;
  return Array.isArray(list) ? list.map(function (h) { return String(h).toLowerCase(); }) : [];
}

class HttpSource extends Source {
  constructor() { super('http', 30); }
  validate(src, ctx) {
    const host = hostOf(src.url);
    if (!host) return ['"source.url" deve essere un indirizzo http:// o https://'];
    if (allowedHosts(ctx).indexOf(host) < 0) return ['il sito "' + host + '" non è in "permissions.http" del plugin.json'];
    return [];
  }
  async read(src, def, ctx) {
    const host = hostOf(src.url);
    if (!host || allowedHosts(ctx).indexOf(host) < 0) throw fail('Sito non consentito: ' + (host || src.url), 'BAD_CONFIG');
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, HTTP_TIMEOUT_MS);
    try {
      const res = await fetch(src.url, { signal: ctrl.signal, redirect: 'error', headers: { Accept: 'application/json, text/plain' } });
      if (!res.ok) throw fail(host + ' ha risposto ' + res.status);
      const declared = parseInt(res.headers.get('content-length'), 10);
      if (declared > HTTP_MAX_BYTES) throw fail(host + ': risposta troppo grande');
      const text = await res.text();
      if (text.length > HTTP_MAX_BYTES) throw fail(host + ': risposta troppo grande');
      return parseText(text);
    } catch (e) {
      if (e.name === 'AbortError') throw fail(host + ' non risponde');
      if (e.code) throw e;
      throw fail(host + ' non raggiungibile');
    } finally {
      clearTimeout(timer);
    }
  }
}

function dataPath(rel) {
  const root = path.resolve(require('../paths').DATA_DIR);
  const full = path.resolve(root, String(rel || ''));
  return full.indexOf(root + path.sep) === 0 ? full : null;
}

class FileSource extends Source {
  constructor() { super('file', 2); }
  validate(src) {
    if (typeof src.path !== 'string' || !src.path) return ['"source.path" mancante (un file dentro data/)'];
    return path.isAbsolute(src.path) || !dataPath(src.path) ? ['"source.path" deve stare dentro data/ (es. "miei/stato.json")'] : [];
  }
  async read(src) {
    const full = dataPath(src.path);
    if (!full) throw fail('Percorso fuori da data/', 'BAD_CONFIG');
    let stat;
    try { stat = fs.statSync(full); } catch (e) { throw fail('File non trovato: data/' + src.path, 'NOT_FOUND'); }
    if (stat.size > FILE_MAX_BYTES) throw fail('File troppo grande: data/' + src.path);
    return parseText(fs.readFileSync(full, 'utf8'));
  }
}

class CommandSource extends Source {
  constructor() { super('command', 10); }
  validate(src) { return typeof src.id === 'string' && src.id ? [] : ['"source.id" deve essere un comando di commands.json']; }
  async read(src) { return parseText(await require('../actions').capture(src.id)); }
}

class PluginSourceAdapter extends Source {
  constructor(name, plugin, impl) {
    super(name, Math.max(1, parseInt(impl.every, 10) || 2));
    this.plugin = plugin;
    this.impl = impl;
  }
  async read(src) {
    return this.impl.read(src, require('../plugins').context(this.plugin));
  }
}

[new StaticSource(), new PcSource(), new HttpSource(), new FileSource(), new CommandSource()]
  .forEach(function (s) { sources.register(s.name, s); });

function resolve(type) {
  const builtin = sources.get(type);
  if (builtin) return builtin;
  const m = /^([a-z0-9][a-z0-9_-]*)\.([A-Za-z0-9_-]+)$/.exec(String(type || ''));
  if (!m) return null;
  const loaded = require('../plugins').load()[m[1]];
  const impl = loaded && loaded.module && loaded.module.sources && loaded.module.sources[m[2]];
  if (!impl || typeof impl.read !== 'function') return null;
  return new PluginSourceAdapter(type, m[1], impl);
}

class SourceCache {
  constructor() { this.entries = new Map(); }

  read(key, source, def, ctx) {
    const now = Date.now();
    const hit = this.entries.get(key);
    const ttl = source.every(def) * 1000;
    if (hit && hit.pending) return hit.pending;
    if (hit && now - hit.at < ttl) return Promise.resolve(hit.data);
    const pending = Promise.resolve().then(function () { return source.read(def.source, def, ctx); });
    this.entries.set(key, { at: hit ? hit.at : 0, data: hit ? hit.data : null, pending: pending });
    const self = this;
    return pending.then(function (data) {
      self.entries.set(key, { at: Date.now(), data: data, pending: null });
      return data;
    }, function (e) {
      self.entries.delete(key);
      throw e;
    });
  }

  forget(key) { this.entries.delete(key); }

  clear() { this.entries.clear(); }
}

module.exports = { sources: sources, resolve: resolve, Source: Source, SourceCache: SourceCache, parseText: parseText, dataPath: dataPath };
