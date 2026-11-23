const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const log = require('./log');

const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;

function baseDir() { return process.env.DOCK_PLUGINS_DIR || path.join(paths.ROOT, 'plugins'); }

function names() {
  let list = [];
  try {
    list = fs.readdirSync(baseDir(), { withFileTypes: true })
      .filter(function (d) { return d.isDirectory() && NAME_RE.test(d.name); })
      .map(function (d) { return d.name; })
      .sort();
  } catch (e) { list = []; }
  return list;
}

function dirOf(name) { return path.join(baseDir(), name); }

function configDirs() { return names().map(dirOf); }

let loaded = null;

function context(name) {
  const dataDir = path.join(paths.DATA_DIR, 'plugins', name);
  return {
    name: name,
    dir: dirOf(name),
    dataDir: dataDir,
    get config() { return require('./config'); },
    get platform() { return require('./platform'); },
    log: {
      info: function (m) { log.info('plugin:' + name, m); },
      warn: function (m) { log.warn('plugin:' + name, m); },
      error: function (m) { log.error('plugin:' + name, m); }
    },
    paths: paths,
    execute: function (a) { return require('./actions').execute(a); },
    ensureDataDir: function () { fs.mkdirSync(dataDir, { recursive: true }); return dataDir; },
    route: function (fn) {
      return function (req, res) {
        Promise.resolve().then(function () { return fn(req, res); }).then(function (data) {
          if (!res.headersSent) res.json({ ok: true, data: data === undefined ? null : data });
        }).catch(function (e) {
          log.warn('plugin:' + name, req.method + ' ' + req.path + ': ' + e.message);
          if (!res.headersSent) res.status(e.status || 500).json({ ok: false, error: { code: e.code || 'ACTION_FAILED', message: e.message || 'Errore' } });
        });
      };
    }
  };
}

function load() {
  if (loaded) return loaded;
  loaded = {};
  names().forEach(function (name) {
    const dir = dirOf(name);
    const p = { name: name, dir: dir, module: null, error: '', actions: [] };
    loaded[name] = p;
    const main = path.join(dir, 'index.js');
    if (!fs.existsSync(main)) return;
    try {
      const m = require(main);
      p.module = m && typeof m === 'object' ? m : {};
      log.info('plugin', name + ' caricato');
    } catch (e) {
      p.error = 'index.js non caricato: ' + e.message;
      log.error('plugin', name + ': ' + p.error);
    }
  });
  return loaded;
}

function registerActions(HANDLERS) {
  const all = load();
  Object.keys(all).forEach(function (name) {
    const p = all[name];
    const acts = p.module && p.module.actions;
    if (!acts || typeof acts !== 'object') return;
    const ctx = context(name);
    Object.keys(acts).forEach(function (key) {
      if (typeof acts[key] !== 'function' || !NAME_RE.test(key)) {
        log.warn('plugin', name + ': azione "' + key + '" ignorata (serve una funzione e un nome come "saluta")');
        return;
      }
      const type = name + '.' + key;
      HANDLERS[type] = async function (a) {
        const r = await acts[key](a, ctx);
        return r && typeof r === 'object' ? r : { message: r === undefined || r === null ? null : String(r) };
      };
      p.actions.push(type);
    });
  });
}

function mountRoutes(app, express) {
  const all = load();
  Object.keys(all).forEach(function (name) {
    const p = all[name];
    if (!p.module || typeof p.module.routes !== 'function') return;
    const router = express.Router();
    try {
      p.module.routes(router, context(name));
      app.use('/api/plugins/' + name, router);
    } catch (e) {
      p.error = 'rotte non registrate: ' + e.message;
      log.error('plugin', name + ': ' + p.error);
    }
  });
}

function scripts(ext) {
  const re = ext === 'css' ? /\.css$/i : /\.js$/i;
  const out = [];
  names().forEach(function (name) {
    const dir = path.join(dirOf(name), 'public');
    let files = [];
    try { files = fs.readdirSync(dir).filter(function (f) { return re.test(f); }).sort(); } catch (e) { files = []; }
    files.forEach(function (f) {
      let mtime = 0;
      try { mtime = fs.statSync(path.join(dir, f)).mtimeMs; } catch (e) { mtime = 0; }
      out.push({ plugin: name, file: f, url: 'plugins/' + name + '/' + f, path: path.join(dir, f), mtime: mtime });
    });
  });
  return out;
}
function styles() { return scripts('css'); }

