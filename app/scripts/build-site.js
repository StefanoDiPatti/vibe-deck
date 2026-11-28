'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..', '..');
const APP = path.join(REPO, 'app');
const SHOTS = ['tablet-main.png', 'tablet-audio-neon.png', 'tablet-github-brutal-en.png', 'tablet-claude.png', 'pannello-neon.png'];
const PREVIEW_JS = ['core.js', 'i18n.js', 'icons.js', 'widgets.js', 'shapes.js', 'shape-preview.js'];
const CORE_MODULES = ['registry', 'template', 'shapes', 'fields'];

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyDir(from, to) {
  fs.readdirSync(from, { withFileTypes: true }).forEach(function (d) {
    if (d.isDirectory()) copyDir(path.join(from, d.name), path.join(to, d.name));
    else copy(path.join(from, d.name), path.join(to, d.name));
  });
}

function writeJson(OUT, rel, data) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data) + '\n');
}

function bundleShapesCore() {
  const parts = CORE_MODULES.map(function (n) {
    const src = fs.readFileSync(path.join(APP, 'server', 'shapes', n + '.js'), 'utf8');
    return JSON.stringify('./' + n) + ': function (module, exports, require) {\n' + src + '\n}';
  });
  return '(function () {\n\'use strict\';\nconst defs = {\n' + parts.join(',\n') + '\n};\nconst cache = {};\n' +
    'function load(name) {\n  if (cache[name]) return cache[name].exports;\n  const module = { exports: {} };\n  cache[name] = module;\n' +
    '  defs[name](module, module.exports, load);\n  return module.exports;\n}\n' +
    'window.ShapesCore = { shapes: load(\'./shapes\'), template: load(\'./template\'), fields: load(\'./fields\') };\n})();\n';
}

function dockData() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-site-'));
  const script = [
    'const plugins = require(' + JSON.stringify(path.join(APP, 'server', 'plugins')) + ');',
    'const catalog = require(' + JSON.stringify(path.join(APP, 'server', 'shapes', 'catalog')) + ').catalog("en");',
    'const fs = require("fs"); const path = require("path");',
    'const list = plugins.manifests().filter(function (m) { return m.official; });',
    'function count(dir, sub) { try { return fs.readdirSync(path.join(dir, sub)).filter(function (f) { return /\\.json$/.test(f); }).length; } catch (e) { return 0; } }',
    'function home(dir) { try { const h = JSON.parse(fs.readFileSync(path.join(dir, "home.json"), "utf8")); return Object.keys(h).filter(function (k) { return h[k] && h[k].catalog !== false; }).length; } catch (e) { return 0; } }',
    'function raw(dir) { try { return JSON.parse(fs.readFileSync(path.join(dir, "plugin.json"), "utf8")); } catch (e) { return {}; } }',
    'const out = list.map(function (m) { const dir = plugins.dirOf(m.id); const r = raw(dir); return { id: m.id, name: m.name, description: m.description, author: m.author, version: m.version, icon: m.icon, type: m.type, includes: m.includes, platforms: m.platforms, tags: Array.isArray(r.tags) ? r.tags : [], pages: count(dir, "pages"), widgets: home(dir) + count(dir, "widgets"), code: fs.existsSync(path.join(dir, "index.js")) }; });',
    'out.forEach(function (p) { if (p.type === "pack") p.includes.forEach(function (n) { const x = out.filter(function (o) { return o.id === n; })[0]; if (x) { x.pack = p.id; if (!x.tags.length) x.tags = p.tags.slice(); } }); });',
    'process.stdout.write(JSON.stringify({ official: out, catalog: catalog, version: require(' + JSON.stringify(path.join(APP, 'package.json')) + ').version }));',
    'process.exit(0);'
  ].join('\n');
  const env = Object.assign({}, process.env, { DOCK_CONFIG_DIR: path.join(tmp, 'config'), DOCK_DATA_DIR: path.join(tmp, 'data'), DOCK_PLUGINS_DIR: path.join(tmp, 'plugins'), LOG_LEVEL: 'error', DOCK_NO_QR: '1' });
  try {
    return JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: APP, env: env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function build(target) {
  const OUT = path.resolve(target || path.join(REPO, '_site'));
  fs.rmSync(OUT, { recursive: true, force: true });
  copyDir(path.join(REPO, 'site'), OUT);
  copy(path.join(APP, 'public', 'js', 'icons.js'), path.join(OUT, 'js', 'icons.js'));
  SHOTS.forEach(function (f) { copy(path.join(REPO, 'docs', 'screenshots', f), path.join(OUT, 'screenshots', f)); });
  const pv = path.join(OUT, 'preview');
  copy(path.join(APP, 'public', 'shape-preview.html'), path.join(pv, 'index.html'));
  PREVIEW_JS.forEach(function (f) { copy(path.join(APP, 'public', 'js', f), path.join(pv, 'js', f)); });
  copy(path.join(APP, 'public', 'css', 'dock.css'), path.join(pv, 'css', 'dock.css'));
  copyDir(path.join(APP, 'public', 'css', 'themes'), path.join(pv, 'css', 'themes'));
  copyDir(path.join(APP, 'public', 'fonts'), path.join(pv, 'fonts'));
  fs.writeFileSync(path.join(OUT, 'js', 'shapes-core.js'), bundleShapesCore());
  const data = dockData();
  writeJson(OUT, 'data/official.json', { version: data.version, plugins: data.official });
  writeJson(OUT, 'data/catalog.json', data.catalog);
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
  return OUT;
}

if (require.main === module) console.log('Sito pronto in ' + build(process.argv[2]));

module.exports = { build: build, bundleShapesCore: bundleShapesCore };
