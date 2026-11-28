const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const log = require('./log');

const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;

function baseDir() { return process.env.DOCK_PLUGINS_DIR || path.join(paths.ROOT, 'plugins'); }
function officialDir() { return process.env.DOCK_OFFICIAL_PLUGINS_DIR || path.join(paths.ROOT, 'official-plugins'); }

const TYPES = ['plugin', 'pack'];
const PLATFORMS = ['windows', 'linux'];
const VERSION_RE = /^\d+\.\d+\.\d+$/;

function folders(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(function (d) { return d.isDirectory() && NAME_RE.test(d.name); })
      .map(function (d) { return d.name; });
  } catch (e) { return []; }
}

function versionAtLeast(have, want) {
  const a = String(have).split('.').map(Number), b = String(want).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return true;
}

function appVersion() {
  try { return require('../package.json').version; } catch (e) { return '0.0.0'; }
}

function readManifest(name, dir, official) {
  const file = path.join(dir, 'plugin.json');
  const m = { id: name, name: name, version: '', description: '', author: '', type: 'plugin', platforms: PLATFORMS.slice(),
    engine: '', icon: '', tags: [], category: '', includes: [], permissions: {}, official: official, hasManifest: false, problems: [] };
  let data;
  try { data = require('./config').parseJson(fs.readFileSync(file, 'utf8')); } catch (e) {
    if (e.code !== 'ENOENT') m.problems.push('plugin.json non valido: ' + e.message);
    else if (official) m.problems.push('plugin.json mancante');
    return m;
  }
  m.hasManifest = true;
  if (!data || typeof data !== 'object' || Array.isArray(data)) { m.problems.push('plugin.json deve essere un oggetto'); return m; }
  if (data.id !== name) m.problems.push('"id" deve essere "' + name + '", come la cartella');
  if (typeof data.name === 'string' && data.name) m.name = data.name;
  if (typeof data.description === 'string') m.description = data.description;
  if (typeof data.author === 'string') m.author = data.author;
  if (typeof data.icon === 'string' && /^[a-z0-9_-]{1,40}$/.test(data.icon)) m.icon = data.icon;
  if (Array.isArray(data.tags)) m.tags = data.tags.filter(function (t) { return typeof t === 'string'; });
  if (typeof data.category === 'string') m.category = data.category;
  if (VERSION_RE.test(data.version || '')) m.version = data.version;
  else m.problems.push('"version" deve essere nel formato 1.0.0');
  if (data.type !== undefined) {
    if (TYPES.indexOf(data.type) >= 0) m.type = data.type;
    else m.problems.push('"type" deve essere "plugin" o "pack"');
  }
  if (data.platforms !== undefined) {
    if (Array.isArray(data.platforms) && data.platforms.length && data.platforms.every(function (p) { return PLATFORMS.indexOf(p) >= 0; })) m.platforms = data.platforms.slice();
    else m.problems.push('"platforms" deve elencare "windows" e/o "linux"');
  }
  if (data.engine !== undefined) {
    const want = String(data.engine).replace(/^>=\s*/, '');
    if (VERSION_RE.test(want)) m.engine = want;
    else m.problems.push('"engine" deve essere nel formato ">=2.2.0"');
  }
  if (data.includes !== undefined) {
    if (Array.isArray(data.includes) && data.includes.every(function (n) { return typeof n === 'string' && NAME_RE.test(n); })) m.includes = data.includes.slice();
    else m.problems.push('"includes" deve essere una lista di id di plugin');
  }
  if (m.type === 'pack' && !m.includes.length) m.problems.push('un pacchetto deve elencare i plugin in "includes"');
  if (data.permissions && typeof data.permissions === 'object' && !Array.isArray(data.permissions)) m.permissions = data.permissions;
  return m;
}

function currentPlatform() { return process.platform === 'win32' ? 'windows' : 'linux'; }

let memo = null;
function remembered(key, build) {
  if (!memo) {
    memo = {};
    setImmediate(function () { memo = null; });
  }
  const k = key + '|' + officialDir() + '|' + baseDir();
  if (!memo.hasOwnProperty(k)) memo[k] = build();
  return memo[k];
}
function forget() { memo = null; catalog = null; }

