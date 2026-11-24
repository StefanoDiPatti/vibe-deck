const os = require('os');
const path = require('path');
require('./env').loadEnv();

const express = require('express');
const paths = require('./paths');
const log = require('./log');
const config = require('./config');
const auth = require('./auth');
const platform = require('./platform');
const actions = require('./actions');
const system = require('./services/system');
const media = require('./services/media');
const bridge = require('./services/bridge');
const voice = require('./services/voice');
const appsState = require('./services/apps');
const pairing = require('./services/pairing');
const configCheck = require('./check');
const plugins = require('./plugins');
const home = require('./home');
const shapes = require('./shapes');
const pkg = require('../package.json');

const PORT = parseInt(process.env.PORT, 10) || 8787;
const HOST = process.env.HOST || '0.0.0.0';

config.ensureUserConfig();
config.upgradeUserConfig().forEach(function (f) { log.info('config', f + ' aggiornato alla nuova versione predefinita (non era stato modificato)'); });

const app = express();
app.disable('x-powered-by');
app.use(auth.lanOnly);
app.use(express.json({ limit: '64kb' }));

function ok(res, data) { res.json({ ok: true, data: data === undefined ? null : data }); }
const sendError = require('./http-error').sendError;
function route(fn) {
  return function (req, res) {
    Promise.resolve().then(function () { return fn(req, res); }).then(function (data) {
      if (!res.headersSent) ok(res, data);
    }).catch(function (e) {
      if (!e.code) log.error('api', req.method + ' ' + req.path + ': ' + (e.stack || e.message));
      if (!res.headersSent) sendError(res, e);
    });
  };
}
function badRequest(msg) { return Object.assign(new Error(msg), { code: 'BAD_REQUEST' }); }

app.use(auth.tokenFromQuery);
app.get('/api/health', function (req, res) {
  ok(res, { name: 'vibe-deck', version: pkg.version, platform: platform.name, paired: auth.isAuthorized(req) });
});
app.post('/api/pair', auth.pairHandler);

let buildCache = { at: 0, value: '' };
function clientBuild() {
  if (Date.now() - buildCache.at < 3000) return buildCache.value;
  const fs = require('fs');
  let max = 0;
  ['index.html', 'css', 'js'].forEach(function (p) {
    const full = path.join(paths.PUBLIC_DIR, p);
    try {
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        fs.readdirSync(full).forEach(function (f) { max = Math.max(max, fs.statSync(path.join(full, f)).mtimeMs); });
      } else max = Math.max(max, st.mtimeMs);
    } catch (e) { }
  });
  plugins.scripts().concat(plugins.styles()).forEach(function (s) { max = Math.max(max, s.mtime); });
  buildCache = { at: Date.now(), value: Math.round(max).toString(36) };
  return buildCache.value;
}

function versionedIndex() {
  const fs = require('fs');
  const html = fs.readFileSync(path.join(paths.PUBLIC_DIR, 'index.html'), 'utf8')
    .replace('<head>', '<head>\n  <meta name="dock-build" content="' + clientBuild() + '">');
  return html.replace(/(src|href)="((?:js|css)\/[^"?]+)"/g, function (m, attr, file) {
    let v = '0';
    try { v = Math.round(fs.statSync(path.join(paths.PUBLIC_DIR, file)).mtimeMs).toString(36); } catch (e) { }
    return attr + '="' + file + '?v=' + v + '"';
  }).replace('<script src="js/app.js', function (m) {
    return plugins.scripts().map(function (s) {
      return '<script src="' + s.url + '?v=' + Math.round(s.mtime).toString(36) + '"></script>\n  ';
    }).join('') + m;
  }).replace('<script id="theme-boot">', function (m) {
    return plugins.styles().map(function (s) {
      return '<link rel="stylesheet" href="' + s.url + '?v=' + Math.round(s.mtime).toString(36) + '">\n  ';
    }).join('') + m;
  });
}
app.get(['/', '/index.html'], function (req, res) {
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.type('html').send(versionedIndex());
});
app.use(express.static(paths.PUBLIC_DIR, {
  index: false,
  setHeaders: function (res) {
    res.setHeader('Cache-Control', 'no-cache');
  }
}));