function registered(kind) {
  const re = new RegExp(kind + "\\.register\\(\\s*['\"]([A-Za-z0-9_.-]+)['\"]", 'g');
  const out = {};
  scripts().forEach(function (s) {
    let text = '';
    try { text = fs.readFileSync(s.path, 'utf8'); } catch (e) { return; }
    let m;
    while ((m = re.exec(text))) out[m[1]] = s.plugin;
  });
  return out;
}
function widgets() { return registered('Widgets'); }

function homeWidgets() {
  const out = [];
  const reg = widgets();
  const parse = require('./config').parseJson;
  const int = function (v, min, max, def) { const n = parseInt(v, 10); return isNaN(n) ? def : Math.max(min, Math.min(max, n)); };
  names().forEach(function (name) {
    const file = path.join(dirOf(name), 'home.json');
    let data = null;
    try { data = parse(fs.readFileSync(file, 'utf8')); } catch (e) {
      if (e.code !== 'ENOENT') log.warn('plugin', name + '/home.json non valido: ' + e.message);
    }
    const declared = {};
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      Object.keys(data).forEach(function (id) {
        const d = data[id] || {};
        const widget = typeof d.widget === 'string' && d.widget ? d.widget : id;
        if (!NAME_RE.test(id) || reg[widget] !== name) {
          log.warn('plugin', name + '/home.json: "' + id + '" ignorato (il widget "' + widget + '" non è registrato da questo plugin con Widgets.register)');
          return;
        }
        declared[widget] = true;
        const minW = int(d.minW, 1, 8, 1), minH = int(d.minH, 1, 6, 1);
        out.push({
          id: id, widget: widget, plugin: name, page: 'PLUGIN ' + name.toUpperCase(),
          label: typeof d.label === 'string' && d.label ? d.label : id.toUpperCase(),
          icon: typeof d.icon === 'string' && d.icon ? d.icon : 'apps',
          description: typeof d.description === 'string' ? d.description : 'Widget del plugin ' + name,
          w: Math.max(minW, int(d.w, 1, 8, 2)), h: Math.max(minH, int(d.h, 1, 6, 2)), minW: minW, minH: minH,
          props: d.props && typeof d.props === 'object' && !Array.isArray(d.props) ? d.props : null
        });
      });
    }
    Object.keys(reg).forEach(function (w) {
      if (reg[w] !== name || declared[w]) return;
      out.push({ id: w, widget: w, plugin: name, page: 'PLUGIN ' + name.toUpperCase(), label: w.toUpperCase(), icon: 'apps',
        description: 'Widget del plugin ' + name + ' (nome e misure: plugins/' + name + '/home.json)', w: 2, h: 2, minW: 1, minH: 1, props: null });
    });
  });
  return out;
}
function icons() { return registered('Icons'); }

function info() {
  const all = load();
  const w = widgets();
  const ic = icons();
  return names().map(function (name) {
    const p = all[name] || { actions: [], error: '' };
    const dir = dirOf(name);
    const count = function (sub) { try { return fs.readdirSync(path.join(dir, sub)).filter(function (f) { return /\.json$/i.test(f); }).length; } catch (e) { return 0; } };
    return {
      name: name,
      description: (p.module && typeof p.module.description === 'string') ? p.module.description : '',
      error: p.error || (all[name] ? '' : 'riavvia la dock per caricare il codice'),
      actions: p.actions.slice(),
      widgets: Object.keys(w).filter(function (k) { return w[k] === name; }),
      icons: Object.keys(ic).filter(function (k) { return ic[k] === name; }),
      pages: count('pages'),
      apps: count('apps'),
      commands: count('commands'),
      scripts: scripts().filter(function (s) { return s.plugin === name; }).map(function (s) { return s.file; })
    };
  });
}

function reset() {
  if (loaded) Object.keys(loaded).forEach(function (n) {
    const main = path.join(loaded[n].dir, 'index.js');
    try { delete require.cache[require.resolve(main)]; } catch (e) { }
  });
  loaded = null;
}

module.exports = {
  baseDir: baseDir, names: names, configDirs: configDirs, load: load,
  registerActions: registerActions, mountRoutes: mountRoutes,
  scripts: scripts, styles: styles, widgets: widgets, homeWidgets: homeWidgets, icons: icons, info: info, reset: reset, NAME_RE: NAME_RE
};