let catalog = null;
function switchFile() { return path.join(process.env.DOCK_CONFIG_DIR || paths.CONFIG_DIR, 'plugins.json'); }

function switchedOff() {
  try {
    const d = JSON.parse(fs.readFileSync(switchFile(), 'utf8'));
    return Array.isArray(d && d.off) ? d.off.filter(function (n) { return typeof n === 'string' && NAME_RE.test(n); }) : [];
  } catch (e) { return []; }
}

function scanStamp() {
  const parts = [];
  try { parts.push('off:' + fs.statSync(switchFile()).mtimeMs); } catch (e) { parts.push('off:0'); }
  [officialDir(), baseDir()].forEach(function (root) {
    folders(root).sort().forEach(function (n) {
      let t = 0;
      try { t = fs.statSync(path.join(root, n, 'plugin.json')).mtimeMs; } catch (e) { t = 0; }
      parts.push(root + '/' + n + ':' + t);
    });
  });
  return parts.join('|');
}
function scan() {
  const stamp = remembered('stamp', scanStamp);
  if (catalog && catalog.stamp === stamp) return catalog;
  catalog = { stamp: stamp, list: [], byName: {}, skipped: [] };
  const off = switchedOff();
  const add = function (name, dir, official) {
    if (catalog.byName[name]) {
      catalog.skipped.push({ name: name, dir: dir, reason: 'esiste già un plugin ufficiale con questo nome' });
      return;
    }
    const manifest = readManifest(name, dir, official);
    const entry = { name: name, dir: dir, official: official, manifest: manifest, active: true, reason: '' };
    if (manifest.platforms.indexOf(currentPlatform()) < 0) { entry.active = false; entry.reason = 'non disponibile su questo sistema'; }
    else if (manifest.engine && !versionAtLeast(appVersion(), manifest.engine)) { entry.active = false; entry.reason = 'richiede Vibe Deck ' + manifest.engine + ' o successiva'; }
    else if (official && manifest.type !== 'pack' && off.indexOf(name) >= 0) { entry.active = false; entry.reason = 'spento dal pannello'; entry.off = true; }
    catalog.byName[name] = entry;
    catalog.list.push(entry);
  };
  folders(officialDir()).sort().forEach(function (n) { add(n, path.join(officialDir(), n), true); });
  folders(baseDir()).sort().forEach(function (n) { add(n, path.join(baseDir(), n), false); });
  catalog.list.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
  return catalog;
}

function names() {
  return scan().list.filter(function (e) { return e.active && e.manifest.type !== 'pack'; }).map(function (e) { return e.name; });
}

function packProblems(entry, cat) {
  const out = [];
  let extra = [];
  try { extra = fs.readdirSync(entry.dir).filter(function (f) { return f !== 'plugin.json'; }); } catch (e) { extra = []; }
  if (extra.length) out.push('un pacchetto contiene solo plugin.json (togli ' + extra.join(', ') + ')');
  const missing = entry.manifest.includes.filter(function (n) { return !cat.byName[n] || cat.byName[n].manifest.type === 'pack'; });
  if (missing.length) out.push('plugin non trovati: ' + missing.join(', '));
  return out;
}

function hasCode(name) {
  const e = scan().byName[name];
  return !!e && fs.existsSync(path.join(e.dir, 'index.js'));
}

function switchTargets(id) {
  const e = scan().byName[String(id || '')];
  if (!e || !e.official) throw Object.assign(new Error('"' + id + '" non è un plugin o un pack ufficiale'), { code: 'NOT_FOUND' });
  return e.manifest.type === 'pack' ? e.manifest.includes.slice() : [e.name];
}

function setSwitch(id, on) {
  const targets = switchTargets(id);
  const before = switchedOff();
  const next = on ? before.filter(function (n) { return targets.indexOf(n) < 0; }) : before.concat(targets.filter(function (n) { return before.indexOf(n) < 0; }));
  const changed = targets.filter(function (n) { return (before.indexOf(n) >= 0) !== (next.indexOf(n) >= 0); });
  if (changed.length) {
    const file = switchFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ off: next.sort() }, null, 2) + '\n');
    forget();
    log.info('plugin', (on ? 'accesi: ' : 'spenti: ') + changed.join(', '));
  }
  const loadedNow = loaded || {};
  const restart = changed.some(function (n) { return hasCode(n) && (on ? !(loadedNow[n] && loadedNow[n].module) : !!(loadedNow[n] && loadedNow[n].module)); });
  return { id: id, on: !!on, changed: changed, restart: restart };
}