const pluginThemeCache = {};
function pluginThemeCss(theme) {
  const fs = require('fs');
  const styles = plugins.styles();
  const stamp = styles.map(function (s) { return s.path + ':' + s.mtime; }).join('|');
  const hit = pluginThemeCache[theme];
  if (hit && hit.stamp === stamp) return hit.css;
  const themes = require('../scripts/build-themes');
  const css = styles.map(function (s) {
    try { return themes.themeRules(fs.readFileSync(s.path, 'utf8'), theme); } catch (e) { log.warn('plugin', s.plugin + '/' + s.file + ': ' + e.message); return ''; }
  }).filter(Boolean).join('\n') + '\n';
  pluginThemeCache[theme] = { stamp: stamp, css: css };
  return css;
}
app.get('/plugins-theme/:file', function (req, res) {
  const m = /^([a-z]+)\.css$/.exec(req.params.file);
  if (!m || require('../scripts/build-themes').THEMES.indexOf(m[1]) < 0) return res.status(404).end();
  res.setHeader('Cache-Control', 'no-cache');
  res.type('css').send(pluginThemeCss(m[1]));
});

app.get('/plugins-lang/:file', function (req, res) {
  const m = /^([a-z]{2})\.js$/.exec(req.params.file);
  if (!m) return res.status(404).end();
  res.setHeader('Cache-Control', 'no-cache');
  res.type('application/javascript').send(plugins.langScript(plugins.dictionary(m[1])));
});

app.get('/plugins/:name/:file', function (req, res) {
  const name = req.params.name, file = req.params.file;
  if (!plugins.NAME_RE.test(name) || plugins.names().indexOf(name) < 0 || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(js|css)$/.test(file)) return res.status(404).end();
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(plugins.dirOf(name), 'public', file), function (err) { if (err && !res.headersSent) res.status(404).end(); });
});

function bridgeOnly(req, res, next) {
  const ip = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  if ((ip === '127.0.0.1' || ip === '::1') && req.get('x-dock-bridge') === '1') return next();
  res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Solo per l\'estensione su questo PC' } });
}
app.post('/api/bridge/state', bridgeOnly, function (req, res) {
  const b = req.body || {};
  ok(res, { commands: bridge.update(String(b.key || ''), b.state) });
});
app.post('/api/bridge/closed', bridgeOnly, function (req, res) {
  bridge.remove(String((req.body || {}).key || ''));
  ok(res, null);
});

function isLoopback(req) {
  const ip = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  return ip === '127.0.0.1' || ip === '::1';
}
function localPage(req, res, next) {
  if (isLoopback(req)) return next();
  res.status(403).type('text').send('Il pannello di controllo si apre solo sul PC della dock.');
}
function controlOnly(req, res, next) {
  if (isLoopback(req) && req.get('x-dock-control') === '1') return next();
  res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Solo dal pannello di controllo su questo PC' } });
}
function assetUrl(s) { return '/' + s.url + '?v=' + Math.round(s.mtime).toString(36); }
app.get(['/control', '/control/'], localPage, function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const list = plugins.scripts();
  let html = require('fs').readFileSync(path.join(paths.CONTROL_DIR, 'index.html'), 'utf8');
  const before = list.length ? '<script src="/js/core.js"></script>\n  <script>window.Widgets = window.Widgets || { register: function () {}, helpers: {} }; window.I18n = window.I18n || { add: function () {}, rules: function () {}, t: function (s) { return s; }, lang: function () { return "it"; } };</script>\n  ' +
    list.map(function (s) { return '<script src="' + assetUrl(s) + '"></script>\n  '; }).join('') : '';
  const after = plugins.controlScripts().map(function (s) { return '\n  <script src="' + assetUrl(s) + '"></script>'; }).join('');
  const css = plugins.controlStyles().map(function (s) { return '  <link rel="stylesheet" href="' + assetUrl(s) + '">\n'; }).join('');
  html = html.replace('<script src="/control/control.js"></script>', function (m) { return before + m + after; });
  res.type('html').send(html.replace('</head>', function (m) { return css + m; }));
});
app.get('/plugins/:name/control/:file', localPage, function (req, res) {
  const name = req.params.name, file = req.params.file;
  if (!plugins.NAME_RE.test(name) || plugins.names().indexOf(name) < 0 || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(js|css)$/.test(file)) return res.status(404).end();
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(plugins.dirOf(name), 'control', file), function (err) { if (err && !res.headersSent) res.status(404).end(); });
});
app.use('/control', localPage, express.static(paths.CONTROL_DIR, { index: false, setHeaders: function (res) { res.setHeader('Cache-Control', 'no-cache'); } }));

