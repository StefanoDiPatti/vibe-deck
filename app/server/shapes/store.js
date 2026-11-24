const fs = require('fs');
const path = require('path');
const plugins = require('../plugins');

const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;
const DEFAULT_PLUGIN = 'miei';
const MAX_BYTES = 64 * 1024;

function fail(message, code) { return Object.assign(new Error(message), { code: code || 'BAD_REQUEST' }); }

function hostOf(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.host.toLowerCase() : '';
  } catch (e) { return ''; }
}

class WidgetStore {
  constructor(root) { this.rootFn = root; }

  root() { return this.rootFn(); }

  dir(plugin) {
    if (!NAME_RE.test(String(plugin || ''))) throw fail('Nome del plugin non valido: minuscole, numeri, - e _');
    const official = plugins.manifests().some(function (m) { return m.id === plugin && m.official; });
    if (official) throw fail('I plugin ufficiali non si modificano dall\'editor: salva in un tuo plugin');
    return path.join(this.root(), plugin);
  }

  manifestFile(plugin) { return path.join(this.dir(plugin), 'plugin.json'); }

  readManifest(plugin) {
    try { return JSON.parse(fs.readFileSync(this.manifestFile(plugin), 'utf8')); } catch (e) { return null; }
  }

  ensurePlugin(plugin) {
    const dir = this.dir(plugin);
    fs.mkdirSync(path.join(dir, 'widgets'), { recursive: true });
    if (!this.readManifest(plugin)) {
      const manifest = {
        id: plugin,
        name: plugin === DEFAULT_PLUGIN ? 'I miei widget' : plugin,
        version: '1.0.0',
        author: '',
        description: 'Widget creati con l\'editor del pannello',
        type: 'plugin',
        engine: '>=2.2.0',
        permissions: { http: [] }
      };
      fs.writeFileSync(this.manifestFile(plugin), JSON.stringify(manifest, null, 2) + '\n');
    }
    return dir;
  }

  allowHost(plugin, host) {
    const m = this.readManifest(plugin) || {};
    const perms = m.permissions && typeof m.permissions === 'object' ? m.permissions : {};
    const list = Array.isArray(perms.http) ? perms.http : [];
    if (list.indexOf(host) >= 0) return false;
    perms.http = list.concat([host]);
    m.permissions = perms;
    fs.writeFileSync(this.manifestFile(plugin), JSON.stringify(m, null, 2) + '\n');
    return true;
  }

  list() {
    const root = this.root();
    let names = [];
    try { names = fs.readdirSync(root).filter(function (n) { return NAME_RE.test(n) && fs.statSync(path.join(root, n)).isDirectory(); }); } catch (e) { names = []; }
    const shapes = require('./index');
    const known = {};
    shapes.all().forEach(function (e) { known[e.key] = e; });
    const out = [];
    names.sort().forEach(function (plugin) {
      const dir = path.join(root, plugin, 'widgets');
      let files = [];
      try { files = fs.readdirSync(dir).filter(function (f) { return /\.json$/i.test(f); }).sort(); } catch (e) { files = []; }
      files.forEach(function (f) {
        const id = f.replace(/\.json$/i, '');
        let def = null;
        try { def = require('../config').parseJson(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { def = null; }
        const e = known[plugin + '/' + id];
        out.push({ plugin: plugin, id: id, key: plugin + '/' + id, def: def, problems: e ? e.problems : def ? [] : ['JSON non valido'], home: plugin + '.' + id });
      });
    });
    return out;
  }

  save(plugin, id, def, opts) {
    const p = String(plugin || DEFAULT_PLUGIN);
    const name = String(id || '');
    if (!NAME_RE.test(name)) throw fail('Nome del widget non valido: minuscole, numeri, - e _');
    if (!def || typeof def !== 'object' || Array.isArray(def)) throw fail('Il widget deve essere un oggetto');
    const clean = Object.assign({}, def);
    delete clean.id;
    const text = JSON.stringify(clean, null, 2) + '\n';
    if (text.length > MAX_BYTES) throw fail('Widget troppo grande');
    const dir = this.ensurePlugin(p);
    const src = clean.source;
    let allowed = false;
    if (src && src.type === 'http' && opts && opts.allowHost) {
      const host = hostOf(src.url);
      if (!host) throw fail('Indirizzo non valido');
      allowed = this.allowHost(p, host);
    }
    const shapes = require('./index');
    const ctx = { plugin: p, permissions: (this.readManifest(p) || {}).permissions || {} };
    const problems = shapes.validate(clean, name, ctx);
    if (problems.length) throw fail(problems[0]);
    const file = path.join(dir, 'widgets', name + '.json');
    const existed = fs.existsSync(file);
    if (existed && !(opts && opts.overwrite)) throw fail('Esiste già un widget "' + name + '": scegli un altro nome', 'CONFIG_CHANGED');
    fs.writeFileSync(file, text);
    return { plugin: p, id: name, key: p + '/' + name, home: p + '.' + name, created: !existed, allowedHost: allowed };
  }

  remove(plugin, id) {
    const name = String(id || '');
    if (!NAME_RE.test(name)) throw fail('Nome del widget non valido');
    const file = path.join(this.dir(plugin), 'widgets', name + '.json');
    if (!fs.existsSync(file)) throw fail('Widget non trovato', 'NOT_FOUND');
    fs.unlinkSync(file);
    return { plugin: plugin, id: name };
  }
}

const store = new WidgetStore(function () { return plugins.baseDir(); });

module.exports = { store: store, WidgetStore: WidgetStore, DEFAULT_PLUGIN: DEFAULT_PLUGIN };