function officialSwitches() {
  const cat = scan();
  const off = switchedOff();
  const official = cat.list.filter(function (e) { return e.official; });
  const inPack = {};
  const describe = function (e) {
    return { id: e.name, name: e.manifest.name || e.name, description: e.manifest.description || '', icon: e.manifest.icon || '', on: off.indexOf(e.name) < 0, available: e.active || !!e.off, reason: e.off ? '' : e.reason, code: hasCode(e.name) };
  };
  const packs = official.filter(function (e) { return e.manifest.type === 'pack'; }).map(function (e) {
    const items = e.manifest.includes.map(function (n) { inPack[n] = true; return cat.byName[n] ? describe(cat.byName[n]) : null; }).filter(Boolean);
    const on = items.filter(function (i) { return i.on; }).length;
    return { id: e.name, name: e.manifest.name || e.name, description: e.manifest.description || '', icon: e.manifest.icon || '', plugins: items, state: on === items.length ? 'on' : on ? 'partial' : 'off' };
  });
  const single = official.filter(function (e) { return e.manifest.type !== 'pack' && !inPack[e.name]; }).map(describe);
  return { packs: packs, plugins: single };
}

function dirOf(name) {
  const e = scan().byName[name];
  return e ? e.dir : path.join(baseDir(), name);
}

function configDirs() { return names().map(dirOf); }

function manifests() {
  return scan().list.map(function (e) { return Object.assign({}, e.manifest, { active: e.active, reason: e.reason }); });
}

let loaded = null;
let control = { only: function (req, res, next) { next(); }, info: function () { return {}; } };
function setControl(c) { control = c; }

