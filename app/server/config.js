const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const log = require('./log');

const FILES = ['dock', 'apps', 'commands', 'services', 'layout'];
const OPTIONAL = { layout: true };
const cache = {};
const errors = {};

function stripJsonComments(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inString) {
      out += c;
      if (c === '\\') { out += n === undefined ? '' : n; i++; }
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === '/' && n === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    if (c === '/' && n === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
      continue;
    }
    out += c;
  }
  return removeTrailingCommas(out);
}

function removeTrailingCommas(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') { out += text[i + 1] === undefined ? '' : text[i + 1]; i++; }
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === '}' || text[j] === ']') continue;
    }
    out += c;
  }
  return out;
}

function parseJson(text) {
  return JSON.parse(stripJsonComments(text.replace(/^﻿/, '')));
}

function ensureUserConfig() {
  const copied = [];
  if (!fs.existsSync(paths.CONFIG_DIR)) fs.mkdirSync(paths.CONFIG_DIR, { recursive: true });
  FILES.forEach(function (name) {
    const target = path.join(paths.CONFIG_DIR, name + '.json');
    const source = path.join(paths.DEFAULTS_DIR, name + '.json');
    if (!fs.existsSync(target) && fs.existsSync(source)) {
      fs.copyFileSync(source, target);
      copied.push(name + '.json');
    }
  });
  return copied;
}