const WIDGET_NAMES = { system: 'stato PC', nowplaying: 'musica', queue: 'coda', clock: 'orologio' };
function pageSummary(p) {
  const widgets = [], buttons = [];
  const labels = plugins.widgetLabels();
  p.tiles.forEach(function (t) {
    if (t.widget) widgets.push(WIDGET_NAMES[t.widget] || labels[t.widget] || t.widget);
    else if (t.label) buttons.push(t.label);
  });
  let auto = '';
  if (widgets.length) auto = widgets.join(', ');
  if (buttons.length) auto += (auto ? ' + ' : '') + buttons.length + ' pulsanti (' + buttons.slice(0, 4).join(', ') + (buttons.length > 4 ? '…' : '') + ')';
  return { id: p.id, title: p.title, icon: p.icon, tab: p.tab, description: p.description || auto, contents: auto };
}
function pageButtons(p) {
  const btn = function (t) { return { id: t.id, label: t.label || '', sub: t.sub || '', icon: t.icon || null, color: t.color || null, w: t.w || 1, h: t.h || 1 }; };
  const isBtn = function (t) { return !t.widget; };
  const fixed = p.allTiles.filter(function (t) { return t.widget; }).map(function (t) { return { label: t.label || t.widget.toUpperCase(), w: t.w || 1 }; });
  return { id: p.id, title: p.title, icon: p.icon, columns: p.columns, rows: p.rows, fixed: fixed, grid: !!p.buttonGrid, widgetWidth: p.widgetWidth || 0.5, all: p.allTiles.filter(isBtn).map(btn), shown: p.tiles.filter(isBtn).map(function (t) { return t.id; }) };
}
function homeEditor(d) {
  const main = d.pages.filter(function (p) { return p.id === home.HOME_ID; })[0];
  const saved = home.fromLayout(config.get('layout'));
  let tiles;
  if (saved) tiles = saved.tiles;
  else {
    const list = main ? main.tiles.filter(function (t) { return t.widget && home.catalogId(t); })
      .map(function (t) { return { id: home.catalogId(t), x: t.x, y: t.y, w: t.w, h: t.h }; }) : [];
    const p = home.pack(list, main ? main.columns : 6, main ? main.rows : 4);
    tiles = p.placed.map(function (x) { return Object.assign({}, list[x.index], { x: x.x, y: x.y, w: x.w, h: x.h }); });
  }
  return {
    catalog: home.catalog(),
    limits: home.LIMITS,
    custom: !!saved,
    columns: main ? main.columns : 6,
    rows: main ? main.rows : 4,
    tiles: tiles,
    buttons: main && !saved ? main.tiles.filter(function (t) { return !t.widget; }).length : 0
  };
}
function safeCheck() {
  try { return configCheck.run(); } catch (e) { return [{ level: 'error', where: 'controllo', message: e.message }]; }
}