function context(name) {
  const dataDir = path.join(paths.DATA_DIR, 'plugins', name);
  return {
    name: name,
    dir: dirOf(name),
    dataDir: dataDir,
    get config() { return require('./config'); },
    get platform() { return require('./platform'); },
    get keys() { return require('./platform/keys'); },
    get controlOnly() { return control.only; },
    controlInfo: function () { return control.info(); },
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
          if (!res.headersSent) require('./http-error').sendError(res, e);
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

const actionInfo = {};
function actionDescriptions() { return Object.assign({}, actionInfo); }

function registerActions(HANDLERS) {
  const all = load();
  Object.keys(all).forEach(function (name) {
    const p = all[name];
    const acts = p.module && p.module.actions;
    if (!acts || typeof acts !== 'object') return;
    const ctx = context(name);
    Object.keys(acts).forEach(function (key) {
      const entry = acts[key];
      const run = typeof entry === 'function' ? entry : entry && typeof entry.run === 'function' ? entry.run : null;
      if (!run || !NAME_RE.test(key)) {
        log.warn('plugin', name + ': azione "' + key + '" ignorata (serve una funzione, o { run, label, params }, e un nome come "saluta")');
        return;
      }
      const type = key === name ? name : name + '.' + key;
      if (HANDLERS[type] && p.actions.indexOf(type) < 0 && key === name) {
        log.warn('plugin', name + ': azione "' + key + '" ignorata (il tipo "' + type + '" esiste già)');
        return;
      }
      HANDLERS[type] = async function (a) {
        const r = await run(a, ctx);
        return r && typeof r === 'object' ? r : { message: r === undefined || r === null ? null : String(r) };
      };
      p.actions.push(type);
      actionInfo[type] = Object.assign({ plugin: name }, typeof entry === 'function' ? {} : { label: entry.label, description: entry.description, params: entry.params, info: true });
    });
  });
}

function withModule(fn) {
  const all = load();
  Object.keys(all).forEach(function (n) { if (all[n].module) fn(n, all[n].module); });
}

function controlInfo() {
  const out = {};
  withModule(function (n, m) {
    if (!m.control || typeof m.control.info !== 'function') return;
    try { out[n] = m.control.info(context(n)); } catch (e) { log.warn('plugin', n + ': control.info: ' + e.message); }
  });
  return out;
}

async function controlPrepare() {
  const jobs = [];
  withModule(function (n, m) {
    if (m.control && typeof m.control.prepare === 'function') jobs.push(Promise.resolve().then(function () { return m.control.prepare(context(n)); }).catch(function (e) { log.warn('plugin', n + ': control.prepare: ' + e.message); }));
  });
  await Promise.all(jobs);
}

function mountControl(app, express, guard) {
  withModule(function (n, m) {
    if (!m.control || typeof m.control.routes !== 'function') return;
    const router = express.Router();
    try {
      m.control.routes(router, context(n));
      app.use('/api/control/' + n, guard, router);
    } catch (e) {
      load()[n].error = 'rotte del pannello non registrate: ' + e.message;
      log.error('plugin', n + ': ' + load()[n].error);
    }
  });
}

function sources() {
  const out = {};
  withModule(function (n, m) {
    if (m.sources && typeof m.sources === 'object') Object.keys(m.sources).forEach(function (k) { if (typeof m.sources[k] === 'function') out[k] = { plugin: n, fn: m.sources[k] }; });
  });
  return out;
}

function sourceTiles(name) {
  const s = sources()[name];
  if (!s) return null;
  try { return s.fn(context(s.plugin)); } catch (e) { log.warn('plugin', s.plugin + ': source ' + name + ': ' + e.message); return []; }
}

function hook(name, payload) {
  const all = load();
  const out = [];
  Object.keys(all).forEach(function (n) {
    const h = all[n].module && all[n].module.hooks;
    if (!h || typeof h[name] !== 'function') return;
    try { out.push(h[name](payload, context(n))); } catch (e) { log.warn('plugin', n + ': hook ' + name + ': ' + e.message); }
  });
  return out;
}

function mountRoutes(app, express) {
  const all = load();
  Object.keys(all).forEach(function (name) {
    const p = all[name];
    if (!p.module) return;
    if (typeof p.module.publicRoutes === 'function') {
      const open = express.Router();
      open.use(function (req, res, next) {
        if (req.method === 'GET' || req.method === 'HEAD') return next();
        res.status(405).end();
      });
      try {
        p.module.publicRoutes(open, context(name));
        app.use('/plugins-public/' + name, open);
      } catch (e) {
        p.error = 'rotte pubbliche non registrate: ' + e.message;
        log.error('plugin', name + ': ' + p.error);
      }
    }
    if (typeof p.module.routes !== 'function') return;
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

function scripts(ext, sub) {
  return remembered('files:' + (ext || 'js') + ':' + (sub || ''), function () { return listFiles(ext, sub); }).slice();
}
function listFiles(ext, sub) {
  const re = ext === 'css' ? /\.css$/i : /\.js$/i;
  const folder = sub || 'public';
  const out = [];
  names().forEach(function (name) {
    const dir = path.join(dirOf(name), folder);
    let files = [];
    try { files = fs.readdirSync(dir).filter(function (f) { return re.test(f); }).sort(); } catch (e) { files = []; }
    files.forEach(function (f) {
      let mtime = 0;
      try { mtime = fs.statSync(path.join(dir, f)).mtimeMs; } catch (e) { mtime = 0; }
      out.push({ plugin: name, file: f, url: 'plugins/' + name + '/' + (sub ? sub + '/' : '') + f, path: path.join(dir, f), mtime: mtime });
    });
  });
  return out;
}
function styles() { return scripts('css'); }
function controlScripts() { return scripts('js', 'control'); }
function controlStyles() { return scripts('css', 'control'); }

function registered(kind) {
  return Object.assign({}, remembered('registered:' + kind, function () { return findRegistered(kind); }));
}
function findRegistered(kind) {
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

let homeNames = {};
function widgetLabels() { homeWidgets(); return homeNames; }

function homeWidgets() {
  return remembered('home', readHomeWidgets).map(function (w) { return Object.assign({}, w); });
}
function homeEntry(name, id, widget, d, int) {
  const minW = int(d.minW, 1, 8, 1), minH = int(d.minH, 1, 6, 1);
  return {
    id: id, widget: widget, plugin: name, page: 'PLUGIN ' + name.toUpperCase(),
    label: typeof d.label === 'string' && d.label ? d.label : id.toUpperCase(),
    icon: typeof d.icon === 'string' && d.icon ? d.icon : 'apps',
    description: typeof d.description === 'string' ? d.description : 'Widget del plugin ' + name,
    w: Math.max(minW, int(d.w, 1, 8, 2)), h: Math.max(minH, int(d.h, 1, 6, 2)), minW: minW, minH: minH,
    category: typeof d.category === 'string' ? d.category : '',
    props: d.props && typeof d.props === 'object' && !Array.isArray(d.props) ? d.props : null
  };
}
function dynamicHomeWidgets(name) {
  const p = load()[name];
  const h = p && p.module && p.module.hooks;
  if (!h || typeof h.homeWidgets !== 'function') return [];
  try {
    const list = h.homeWidgets(null, context(name));
    return Array.isArray(list) ? list : [];
  } catch (e) {
    log.warn('plugin', name + ': hook homeWidgets: ' + e.message);
    return [];
  }
}
function readHomeWidgets() {
  const out = [];
  const labels = {};
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
        if (data[id] === false || (data[id] && data[id].catalog === false)) {
          declared[data[id] && data[id].widget || id] = true;
          if (data[id] && typeof (data[id].name || data[id].label) === 'string') labels[data[id].widget || id] = data[id].name || data[id].label;
          return;
        }
        const d = data[id] || {};
        const widget = typeof d.widget === 'string' && d.widget ? d.widget : id;
        if (!NAME_RE.test(id) || reg[widget] !== name) {
          log.warn('plugin', name + '/home.json: "' + id + '" ignorato (il widget "' + widget + '" non è registrato da questo plugin con Widgets.register)');
          return;
        }
        declared[widget] = true;
        if (!labels[widget]) labels[widget] = typeof d.name === 'string' ? d.name : typeof d.label === 'string' ? d.label : widget;
        out.push(homeEntry(name, id, widget, d, int));
      });
    }
    dynamicHomeWidgets(name).forEach(function (d) {
      const id = d && typeof d.id === 'string' ? d.id : '';
      const widget = d && typeof d.widget === 'string' ? d.widget : '';
      if (!NAME_RE.test(id) || reg[widget] !== name || out.some(function (o) { return o.id === id; })) {
        log.warn('plugin', name + ': widget dinamico "' + id + '" ignorato');
        return;
      }
      declared[widget] = true;
      out.push(homeEntry(name, id, widget, d, int));
    });
    Object.keys(reg).forEach(function (w) {
      if (reg[w] !== name || declared[w]) return;
      out.push({ id: w, widget: w, plugin: name, page: 'PLUGIN ' + name.toUpperCase(), label: w.toUpperCase(), icon: 'apps',
        description: 'Widget del plugin ' + name + ' (nome e misure: plugins/' + name + '/home.json)', w: 2, h: 2, minW: 1, minH: 1, props: null });
    });
  });
  homeNames = labels;
  return out.concat(require('./shapes').catalog());
}
function icons() { return registered('Icons'); }

function validRules(list, where) {
  if (!Array.isArray(list)) return [];
  return list.filter(function (r) {
    if (!Array.isArray(r) || r.length !== 2 || typeof r[0] !== 'string' || typeof r[1] !== 'string') {
      log.warn('plugin', where + ': ogni regola in "$rules" è [ "espressione", "sostituzione" ]');
      return false;
    }
    try { new RegExp(r[0]); return true; } catch (e) {
      log.warn('plugin', where + ': regola non valida ' + r[0] + ': ' + e.message);
      return false;
    }
  });
}

function dictionary(lang) {
  return remembered('lang:' + lang, function () {
    const out = { words: {}, rules: [] };
    const parse = require('./config').parseJson;
    names().forEach(function (name) {
      const where = name + '/lang/' + lang + '.json';
      let data = null;
      try { data = parse(fs.readFileSync(path.join(dirOf(name), 'lang', lang + '.json'), 'utf8')); } catch (e) {
        if (e.code !== 'ENOENT') log.warn('plugin', where + ' non valido: ' + e.message);
        return;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return;
      Object.keys(data).forEach(function (k) { if (k !== '$rules' && typeof data[k] === 'string') out.words[k] = data[k]; });
      out.rules = out.rules.concat(validRules(data.$rules, where));
    });
    return out;
  });
}

function langScript(dict) {
  const rules = dict.rules.map(function (r) { return '[new RegExp(' + JSON.stringify(r[0]) + '), ' + JSON.stringify(r[1]) + ']'; });
  return 'I18n.add(' + JSON.stringify(dict.words) + ');\n' + (rules.length ? 'I18n.rules([' + rules.join(', ') + ']);\n' : '');
}

function info() {
  const all = load();
  const w = widgets();
  const ic = icons();
  const cat = scan();
  const rows = cat.list.map(function (entry) {
    const name = entry.name;
    const m = entry.manifest;
    const p = all[name] || { actions: [], error: '' };
    const dir = entry.dir;
    const count = function (sub) { try { return fs.readdirSync(path.join(dir, sub)).filter(function (f) { return /\.json$/i.test(f); }).length; } catch (e) { return 0; } };
    const codeDesc = (p.module && typeof p.module.description === 'string') ? p.module.description : '';
    const hasCode = fs.existsSync(path.join(dir, 'index.js'));
    const problems = m.problems.slice();
    if (m.type === 'pack') problems.push.apply(problems, packProblems(entry, cat));
    if (p.error) problems.push(p.error);
    else if (entry.active && hasCode && !all[name]) problems.push('riavvia la dock per caricare il codice');
    return {
      name: name,
      title: m.name,
      version: m.version,
      author: m.author,
      type: m.type,
      includes: m.includes.slice(),
      platforms: m.platforms.slice(),
      official: entry.official,
      active: entry.active,
      inactiveReason: entry.reason,
      description: m.description || codeDesc,
      error: problems.join('; '),
      actions: p.actions.slice(),
      widgets: Object.keys(w).filter(function (k) { return w[k] === name; }),
      icons: Object.keys(ic).filter(function (k) { return ic[k] === name; }),
      pages: count('pages'),
      apps: count('apps'),
      commands: count('commands'),
      scripts: entry.active ? scripts().filter(function (s) { return s.plugin === name; }).map(function (s) { return s.file; }) : []
    };
  });
  cat.skipped.forEach(function (sk) {
    rows.push({ name: sk.name, title: sk.name, version: '', author: '', type: 'plugin', includes: [], platforms: [], official: false,
      active: false, inactiveReason: sk.reason, description: '', error: 'cartella ' + sk.dir + ' ignorata: ' + sk.reason,
      actions: [], widgets: [], icons: [], pages: 0, apps: 0, commands: 0, scripts: [] });
  });
  return rows;
}

function reset() {
  if (loaded) Object.keys(loaded).forEach(function (n) {
    const main = path.join(loaded[n].dir, 'index.js');
    try { delete require.cache[require.resolve(main)]; } catch (e) { }
  });
  loaded = null;
  forget();
}

module.exports = {
  switchedOff: switchedOff, setSwitch: setSwitch, officialSwitches: officialSwitches, hasCode: hasCode,
  baseDir: baseDir, officialDir: officialDir, dirOf: dirOf, manifests: manifests, readManifest: readManifest, versionAtLeast: versionAtLeast, names: names, configDirs: configDirs, load: load,
  registerActions: registerActions, mountRoutes: mountRoutes, hook: hook,
  setControl: setControl, controlInfo: controlInfo, controlPrepare: controlPrepare, mountControl: mountControl, sourceTiles: sourceTiles,
  controlScripts: controlScripts, controlStyles: controlStyles,
  actionDescriptions: actionDescriptions, remembered: remembered, dictionary: dictionary, langScript: langScript, context: context, scripts: scripts, styles: styles, widgets: widgets, homeWidgets: homeWidgets, widgetLabels: widgetLabels, icons: icons, info: info, reset: reset, NAME_RE: NAME_RE
};