function fingerprint(text) {
  return require('crypto').createHash('sha1').update(String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')).digest('hex');
}

function upgradeUserConfig(configDir, defaultsDir) {
  configDir = configDir || paths.CONFIG_DIR;
  defaultsDir = defaultsDir || paths.DEFAULTS_DIR;
  let history = {};
  try { history = parseJson(fs.readFileSync(path.join(defaultsDir, 'history.json'), 'utf8')); } catch (e) { return []; }
  const updated = [];
  FILES.forEach(function (name) {
    const target = path.join(configDir, name + '.json');
    const source = path.join(defaultsDir, name + '.json');
    const old = Array.isArray(history[name]) ? history[name] : [];
    if (!old.length || !fs.existsSync(target) || !fs.existsSync(source)) return;
    try {
      const mine = fingerprint(fs.readFileSync(target, 'utf8'));
      const fresh = fs.readFileSync(source, 'utf8');
      if (mine === fingerprint(fresh) || old.indexOf(mine) < 0) return;
      fs.writeFileSync(target + '.tmp', fresh);
      fs.renameSync(target + '.tmp', target);
      updated.push(name + '.json');
    } catch (e) {
      log.warn('config', 'aggiornamento di ' + name + '.json non riuscito: ' + e.message);
    }
  });
  return updated;
}

function fileFor(name) {
  const user = path.join(paths.CONFIG_DIR, name + '.json');
  if (fs.existsSync(user)) return user;
  return path.join(paths.DEFAULTS_DIR, name + '.json');
}

function get(name) {
  const file = fileFor(name);
  let stat;
  try { stat = fs.statSync(file); } catch (e) {
    if (OPTIONAL[name]) {
      if (cache[name] && cache[name].mtime) log.info('config', name + '.json rimosso');
      cache[name] = { mtime: 0, file: file, data: {} };
      return cache[name].data;
    }
    errors[name] = 'File mancante: ' + path.basename(file);
    return (cache[name] && cache[name].data) || {};
  }
  const entry = cache[name];
  if (entry && entry.mtime === stat.mtimeMs && entry.file === file) return entry.data;
  try {
    const data = parseJson(fs.readFileSync(file, 'utf8'));
    cache[name] = { mtime: stat.mtimeMs, file: file, data: data };
    if (entry) log.info('config', name + '.json ricaricato');
    delete errors[name];
    return data;
  } catch (e) {
    const msg = name + '.json non valido: ' + e.message;
    if (errors[name] !== msg) log.error('config', msg + ' (uso l\'ultima versione valida)');
    errors[name] = msg;
    if (entry) { entry.mtime = stat.mtimeMs; return entry.data; }
    return {};
  }
}

function currentOs() { return process.platform === 'win32' ? 'windows' : process.platform; }

function forOs(item, osKey) {
  if (!item || typeof item !== 'object') return item;
  if (item.os) {
    const list = Array.isArray(item.os) ? item.os : [item.os];
    if (list.indexOf(osKey) < 0) return null;
  }
  const out = Object.assign({}, item, item[osKey] && typeof item[osKey] === 'object' && !Array.isArray(item[osKey]) ? item[osKey] : {});
  delete out.os; delete out.windows; delete out.linux; delete out.darwin;
  return out;
}

function autoGrid(tiles) {
  let cells = 0, minCols = 1, minRows = 1;
  tiles.forEach(function (t) { cells += (t.w || 1) * (t.h || 1); minCols = Math.max(minCols, t.w || 1); minRows = Math.max(minRows, t.h || 1); });
  cells = Math.max(1, cells);
  let best = null;
  for (let r = minRows; r <= 6; r++) {
    const c = Math.max(minCols, Math.ceil(cells / r));
    if (c > 8) continue;
    const score = (c * r - cells) + 3 * Math.abs(Math.log((c / r) / 1.7));
    if (!best || score < best.score - 1e-9) best = { columns: c, rows: r, score: score };
  }
  return best ? { columns: best.columns, rows: best.rows } : { columns: 8, rows: 6 };
}

function editablePage(p) {
  const buttons = p.tiles.filter(function (t) { return !t.widget; });
  return buttons.length > 0 && (buttons.length === p.tiles.length || !!p.buttonGrid);
}

function clampInt(v, min, max, def) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function normalizeDock(raw, layout, osKey) {
  raw = raw || {};
  layout = layout || {};
  osKey = osKey || currentOs();
  const grid = raw.grid || {};
  const columns = clampInt(grid.columns, 1, 8, 5);
  const rows = clampInt(grid.rows, 1, 6, 3);
  const pages = [];
  const seenPages = {};
  const tileLayout = layout.tiles && typeof layout.tiles === 'object' ? layout.tiles : {};
  (Array.isArray(raw.pages) ? raw.pages : []).forEach(function (p) {
    if (!p || typeof p.id !== 'string' || seenPages[p.id]) return;
    p = forOs(p, osKey);
    if (!p) return;
    p = require('./home').apply(p, layout);
    seenPages[p.id] = true;
    let cols = clampInt(p.columns, 1, 8, columns);
    let rws = clampInt(p.rows, 1, 6, rows);
    const seenTiles = {};
    let all = (Array.isArray(p.tiles) ? p.tiles : []).map(function (t, i) {
      t = Object.assign({}, t || {});
      let id = typeof t.id === 'string' && t.id ? t.id : p.id + '-' + i;
      while (seenTiles[id]) id += '_';
      seenTiles[id] = true;
      t.id = id;
      return t;
    }).map(function (t) { return forOs(t, osKey); }).filter(Boolean);

    const custom = tileLayout[p.id];
    const row = !!p.buttonGrid;
    const editable = editablePage({ tiles: all, buttonGrid: row });
    const fixed = all.filter(function (t) { return t.widget; });
    const buttons = all.filter(function (t) { return !t.widget; });
    let shownButtons = buttons.filter(function (t) { return !t.hidden; });
    const useCustom = !!(custom && Array.isArray(custom.show) && editable);
    if (useCustom) {
      const byId = {};
      buttons.forEach(function (t) { byId[t.id] = t; });
      const hide = Array.isArray(custom.hide) ? custom.hide : [];
      const shown = custom.show.filter(function (id, i) { return byId[id] && custom.show.indexOf(id) === i; });
      shownButtons = shown.map(function (id) { return byId[id]; })
        .concat(buttons.filter(function (t) { return shown.indexOf(t.id) < 0 && hide.indexOf(t.id) < 0 && !t.hidden; }));
    }
    let tiles = editable ? fixed.concat(shownButtons) : all;
    const changed = tiles.length !== all.length || tiles.some(function (t, i) { return t !== all[i]; });
    if (!row && (p.autoGrid || useCustom || changed)) {
      const g = autoGrid(tiles.map(function (t) { return { w: clampInt(t.w, 1, 8, 1), h: clampInt(t.h, 1, 6, 1) }; }));
      cols = g.columns;
      rws = g.rows;
    }
    tiles.forEach(function (t) {
      t.w = clampInt(t.w, 1, cols, 1);
      t.h = clampInt(t.h, 1, rws, 1);
    });
    pages.push({
      id: p.id,
      title: p.title || p.id.toUpperCase(),
      icon: p.icon || null,
      description: typeof p.description === 'string' ? p.description : '',
      tab: p.tab !== false,
      columns: cols,
      rows: rws,
      tiles: tiles,
      allTiles: all,
      buttonGrid: row,
      widgetWidth: row ? Math.max(0.3, Math.min(0.7, Number(p.widgetWidth) || 0.5)) : undefined,
      editable: editable
    });
  });
  if (!pages.length) {
    pages.push({ id: 'main', title: 'HOME', icon: 'home', description: '', tab: true, columns: columns, rows: rows, tiles: [], allTiles: [], editable: false });
  }
  let home = raw.home && seenPages[raw.home] ? raw.home : pages[0].id;

  if (Array.isArray(layout.tabs)) {
    const order = layout.tabs.filter(function (id, i) { return seenPages[id] && layout.tabs.indexOf(id) === i; });
    if (order.length) {
      const rank = {};
      pages.forEach(function (p, i) { rank[p.id] = order.indexOf(p.id) >= 0 ? order.indexOf(p.id) : 1000 + i; p.tab = order.indexOf(p.id) >= 0; });
      pages.sort(function (a, b) { return rank[a.id] - rank[b.id]; });
    }
  }
  if (typeof layout.home === 'string' && seenPages[layout.home]) home = layout.home;

  return {
    title: raw.title || 'VIBE DECK',
    theme: raw.theme || {},
    grid: { columns: columns, rows: rows },
    home: home,
    pages: pages
  };
}

const DIR_KINDS = ['pages', 'apps', 'commands'];
function pluginDirs() { return require('./plugins').configDirs(); }
const dirCache = {};

function readDir(base, kind) {
  const dir = path.join(base, kind);
  let names = [];
  try { names = fs.readdirSync(dir).filter(function (n) { return /\.json$/i.test(n); }).sort(); } catch (e) { names = []; }
  const stamp = names.map(function (n) {
    try { return n + ':' + fs.statSync(path.join(dir, n)).mtimeMs; } catch (e) { return n; }
  }).join('|');
  const old = dirCache[dir];
  if (old && old.stamp === stamp) return old.items;
  const items = {};
  names.forEach(function (n) {
    const id = n.replace(/\.json$/i, '');
    const key = kind + '/' + n + (base === paths.DEFAULTS_DIR ? ' (default)' : base === paths.CONFIG_DIR ? '' : ' (plugin ' + path.basename(base) + ')');
    try {
      items[id] = parseJson(fs.readFileSync(path.join(dir, n), 'utf8'));
      delete errors[key];
    } catch (e) {
      const msg = key + ' non valido: ' + e.message;
      if (errors[key] !== msg) log.error('config', msg + ' (uso l\'ultima versione valida)');
      errors[key] = msg;
      if (old && old.items[id]) items[id] = old.items[id];
    }
  });
  if (old) log.info('config', path.relative(paths.ROOT, dir) + ' ricaricata');
  dirCache[dir] = { stamp: stamp, items: items };
  return items;
}

function pagesIn(base) {
  const files = readDir(base, 'pages');
  const out = {};
  Object.keys(files).forEach(function (name) {
    const p = files[name];
    if (!p || typeof p !== 'object' || Array.isArray(p)) return;
    const id = typeof p.id === 'string' && p.id ? p.id : name;
    out[id] = Object.assign({}, p, { id: id });
  });
  return out;
}

function entriesIn(base, kind) {
  const files = readDir(base, kind);
  const out = {};
  Object.keys(files).forEach(function (name) {
    const d = files[name];
    if (!d || typeof d !== 'object') return;
    if (d[kind] && typeof d[kind] === 'object') Object.assign(out, d[kind]);
    else out[name] = d;
  });
  return out;
}

const missingPages = {};
function mergedDock() {
  const d = get('dock');
  const mine = pagesIn(paths.CONFIG_DIR);
  const defaults = {};
  pluginDirs().forEach(function (dir) { Object.assign(defaults, pagesIn(dir)); });
  Object.assign(defaults, pagesIn(paths.DEFAULTS_DIR));
  const out = [];
  const have = {};
  Object.keys(missingPages).forEach(function (k) { delete missingPages[k]; });
  (Array.isArray(d.pages) ? d.pages : []).forEach(function (p) {
    let page = null;
    if (typeof p === 'string') {
      page = mine[p] || defaults[p] || null;
      if (!page) missingPages[p] = true;
    } else if (p && typeof p === 'object') {
      page = (typeof p.id === 'string' && mine[p.id]) || p;
    }
    if (!page || typeof page.id !== 'string' || have[page.id]) return;
    have[page.id] = true;
    out.push(page);
  });
  Object.keys(mine).forEach(function (id) {
    if (!have[id]) { have[id] = true; out.push(mine[id]); }
  });
  Object.keys(defaults).forEach(function (id) {
    if (!have[id]) { have[id] = true; out.push(Object.assign({}, defaults[id], { tab: defaults[id].tab === true })); }
  });
  return Object.assign({}, d, { pages: out });
}

function defaultDock() {
  let d = {};
  try { d = parseJson(fs.readFileSync(path.join(paths.DEFAULTS_DIR, 'dock.json'), 'utf8')); } catch (e) { return { pages: [] }; }
  const defaults = pagesIn(paths.DEFAULTS_DIR);
  const pages = (Array.isArray(d.pages) ? d.pages : []).map(function (p) { return typeof p === 'string' ? defaults[p] : p; }).filter(Boolean);
  return Object.assign({}, d, { pages: pages });
}

function withSources(d) {
  if (!Array.isArray(d.pages) || !d.pages.some(function (p) { return p && typeof p.source === 'string'; })) return d;
  const plugins = require('./plugins');
  return Object.assign({}, d, {
    pages: d.pages.map(function (p) {
      if (!p || typeof p.source !== 'string') return p;
      const tiles = plugins.sourceTiles(p.source);
      return Array.isArray(tiles) ? Object.assign({}, p, { tiles: tiles, autoGrid: true }) : p;
    })
  });
}

function dock() { return normalizeDock(withSources(mergedDock()), get('layout')); }

function tabletDock() {
  const d = dock();
  return Object.assign({}, d, {
    pages: d.pages.map(function (p) {
      const out = Object.assign({}, p);
      delete out.allTiles; delete out.editable;
      return out;
    })
  });
}

function defaultSection(name) {
  try { return parseJson(fs.readFileSync(path.join(paths.DEFAULTS_DIR, name + '.json'), 'utf8'))[name] || {}; } catch (e) { return {}; }
}

function apps() {
  const fromHooks = {};
  require('./plugins').hook('apps').forEach(function (a) { if (a && typeof a === 'object') Object.assign(fromHooks, a); });
  const user = (get('apps').apps) || {};
  const defaults = fileFor('apps') === path.join(paths.DEFAULTS_DIR, 'apps.json') ? {} : defaultSection('apps');
  return Object.assign({}, defaults, entriesIn(paths.DEFAULTS_DIR, 'apps'), fromPlugins('apps'), user, entriesIn(paths.CONFIG_DIR, 'apps'), fromHooks);
}

function commands() {
  const user = (get('commands').commands) || {};
  const defaults = fileFor('commands') === path.join(paths.DEFAULTS_DIR, 'commands.json') ? {} : defaultSection('commands');
  return Object.assign({}, defaults, entriesIn(paths.DEFAULTS_DIR, 'commands'), fromPlugins('commands'), user, entriesIn(paths.CONFIG_DIR, 'commands'));
}

function fromPlugins(kind) {
  const out = {};
  pluginDirs().forEach(function (dir) { Object.assign(out, entriesIn(dir, kind)); });
  return out;
}

function findTile(pageId, tileId) {
  const d = dock();
  for (let i = 0; i < d.pages.length; i++) {
    if (d.pages[i].id !== pageId) continue;
    const tiles = d.pages[i].tiles;
    for (let j = 0; j < tiles.length; j++) if (tiles[j].id === tileId) return tiles[j];
  }
  return null;
}

function pluginStamp() {
  return require('./plugins').hook('stamp').filter(function (s) { return s !== undefined && s !== null; }).join('.');
}

function dirsStamp() {
  const parts = [];
  [paths.DEFAULTS_DIR, paths.CONFIG_DIR].concat(pluginDirs()).forEach(function (base) {
    DIR_KINDS.forEach(function (kind) {
      readDir(base, kind);
      parts.push((dirCache[path.join(base, kind)] || {}).stamp || '');
    });
  });
  return require('crypto').createHash('sha1').update(parts.join('#')).digest('hex').slice(0, 8);
}

function version() {
  return FILES.map(function (name) {
    get(name);
    return cache[name] ? Math.round(cache[name].mtime) : 0;
  }).concat([pluginStamp(), dirsStamp()]).join('-');
}

function saveLayout(tabs, home, tiles) {
  const all = normalizeDock(withSources(mergedDock()), {});
  const ids = {};
  all.pages.forEach(function (p) { ids[p.id] = p; });
  tabs = (Array.isArray(tabs) ? tabs : []).map(String).filter(function (id, i, a) { return ids[id] && a.indexOf(id) === i; });
  if (!tabs.length) throw Object.assign(new Error('Serve almeno una pagina nella barra'), { code: 'BAD_REQUEST' });
  if (tabs.length > 10) throw Object.assign(new Error('Al massimo 10 pagine nella barra: sul tablet non ci starebbero'), { code: 'BAD_REQUEST' });
  home = ids[home] ? String(home) : tabs[0];
  const previous = get('layout') || {};
  let outTiles = previous.tiles && typeof previous.tiles === 'object' ? Object.assign({}, previous.tiles) : {};
  if (tiles && typeof tiles === 'object') {
    Object.keys(tiles).forEach(function (pageId) {
      const page = ids[pageId];
      const t = tiles[pageId];
      if (!page || !page.editable || !t) return;
      const known = {};
      page.allTiles.forEach(function (x) { if (!x.widget) known[x.id] = true; });
      const clean = function (list) { return (Array.isArray(list) ? list : []).map(String).filter(function (id, i, a) { return known[id] && a.indexOf(id) === i; }); };
      const show = clean(t.show);
      const hide = clean(t.hide).filter(function (id) { return show.indexOf(id) < 0; });
      if (!show.length) throw Object.assign(new Error('La pagina ' + page.title + ' deve avere almeno un pulsante'), { code: 'BAD_REQUEST' });
      if (show.length > 48) throw Object.assign(new Error('Troppi pulsanti nella pagina ' + page.title), { code: 'BAD_REQUEST' });
      const old = outTiles[pageId] || {};
      const keep = function (list) { return (Array.isArray(list) ? list : []).filter(function (id) { return !known[id]; }); };
      outTiles[pageId] = { show: show.concat(keep(old.show)), hide: hide.concat(keep(old.hide)) };
    });
  }
  const data = { tabs: tabs, home: home };
  if (Object.keys(outTiles).length) data.tiles = outTiles;
  if (previous.homePage) data.homePage = previous.homePage;
  writeLayout(data);
  return dock();
}

function writeLayout(data) {
  const file = path.join(paths.CONFIG_DIR, 'layout.json');
  if (!fs.existsSync(paths.CONFIG_DIR)) fs.mkdirSync(paths.CONFIG_DIR, { recursive: true });
  const text = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(file + '.tmp', text);
  fs.renameSync(file + '.tmp', file);
}

function saveHome(h) {
  const data = Object.assign({}, get('layout') || {});
  if (h === null) delete data.homePage;
  else data.homePage = require('./home').clean(h);
  writeLayout(data);
  return dock();
}

function resetLayout() {
  const file = path.join(paths.CONFIG_DIR, 'layout.json');
  try { fs.unlinkSync(file); } catch (e) { }
  return dock();
}

function getErrors() {
  FILES.forEach(get);
  return Object.keys(errors).map(function (k) { return errors[k]; });
}

module.exports = {
  FILES: FILES,
  stripJsonComments: stripJsonComments,
  parseJson: parseJson,
  ensureUserConfig: ensureUserConfig,
  upgradeUserConfig: upgradeUserConfig,
  fingerprint: fingerprint,
  get: get,
  dock: dock,
  tabletDock: tabletDock,
  apps: apps,
  commands: commands,
  defaultDock: defaultDock,
  missingPages: function () { return Object.keys(missingPages); },
  normalizeDock: normalizeDock,
  autoGrid: autoGrid,
  currentOs: currentOs,
  findTile: findTile,
  saveLayout: saveLayout,
  saveHome: saveHome,
  resetLayout: resetLayout,
  version: version,
  errors: getErrors
};