function controlInfo() {
  const d = config.dock();
  let urls = [];
  try { urls = JSON.parse(require('fs').readFileSync(path.join(paths.DATA_DIR, 'runtime.json'), 'utf8')).urls || []; } catch (e) { urls = []; }
  return {
    pages: d.pages.map(pageSummary),
    buttons: d.pages.filter(function (p) { return p.editable; }).map(pageButtons),
    tabs: d.pages.filter(function (p) { return p.tab; }).map(function (p) { return p.id; }),
    plugins: plugins.info(),
    homeEditor: homeEditor(d),
    home: d.home,
    custom: !!(config.get('layout') || {}).tabs,
    tablet: urls,
    pairing: pairing.links(PORT),
    checks: safeCheck(),
    ...plugins.controlInfo(),
    configErrors: config.errors(),
    version: pkg.version,
    platform: platform.name
  };
}
app.get('/api/control/qr', controlOnly, route(async function (req) {
  const link = String(req.query.link || '');
  const ok = pairing.links(PORT).some(function (l) { return l.link === link; });
  if (!ok) throw Object.assign(new Error('Link sconosciuto'), { code: 'BAD_REQUEST' });
  return { link: link, svg: await pairing.svg(link) };
}));
app.get('/api/control/info', controlOnly, route(async function () { await plugins.controlPrepare(); return controlInfo(); }));
app.get('/api/control/catalog', controlOnly, route(function () { return require('./shapes/catalog').catalog(); }));
app.post('/api/control/shapes/sample', controlOnly, route(function (req) {
  const b = req.body || {};
  return shapes.sample(b.plugin, b.source, { allowHost: b.allowHost === true });
}));
app.post('/api/control/shapes/preview', controlOnly, route(function (req) {
  const b = req.body || {};
  return shapes.preview(b.plugin, b.def, b.id, { allowHost: b.allowHost === true });
}));
const widgetStore = require('./shapes/store').store;
app.get('/api/control/widgets', controlOnly, route(function () { return widgetStore.list(); }));
app.post('/api/control/widgets', controlOnly, route(function (req) {
  const b = req.body || {};
  return widgetStore.save(b.plugin, b.id, b.def, { allowHost: b.allowHost === true, overwrite: b.overwrite === true });
}));
app.delete('/api/control/widgets/:plugin/:id', controlOnly, route(function (req) {
  return widgetStore.remove(req.params.plugin, req.params.id);
}));
app.post('/api/control/layout', controlOnly, route(function (req) {
  const b = req.body || {};
  config.saveLayout(b.tabs, b.home, b.tiles);
  log.info('control', 'pagine del tablet: ' + b.tabs.join(', '));
  return controlInfo();
}));
app.post('/api/control/layout/reset', controlOnly, route(function () { config.resetLayout(); return controlInfo(); }));
app.post('/api/control/home', controlOnly, route(function (req) {
  config.saveHome(req.body || {});
  log.info('control', 'HOME: ' + (req.body.tiles || []).map(function (t) { return (t.id || t.widget) + ' ' + t.w + 'x' + t.h; }).join(', '));
  return controlInfo();
}));
app.post('/api/control/home/reset', controlOnly, route(function () { config.saveHome(null); return controlInfo(); }));

plugins.setControl({ only: controlOnly, info: controlInfo });
plugins.mountControl(app, express, localPage);

app.use('/api', auth.requireToken);

function tabletPower() {
  const t = (config.get('services') || {}).tablet || {};
  const num = function (v, min, max, def) { const n = Number(v); return isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };
  return {
    idleAfterSec: num(t.idleAfterSec, 10, 3600, 60),
    pollSec: num(t.pollSec, 1, 30, 3),
    idlePollSec: num(t.idlePollSec, 2, 300, 15),
    sleepAfterMin: num(t.sleepAfterMin, 0, 240, 10)
  };
}
app.get('/api/config', route(function () {
  return {
    version: config.version(),
    dock: config.tabletDock(),
    capabilities: platform.capabilities(),
    power: tabletPower(),
    platform: platform.name,
    hostname: os.hostname(),
    errors: config.errors()
  };
}));

app.get('/api/state', route(async function () {
  const [now, running] = await Promise.all([media.nowPlaying(), appsState.running()]);
  return { version: config.version(), build: clientBuild(), system: system.get(), media: now, apps: running, time: Date.now() };
}));

app.get('/api/shapes/:plugin/:id', route(function (req) {
  return shapes.view(req.params.plugin, req.params.id);
}));
app.post('/api/shapes/:plugin/:id/tap', route(function (req) {
  return shapes.tap(req.params.plugin, req.params.id, (req.body || {}).index);
}));
app.post('/api/shapes/:plugin/:id/set', route(function (req) {
  return shapes.set(req.params.plugin, req.params.id, (req.body || {}).value);
}));
app.post('/api/shapes/:plugin/:id/voice', route(function (req) {
  return shapes.voice(req.params.plugin, req.params.id, (req.body || {}).text);
}));

app.post('/api/press', route(function (req) {
  const b = req.body || {};
  if (b.version && b.version !== config.version()) {
    throw Object.assign(new Error('Configurazione aggiornata, ricarico...'), { code: 'CONFIG_CHANGED' });
  }
  if (typeof b.page !== 'string' || typeof b.tile !== 'string') throw badRequest('page e tile richiesti');
  return actions.press(b.page, b.tile);
}));

app.post('/api/media', route(function (req) {
  const b = req.body || {};
  return media.command(String(b.command || ''), b.value);
}));
app.get('/api/media/queue', route(function () { return media.queue(); }));

