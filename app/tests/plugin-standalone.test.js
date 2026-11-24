const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-standalone-'));
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.DOCK_PLUGINS_DIR = path.join(tmp, 'plugins');
process.env.LOG_LEVEL = 'error';

const APP = path.join(__dirname, '..');
const OFFICIAL = path.join(APP, 'official-plugins');
const DEFAULTS = path.join(APP, 'config', 'defaults');
const parse = require('../server/config').parseJson;
const check = require('../server/check');
const actions = require('../server/actions');

function json(file) { return parse(fs.readFileSync(file, 'utf8')); }
function jsonFiles(dir) {
  try { return fs.readdirSync(dir).filter(function (f) { return /\.json$/i.test(f); }).map(function (f) { return path.join(dir, f); }); } catch (e) { return []; }
}
function entries(base, kind) {
  const out = {};
  const root = path.join(base, kind + '.json');
  if (fs.existsSync(root)) Object.assign(out, json(root)[kind] || {});
  jsonFiles(path.join(base, kind)).forEach(function (f) {
    const d = json(f);
    Object.assign(out, d && d[kind] ? d[kind] : {});
  });
  return out;
}
function registered(dir, kind) {
  const re = new RegExp(kind + "\\.register\\(\\s*['\"]([A-Za-z0-9_.-]+)['\"]", 'g');
  const out = [];
  let files = [];
  try { files = fs.readdirSync(path.join(dir, 'public')).filter(function (f) { return /\.js$/i.test(f); }); } catch (e) { files = []; }
  files.forEach(function (f) {
    const text = fs.readFileSync(path.join(dir, 'public', f), 'utf8');
    let m;
    while ((m = re.exec(text))) out.push(m[1]);
  });
  return out;
}

const corePages = jsonFiles(path.join(DEFAULTS, 'pages')).map(function (f) { return json(f).id || path.basename(f, '.json'); });
const coreApps = entries(DEFAULTS, 'apps');
const coreCommands = entries(DEFAULTS, 'commands');
const coreTypes = actions.BUILTIN.concat(['page']);

const plugins = fs.readdirSync(OFFICIAL).filter(function (n) { return json(path.join(OFFICIAL, n, 'plugin.json')).type !== 'pack'; });

plugins.forEach(function (name) {
  test('official plugin "' + name + '" works on its own: it only uses the core and itself', function () {
    const dir = path.join(OFFICIAL, name);
    const apps = Object.assign({}, coreApps, entries(dir, 'apps'));
    const commands = Object.assign({}, coreCommands, entries(dir, 'commands'));
    const widgets = check.WIDGETS.concat(registered(dir, 'Widgets'));
    const pages = corePages.concat(jsonFiles(path.join(dir, 'pages')).map(function (f) { return json(f).id || path.basename(f, '.json'); }));
    let types = coreTypes.slice();
    const main = path.join(dir, 'index.js');
    if (fs.existsSync(main)) {
      const acts = require(main).actions || {};
      Object.keys(acts).forEach(function (k) { types.push(k === name ? name : name + '.' + k); });
    }
    const bad = [];
    function act(a, where) {
      if (!a) return;
      if (types.indexOf(a.type) < 0) bad.push(where + ': action type ' + a.type);
      if (a.type === 'launch' && !apps[a.app]) bad.push(where + ': app ' + a.app);
      if (a.type === 'command' && !commands[a.id]) bad.push(where + ': command ' + a.id);
      if (a.type === 'page' && pages.indexOf(a.page) < 0) bad.push(where + ': page ' + a.page);
      (a.steps || []).forEach(function (s) { act(s, where); });
    }
    jsonFiles(path.join(dir, 'pages')).forEach(function (f) {
      const p = json(f);
      (p.tiles || []).forEach(function (t) {
        if (t.plugin && t.plugin !== name) return;
        const where = path.basename(f) + ' > ' + (t.label || t.id || t.widget);
        if (t.widget && widgets.indexOf(t.widget) < 0) bad.push(where + ': widget ' + t.widget);
        act(t.action, where);
        ['windows', 'linux'].forEach(function (o) { if (t[o]) act(t[o].action, where + ' (' + o + ')'); });
      });
    });
    const home = path.join(dir, 'home.json');
    if (fs.existsSync(home)) {
      const h = json(home);
      Object.keys(h).forEach(function (id) {
        if (h[id] === false) return;
        const w = h[id].widget || id;
        if (registered(dir, 'Widgets').indexOf(w) < 0) bad.push('home.json > ' + id + ': widget ' + w + ' not registered by this plugin');
      });
    }
    assert.deepStrictEqual(bad, []);
  });
});

test('every official plugin is in at most one pack, and packs only suggest plugins', function () {
  const seen = {};
  fs.readdirSync(OFFICIAL).forEach(function (n) {
    const m = json(path.join(OFFICIAL, n, 'plugin.json'));
    if (m.type !== 'pack') return;
    m.includes.forEach(function (p) {
      assert.ok(plugins.indexOf(p) >= 0, n + ' includes ' + p);
      assert.ok(!seen[p], p + ' is in both ' + seen[p] + ' and ' + n);
      seen[p] = n;
    });
  });
});

test('the HOME catalog offers the same widgets as before the move to plugins', function () {
  const offered = [];
  plugins.forEach(function (name) {
    const home = path.join(OFFICIAL, name, 'home.json');
    if (!fs.existsSync(home)) return;
    const h = json(home);
    Object.keys(h).forEach(function (id) { if (h[id] !== false && h[id].catalog !== false) offered.push(id); });
  });
  const core = require('../server/home').CATALOG.map(function (c) { return c.id; });
  assert.deepStrictEqual(core.concat(offered).sort(), ['audio', 'claudeusage', 'clock', 'desks', 'discordmini', 'games', 'github', 'lol', 'mail', 'nowplaying', 'obs', 'ollama', 'system', 'todo', 'twitch', 'viber-projects', 'viber-tasks']);
});

test('every widget of an official plugin is in its home.json, offered or turned off with false', function () {
  plugins.forEach(function (name) {
    const dir = path.join(OFFICIAL, name);
    const home = fs.existsSync(path.join(dir, 'home.json')) ? json(path.join(dir, 'home.json')) : {};
    const listed = {};
    Object.keys(home).forEach(function (id) { listed[home[id] === false ? id : (home[id].widget || id)] = true; });
    Object.keys(home).forEach(function (id) { if (home[id] !== false) assert.ok(typeof home[id].label === 'string', name + '/home.json > ' + id + ': label'); });
    registered(dir, 'Widgets').forEach(function (w) { assert.ok(listed[w], name + ': widget ' + w + ' missing from home.json'); });
  });
});
