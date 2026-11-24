const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const paths = require('./paths');
const plugins = require('./plugins');
const log = require('./log');

const DEFAULT_INDEX = 'https://raw.githubusercontent.com/StefanoDiPatti/vibe-deck-plugins/main/index.json';
const SITE = 'https://stefanodipatti.github.io/vibe-deck/';
const INDEX_TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 15000;
const MAX_INDEX_BYTES = 2 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 1024 * 1024;
const MAX_FILES = 200;
const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const ALLOWED_FILE = /^(plugin\.json|home\.json|(widgets|pages|lang)\/[a-z0-9][a-z0-9_.-]*\.json)$/;

function fail(message, code) { return Object.assign(new Error(message), { code: code || 'BAD_REQUEST' }); }

function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }

function indexUrl() {
  let url = '';
  try { url = ((require('./config').get('services') || {}).market || {}).index || ''; } catch (e) { url = ''; }
  return process.env.DOCK_MARKET_INDEX || url || DEFAULT_INDEX;
}

async function download(url, maxBytes) {
  if (!/^https?:\/\//i.test(String(url))) throw fail('Indirizzo del market non valido: ' + url);
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json', 'User-Agent': 'VibeDeck/' + require('../package.json').version + ' (+https://github.com/StefanoDiPatti/vibe-deck)' } });
    if (!res.ok) throw fail('Il market ha risposto ' + res.status, 'UNAVAILABLE');
    const text = await res.text();
    if (text.length > maxBytes) throw fail('File del market troppo grande', 'UNAVAILABLE');
    return text;
  } catch (e) {
    if (e.name === 'AbortError') throw fail('Il market non risponde', 'UNAVAILABLE');
    if (e.code) throw e;
    throw fail('Market non raggiungibile (sei collegato a internet?)', 'UNAVAILABLE');
  } finally {
    clearTimeout(timer);
  }
}

function resolveUrl(base, rel) {
  try { return new URL(rel, base).toString(); } catch (e) { return ''; }
}

class Installed {
  file() { return path.join(paths.DATA_DIR, 'market.json'); }
  read() {
    try {
      const d = JSON.parse(fs.readFileSync(this.file(), 'utf8'));
      return d && typeof d === 'object' && d.plugins && typeof d.plugins === 'object' ? d : { plugins: {} };
    } catch (e) { return { plugins: {} }; }
  }
  write(d) {
    fs.mkdirSync(path.dirname(this.file()), { recursive: true });
    fs.writeFileSync(this.file(), JSON.stringify(d, null, 2) + '\n');
  }
  get(id) { return this.read().plugins[id] || null; }
  set(id, info) { const d = this.read(); d.plugins[id] = info; this.write(d); }
  remove(id) { const d = this.read(); delete d.plugins[id]; this.write(d); }
}

class PackageChecker {
  constructor(entry) { this.entry = entry; }

  check(text) {
    const e = this.entry;
    if (sha256(text) !== e.sha256) throw fail('Il pacchetto di "' + e.id + '" non corrisponde all\'impronta del market: non lo installo');
    let pkg;
    try { pkg = JSON.parse(text); } catch (err) { throw fail('Pacchetto non valido (JSON)'); }
    if (!pkg || pkg.format !== 1 || !pkg.files || typeof pkg.files !== 'object' || Array.isArray(pkg.files)) throw fail('Formato del pacchetto sconosciuto');
    const names = Object.keys(pkg.files);
    if (!names.length || names.length > MAX_FILES) throw fail('Pacchetto vuoto o con troppi file');
    names.forEach(function (n) {
      if (!ALLOWED_FILE.test(n)) throw fail('File non ammesso nel market: ' + n + ' (solo plugin.json, widgets/, pages/, lang/, home.json)');
      if (!pkg.files[n] || typeof pkg.files[n] !== 'object') throw fail('File non valido: ' + n);
    });
    const manifest = pkg.files['plugin.json'];
    if (!manifest) throw fail('Manca plugin.json nel pacchetto');
    if (manifest.id !== e.id) throw fail('Il pacchetto è di "' + manifest.id + '", non di "' + e.id + '"');
    if (manifest.version !== e.version) throw fail('Versione del pacchetto diversa da quella del market');
    if (manifest.type === 'pack') throw fail('I pacchetti di plugin non si installano dal market');
    return pkg;
  }
}

class Market {
  constructor() {
    this.installed = new Installed();
    this.cache = { at: 0, url: '', data: null };
  }

  root() { return plugins.baseDir(); }

  async index(force) {
    const url = indexUrl();
    if (!force && this.cache.data && this.cache.url === url && Date.now() - this.cache.at < INDEX_TTL_MS) return this.cache.data;
    const text = await download(url, MAX_INDEX_BYTES);
    let data;
    try { data = JSON.parse(text); } catch (e) { throw fail('Indice del market non valido', 'UNAVAILABLE'); }
    const list = Array.isArray(data && data.plugins) ? data.plugins : [];
    const clean = list.filter(function (p) {
      return p && p.type !== 'pack' && NAME_RE.test(p.id) && VERSION_RE.test(p.version || '') && /^[a-f0-9]{64}$/.test(p.sha256 || '') && typeof p.url === 'string';
    }).map(function (p) { return Object.assign({}, p, { url: resolveUrl(url, p.url) }); });
    const ids = clean.map(function (p) { return p.id; });
    const packs = (Array.isArray(data && data.packs) ? data.packs : []).filter(function (p) {
      return p && NAME_RE.test(p.id) && ids.indexOf(p.id) < 0 && Array.isArray(p.includes) && p.includes.length && p.includes.every(function (n) { return ids.indexOf(n) >= 0; });
    }).map(function (p) { return Object.assign({}, p, { type: 'pack', includes: p.includes.slice() }); });
    this.cache = { at: Date.now(), url: url, data: { url: url, updated: data.updated || '', plugins: clean, packs: packs } };
    return this.cache.data;
  }

  officialIds() {
    return plugins.manifests().filter(function (m) { return m.official; }).map(function (m) { return m.id; });
  }

  localManifest(id) {
    try { return JSON.parse(fs.readFileSync(path.join(this.root(), id, 'plugin.json'), 'utf8')); } catch (e) { return null; }
  }

  stateOf(p, official, app) {
    const mine = this.installed.get(p.id);
    const local = this.localManifest(p.id);
    let state = 'available';
    if (official.indexOf(p.id) >= 0) state = 'official';
    else if (mine) state = plugins.versionAtLeast(mine.version, p.version) ? 'installed' : 'update';
    else if (local) state = 'local';
    const tooNew = p.engine && !plugins.versionAtLeast(app, String(p.engine).replace(/^>=\s*/, ''));
    return Object.assign({}, p, { state: state, installedVersion: mine ? mine.version : '', compatible: !tooNew });
  }

  async list(force) {
    const idx = await this.index(force);
    const official = this.officialIds();
    const app = require('../package.json').version;
    const self = this;
    const all = idx.plugins.map(function (p) { return self.stateOf(p, official, app); });
    return {
      url: idx.url,
      site: SITE,
      updated: idx.updated,
      plugins: all,
      packs: idx.packs.map(function (k) { return self.packState(k, all); })
    };
  }

  packState(pack, all) {
    const items = pack.includes.map(function (n) { return all.filter(function (p) { return p.id === n; })[0]; }).filter(Boolean);
    const todo = items.filter(function (p) { return p.state === 'available' || p.state === 'update'; });
    const state = !todo.length ? 'installed' : todo.length === items.length ? 'available' : 'partial';
    return Object.assign({}, pack, { state: state, plugins: items, compatible: items.every(function (p) { return p.compatible; }) });
  }

  async entry(id) {
    if (!NAME_RE.test(String(id || ''))) throw fail('Nome non valido');
    const all = await this.list(true);
    const pack = all.packs.filter(function (p) { return p.id === id; })[0];
    if (pack) return pack;
    const one = all.plugins.filter(function (p) { return p.id === id; })[0];
    if (!one) throw fail('"' + id + '" non è nel market', 'NOT_FOUND');
    return one;
  }

  async installAny(id) {
    const idx = await this.index(true);
    const pack = idx.packs.filter(function (p) { return p.id === id; })[0];
    if (!pack) return this.install(id);
    const done = [];
    for (const n of pack.includes) {
      const mine = this.installed.get(n);
      const entry = idx.plugins.filter(function (p) { return p.id === n; })[0];
      if (mine && plugins.versionAtLeast(mine.version, entry.version)) continue;
      done.push(await this.install(n));
    }
    log.info('market', 'pack ' + id + ': ' + (done.map(function (d) { return d.id; }).join(', ') || 'già tutto installato'));
    return { id: id, pack: true, installed: done };
  }

  installedList() {
    const d = this.installed.read().plugins;
    const self = this;
    return Object.keys(d).sort().map(function (id) {
      const m = self.localManifest(id) || {};
      let widgets = 0;
      try { widgets = fs.readdirSync(path.join(self.root(), id, 'widgets')).filter(function (f) { return /\.json$/.test(f); }).length; } catch (e) { widgets = 0; }
      return { id: id, name: m.name || id, description: m.description || '', author: m.author || '', version: d[id].version, widgets: widgets, permissions: m.permissions || {} };
    });
  }

  async install(id) {
    if (!NAME_RE.test(String(id || ''))) throw fail('Nome del plugin non valido');
    const idx = await this.index(true);
    const entry = idx.plugins.filter(function (p) { return p.id === id; })[0];
    if (!entry) throw fail('Plugin "' + id + '" non trovato nel market', 'NOT_FOUND');
    if (this.officialIds().indexOf(id) >= 0) throw fail('"' + id + '" è già un plugin ufficiale della dock');
    if (!this.installed.get(id) && this.localManifest(id)) throw fail('Hai già un tuo plugin "' + id + '": rinominalo o toglilo prima');
    const app = require('../package.json').version;
    if (entry.engine && !plugins.versionAtLeast(app, String(entry.engine).replace(/^>=\s*/, ''))) {
      throw fail('Serve Vibe Deck ' + entry.engine + ' o successiva (hai la ' + app + ')');
    }
    const text = await download(entry.url, MAX_PACKAGE_BYTES);
    const pkg = new PackageChecker(entry).check(text);
    this.write(id, pkg);
    this.installed.set(id, { version: entry.version, sha256: entry.sha256, installedAt: new Date().toISOString() });
    log.info('market', id + ' ' + entry.version + ' installato');
    return { id: id, version: entry.version, files: Object.keys(pkg.files).length, permissions: (pkg.files['plugin.json'].permissions || {}) };
  }

  write(id, pkg) {
    const root = this.root();
    const dest = path.join(root, id);
    const tmp = path.join(root, '.' + id + '-' + crypto.randomBytes(4).toString('hex'));
    fs.mkdirSync(tmp, { recursive: true });
    try {
      Object.keys(pkg.files).forEach(function (n) {
        const file = path.join(tmp, n);
        if (path.relative(tmp, file).startsWith('..')) throw fail('Percorso non ammesso: ' + n);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(pkg.files[n], null, 2) + '\n');
      });
      if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
      fs.renameSync(tmp, dest);
    } catch (e) {
      fs.rmSync(tmp, { recursive: true, force: true });
      throw e;
    }
  }

  remove(id) {
    if (!NAME_RE.test(String(id || ''))) throw fail('Nome del plugin non valido');
    if (!this.installed.get(id)) throw fail('"' + id + '" non è stato installato dal market: non lo tolgo', 'NOT_FOUND');
    fs.rmSync(path.join(this.root(), id), { recursive: true, force: true });
    this.installed.remove(id);
    log.info('market', id + ' tolto');
    return { id: id };
  }
}

const market = new Market();

function bundle(dir) {
  const files = {};
  (function walk(rel) {
    fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).forEach(function (d) {
      const r = rel ? rel + '/' + d.name : d.name;
      if (d.isDirectory()) walk(r);
      else if (ALLOWED_FILE.test(r)) files[r] = require('./config').parseJson(fs.readFileSync(path.join(dir, r), 'utf8'));
    });
  })('');
  return { format: 1, files: files };
}

module.exports = { market: market, Market: Market, PackageChecker: PackageChecker, bundle: bundle, sha256: sha256, ALLOWED_FILE: ALLOWED_FILE, DEFAULT_INDEX: DEFAULT_INDEX, SITE: SITE };