app.get('/api/media/art', function (req, res) {
  media.artwork().then(function (art) {
    if (!art) return res.status(404).end();
    res.setHeader('Content-Type', art.mime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.end(art.data);
  }).catch(function () { res.status(404).end(); });
});

app.post('/api/remote/type', route(async function (req) {
  const b = req.body || {};
  const text = String(b.text || '');
  if (!text.trim()) throw badRequest('Testo vuoto');
  if (text.length > 8000) throw badRequest('Testo troppo lungo');
  if (b.focus) await platform.focus(String(b.focus));
  await platform.typeText(text);
  if (b.enter) await platform.sendKeys(['ENTER']);
  return { message: b.enter ? 'Inviato sul PC' : 'Scritto sul PC' };
}));

app.post('/api/voice', express.raw({ type: function () { return true; }, limit: '25mb' }), route(function (req) {
  return voice.transcribe(req.body, req.get('content-type'));
}));

plugins.mountRoutes(app, express);

app.use('/api', function (req, res) {
  res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Endpoint inesistente' } });
});

const lanAddresses = pairing.lanAddresses;

function banner() {
  const ips = lanAddresses();
  const token = (process.env.DOCK_TOKEN || '').trim();
  const line = '─'.repeat(52);
  console.log('\n' + line);
  console.log('  VIBE DECK ' + pkg.version + '   (' + platform.name + ', porta ' + PORT + ')');
  console.log(line);
  if (!ips.length) console.log('  Nessuna rete locale trovata: il tablet non potrà collegarsi.');
  ips.forEach(function (ip, i) {
    const url = 'http://' + ip.address + ':' + PORT;
    console.log((i === 0 ? '  Apri sul tablet:  ' : '  oppure:          ') + url + '   (' + ip.name + ')');
  });
  if (token) {
    console.log('  Codice di accesso: ' + token);
    if (ips[0]) console.log('  Link diretto (salva il codice):  http://' + ips[0].address + ':' + PORT + '/?t=' + token);
    if (ips[0] && process.stdout.isTTY && process.env.DOCK_SERVICE !== '1' && process.env.DOCK_NO_QR !== '1') {
      try {
        console.log('\n  Inquadra con il telefono o il tablet:');
        console.log(pairing.terminal(pairing.links(PORT)[0].link, '  '));
      } catch (e) { log.debug('server', 'QR non stampato: ' + e.message); }
    }
  } else {
    console.log('  ATTENZIONE: DOCK_TOKEN vuoto, chiunque in rete può usare la dock.');
  }
  console.log('  Pannello di controllo (solo da questo PC):  http://127.0.0.1:' + PORT + '/control');
  const caps = platform.capabilities();
  (caps.notes || []).forEach(function (n) { console.log('  Nota: ' + n); });
  config.errors().forEach(function (e) { console.log('  ERRORE CONFIG: ' + e); });
  console.log(line);
  console.log(process.env.DOCK_SERVICE === '1'
    ? '  In background: icona vicino all\'orologio per chiudere.\n'
    : '  Ctrl+C per fermare.\n');
  try {
    const fs = require('fs');
    if (!fs.existsSync(paths.DATA_DIR)) fs.mkdirSync(paths.DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(paths.DATA_DIR, 'runtime.json'), JSON.stringify({
      port: PORT,
      urls: ips.map(function (ip) { return 'http://' + ip.address + ':' + PORT; }),
      startedAt: new Date().toISOString(),
      pid: process.pid
    }, null, 2));
  } catch (e) { log.warn('server', 'runtime.json non scritto: ' + e.message); }
}

const EXIT_PORT_IN_USE = 3;

function start() {
  return platform.init().catch(function (e) {
    log.error('platform', 'avvio backend ' + platform.name + ' non riuscito: ' + e.message);
  }).then(function () {
    return new Promise(function (resolve, reject) {
      const server = app.listen(PORT, HOST, function () {
        banner();
        safeCheck().filter(function (x) { return x.level === 'error'; }).forEach(function (x) { log.warn('config', x.where + ': ' + x.message); });
        plugins.hook('start');
        resolve(server);
      });
      server.keepAliveTimeout = 65000;
      server.headersTimeout = 66000;
      server.on('error', function (e) {
        if (e.code === 'EADDRINUSE') log.error('server', 'La porta ' + PORT + ' è già in uso: la dock è già avviata? (cambia PORT nel .env)');
        reject(e);
      });
    });
  });
}

function shutdown() {
  system.stop();
  plugins.hook('stop');
  platform.shutdown();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (require.main === module) {
  start().catch(function (e) { process.exit(e && e.code === 'EADDRINUSE' ? EXIT_PORT_IN_USE : 1); });
}

module.exports = { app: app, start: start };
