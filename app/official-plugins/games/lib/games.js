const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const paths = require('../../../server/paths');
const log = require('../../../server/log');

const FILE = path.join(paths.DATA_DIR, 'games.json');
const ICON_DIR = path.join(paths.DATA_DIR, 'game-icons');
const PS_SCRIPT = path.join(__dirname, '..', 'platform', 'windows-games.ps1');
const MAX_ICON = 3 * 1024 * 1024;
const MAX_GAMES = 24;
const UA = 'VibeDeck/2 (https://github.com/StefanoDiPatti/vibe-deck)';

let store = null;

function fail(msg, code) { return Object.assign(new Error(msg), { code: code || 'BAD_REQUEST' }); }

function load() {
  if (store) return store;
  try { store = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { store = {}; }
  if (!Array.isArray(store.games)) store.games = [];
  return store;
}
function save() {
  if (!fs.existsSync(paths.DATA_DIR)) fs.mkdirSync(paths.DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(store, null, 2) + '\n');
  fs.renameSync(FILE + '.tmp', FILE);
}

function osKey() { return process.platform === 'win32' ? 'windows' : 'linux'; }

function apps() {
  const out = {};
  load().games.forEach(function (g) {
    if (g.os && g.os !== osKey()) return;
    const a = { label: g.label, game: true, whenRunning: 'focus' };
    if (g.process) {
      const list = String(g.process).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      a.process = list.length > 1 ? list : list[0];
    }
    a[osKey()] = { path: g.path };
    if (g.args && g.args.length) a[osKey()].args = g.args;
    out['game_' + g.id] = a;
  });
  return out;
}

function homeWidgets() {
  return load().games.filter(function (g) { return !g.os || g.os === osKey(); }).map(function (g) {
    return {
      id: 'game_' + g.id, widget: 'game', label: g.label, icon: 'gamepad',
      description: 'Solo ' + g.label + ': tocco = avvia (o porta davanti se è aperto)',
      w: 1, h: 1, minW: 1, minH: 1, props: { game: g.id }
    };
  });
}

function iconUrl(g) {
  return g.icon ? '/api/plugins/games/icon/' + encodeURIComponent(g.id) + '?v=' + encodeURIComponent(g.iconRev || '') : null;
}

function tiles() {
  const list = load().games.filter(function (g) { return !g.os || g.os === osKey(); });
  if (!list.length) {
    return [{ id: 'games-empty', label: 'AGGIUNGI I GIOCHI', sub: 'dal pannello di controllo sul PC', icon: 'gamepad', color: '#2a3746', action: { type: 'page', page: 'games' } }];
  }
  return list.map(function (g) {
    const t = {
      id: 'game_' + g.id,
      label: String(g.label || '').toUpperCase(),
      icon: 'gamepad',
      color: g.color || '#24313f',
      showRunning: 'game_' + g.id,
      action: { type: 'launch', app: 'game_' + g.id }
    };
    const img = iconUrl(g);
    if (img) t.image = img;
    return t;
  });
}

function run(cmd, args, timeout) {
  return new Promise(function (resolve, reject) {
    execFile(cmd, args, { windowsHide: true, timeout: timeout || 20000, maxBuffer: 4 * 1024 * 1024 }, function (e, out, errOut) {
      if (e && e.killed) return reject(fail('Tempo scaduto', 'UNAVAILABLE'));
      resolve({ code: e ? (typeof e.code === 'number' ? e.code : 1) : 0, out: String(out || ''), err: String(errOut || ''), missing: !!(e && e.code === 'ENOENT') });
    });
  });
}

async function ps(action, args, timeout) {
  const r = await run('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', PS_SCRIPT, '-Action', action].concat(args || []), timeout);
  const line = r.out.trim().split(/\r?\n/).pop() || '';
  let d;
  try { d = JSON.parse(line); } catch (e) { throw fail('PowerShell: ' + (r.err.trim() || line || 'nessuna risposta'), 'UNAVAILABLE'); }
  if (d.error) throw fail(d.error, 'UNAVAILABLE');
  return d;
}

function which(cmd) {
  const dirs = String(process.env.PATH || '').split(path.delimiter);
  for (let i = 0; i < dirs.length; i++) { if (dirs[i] && fs.existsSync(path.join(dirs[i], cmd))) return path.join(dirs[i], cmd); }
  return '';
}

async function pickFile() {
  if (process.platform === 'win32') {
    const d = await ps('pick', [], 10 * 60 * 1000);
    return { path: d.path || '' };
  }
  let r;
  if (which('kdialog')) {
    r = await run('kdialog', ['--title', 'Scegli il gioco', '--getopenfilename', os.homedir(), 'Giochi (*.desktop *.sh *.x86_64 *.AppImage *)'], 10 * 60 * 1000);
  } else if (which('zenity')) {
    r = await run('zenity', ['--file-selection', '--title=Scegli il gioco'], 10 * 60 * 1000);
  } else {
    throw fail('Per scegliere il file serve zenity o kdialog (es. sudo apt install zenity)', 'UNSUPPORTED');
  }
  return { path: r.code === 0 ? r.out.trim().split('\n')[0] : '' };
}

function desktopKey(text, key) {
  const m = new RegExp('^' + key + '=(.*)$', 'm').exec(String(text || ''));
  return m ? m[1].trim() : '';
}

async function fileInfo(file) {
  file = checkPath(file);
  if (process.platform === 'win32') {
    const d = await ps('info', ['-File', file]);
    return { path: file, label: cleanLabel(d.label || ''), process: d.process || '' };
  }
  if (/\.desktop$/i.test(file)) {
    const text = fs.readFileSync(file, 'utf8');
    const exec = desktopKey(text, 'Exec').split(/\s+/)[0] || '';
    return { path: file, label: desktopKey(text, 'Name') || path.basename(file, '.desktop'), process: path.basename(exec).toLowerCase() };
  }
  return { path: file, label: cleanLabel(path.basename(file).replace(/\.(sh|x86_64|appimage)$/i, '')), process: path.basename(file).toLowerCase() };
}

function cleanLabel(s) {
  return String(s || '').replace(/[_]+/g, ' ').replace(/\b(beta|launcher|client|services?|api|x64|win64|shipping)\b/gi, '').replace(/\s{2,}/g, ' ').trim() || String(s || '').trim();
}

function checkPath(file) {
  file = String(file || '').trim();
  if (!file || !path.isAbsolute(file)) throw fail('Scegli il file del gioco');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw fail('File non trovato: ' + file);
  return file;
}

function imageType(buf) {
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 6 && buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  return '';
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, 8000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}

async function download(url) {
  if (!/^https:\/\//i.test(url)) throw fail('Indirizzo dell\'immagine non valido');
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, 15000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw fail('Immagine non scaricata (HTTP ' + res.status + ')', 'UNAVAILABLE');
    const len = parseInt(res.headers.get('content-length') || '0', 10);
    if (len > MAX_ICON) throw fail('Immagine troppo grande');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_ICON) throw fail('Immagine troppo grande');
    if (!imageType(buf)) throw fail('Formato dell\'immagine non adatto al tablet (servono PNG, JPG o GIF)');
    return buf;
  } finally { clearTimeout(timer); }
}

async function steamIcons(name) {
  const d = await fetchJson('https://store.steampowered.com/api/storesearch/?term=' + encodeURIComponent(name) + '&l=italian&cc=IT');
  const out = [];
  (d.items || []).filter(function (it) { return relevant(it.name, name) && !/soundtrack|\bost\b|\bdlc\b|artbook/i.test(it.name); }).slice(0, 3).forEach(function (it) {
    const base = 'https://cdn.cloudflare.steamstatic.com/steam/apps/' + it.id + '/';
    out.push({ source: 'Steam', title: it.name, url: base + 'library_600x900.jpg' });
    out.push({ source: 'Steam', title: it.name, url: base + 'header.jpg' });
  });
  return out;
}

function words(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(function (w) { return w.length > 2 && ['the', 'and', 'video', 'game', 'logo'].indexOf(w) < 0; });
}
function relevant(title, name) {
  const t = words(title).join(' ');
  const w = words(name);
  return w.length > 0 && w.every(function (x) { return t.indexOf(x) >= 0; });
}
function cleanUrl(u) { return String(u || '').replace(/\?utm_[^#]*$/, ''); }

async function wikiIcons(name) {
  const out = [];
  const wp = await fetchJson('https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=4&gsrsearch=' +
    encodeURIComponent(name + ' video game') + '&prop=pageimages&piprop=thumbnail&pithumbsize=300&pilicense=any');
  Object.keys((wp.query && wp.query.pages) || {}).map(function (k) { return wp.query.pages[k]; })
    .sort(function (a, b) { return (a.index || 0) - (b.index || 0); })
    .forEach(function (p) {
      if (p.thumbnail && p.thumbnail.source && relevant(p.title, name)) out.push({ source: 'Wikipedia', title: p.title, url: cleanUrl(p.thumbnail.source) });
    });
  const cm = await fetchJson('https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=12&gsrsearch=' +
    encodeURIComponent(name + ' logo') + '&prop=imageinfo&iiprop=url|mime&iiurlwidth=256');
  Object.keys((cm.query && cm.query.pages) || {}).map(function (k) { return cm.query.pages[k]; })
    .sort(function (a, b) { return (a.index || 0) - (b.index || 0); })
    .forEach(function (p) {
      const ii = (p.imageinfo || [])[0];
      const title = String(p.title || '').replace(/^File:/, '');
      if (ii && ii.thumburl && /^image\/(png|jpeg|svg\+xml|gif)$/.test(ii.mime || '') && relevant(title, name)) {
        out.push({ source: 'Wikimedia', title: title, url: cleanUrl(ii.thumburl) });
      }
    });
  return out;
}

function tabletImage(u) { return !/\.webp($|[?#])/i.test(String(u || '')); }

async function searchIcons(name) {
  name = String(name || '').trim().slice(0, 80);
  if (!name) throw fail('Scrivi il nome del gioco');
  const results = await Promise.all([
    steamIcons(name).catch(function (e) { log.debug('games', 'Steam: ' + e.message); return []; }),
    wikiIcons(name).catch(function (e) { log.debug('games', 'Wikipedia: ' + e.message); return []; })
  ]);
  const seen = {};
  return { icons: [].concat(results[0], results[1]).filter(function (x) { if (seen[x.url] || !tabletImage(x.url)) return false; seen[x.url] = true; return true; }).slice(0, 16) };
}

const previews = {};
async function fileIcon(file) {
  file = checkPath(file);
  const token = crypto.randomBytes(8).toString('hex');
  const out = path.join(os.tmpdir(), 'vibe-deck-icon-' + token + '.png');
  if (process.platform === 'win32') {
    await ps('icon', ['-File', file, '-Out', out]);
  } else {
    const src = linuxIconFile(file);
    if (!src) return { token: '' };
    fs.copyFileSync(src, out);
  }
  if (!fs.existsSync(out) || !imageType(fs.readFileSync(out))) return { token: '' };
  previews[token] = out;
  return { token: token };
}
async function fileIconOf(id) { return fileIcon(find(id).path).catch(function () { return { token: '' }; }); }
function previewFile(token) {
  const f = previews[String(token || '')];
  if (!f || !fs.existsSync(f)) throw fail('Anteprima scaduta', 'NOT_FOUND');
  return f;
}

function linuxIconFile(file) {
  if (!/\.desktop$/i.test(file)) return '';
  const icon = desktopKey(fs.readFileSync(file, 'utf8'), 'Icon');
  if (!icon) return '';
  if (path.isAbsolute(icon)) return /\.png$/i.test(icon) && fs.existsSync(icon) ? icon : '';
  const bases = [path.join(os.homedir(), '.local/share/icons/hicolor'), '/usr/share/icons/hicolor',
    path.join(os.homedir(), '.local/share/flatpak/exports/share/icons/hicolor'), '/var/lib/flatpak/exports/share/icons/hicolor'];
  const sizes = ['256x256', '512x512', '128x128', '96x96', '64x64', '48x48'];
  for (let i = 0; i < bases.length; i++) {
    for (let j = 0; j < sizes.length; j++) {
      const f = path.join(bases[i], sizes[j], 'apps', icon + '.png');
      if (fs.existsSync(f)) return f;
    }
  }
  const pix = path.join('/usr/share/pixmaps', icon + '.png');
  return fs.existsSync(pix) ? pix : '';
}

function iconFile(g) { return g && g.icon ? path.join(ICON_DIR, path.basename(g.icon)) : ''; }

async function storeIcon(id, choice) {
  choice = choice || {};
  let buf = null;
  if (choice.token) buf = fs.readFileSync(previewFile(choice.token));
  else if (choice.url) buf = await download(String(choice.url));
  if (!buf) return null;
  const type = imageType(buf);
  if (!type) throw fail('Immagine non valida');
  if (!fs.existsSync(ICON_DIR)) fs.mkdirSync(ICON_DIR, { recursive: true });
  const name = id + '.' + type;
  fs.writeFileSync(path.join(ICON_DIR, name), buf);
  return name;
}

function panelInfo() {
  return {
    os: osKey(),
    games: load().games.map(function (g) {
      return { id: g.id, label: g.label, path: g.path, process: g.process || '', os: g.os || osKey(), icon: g.icon ? '/api/control/games/icon/' + encodeURIComponent(g.id) + '?v=' + encodeURIComponent(g.iconRev || '') : null, exists: fs.existsSync(g.path) };
    })
  };
}

function slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'gioco';
}

async function add(b) {
  b = b || {};
  const file = checkPath(b.path);
  const label = String(b.label || '').trim().slice(0, 40);
  if (!label) throw fail('Scrivi il nome del gioco');
  const s = load();
  if (s.games.length >= MAX_GAMES) throw fail('Al massimo ' + MAX_GAMES + ' giochi');
  let id = slug(label);
  while (s.games.some(function (g) { return g.id === id; })) id += '_2';
  const proc = String(b.process || '').split(',').map(function (x) { return x.trim().toLowerCase().replace(/\.exe$/, ''); }).filter(Boolean).join(', ').slice(0, 120);
  const g = { id: id, label: label, path: file, os: osKey() };
  if (proc) g.process = proc;
  const args = (Array.isArray(b.args) ? b.args : []).map(function (x) { return String(x).slice(0, 200); }).filter(Boolean).slice(0, 10);
  if (args.length) g.args = args;
  const icon = await storeIcon(id, b.icon);
  if (icon) { g.icon = icon; g.iconRev = Date.now().toString(36); }
  s.games.push(g);
  save();
  log.info('games', 'gioco aggiunto: ' + label);
  return g;
}

async function setIcon(id, choice) {
  const g = find(id);
  const icon = await storeIcon(g.id, choice);
  if (g.icon && g.icon !== icon) { try { fs.unlinkSync(iconFile(g)); } catch (e) { } }
  if (icon) { g.icon = icon; g.iconRev = Date.now().toString(36); } else { delete g.icon; delete g.iconRev; }
  save();
}

function find(id) {
  const g = load().games.filter(function (x) { return x.id === String(id || ''); })[0];
  if (!g) throw fail('Gioco sconosciuto', 'NOT_FOUND');
  return g;
}

function remove(id) {
  const g = find(id);
  if (g.icon) { try { fs.unlinkSync(iconFile(g)); } catch (e) { } }
  store.games = store.games.filter(function (x) { return x !== g; });
  save();
}

function reorder(ids) {
  const s = load();
  const list = (Array.isArray(ids) ? ids : []).map(String);
  s.games.sort(function (a, b) {
    const ia = list.indexOf(a.id), ib = list.indexOf(b.id);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  save();
}

function icon(id) {
  const f = iconFile(find(id));
  if (!f || !fs.existsSync(f)) throw fail('Nessuna icona', 'NOT_FOUND');
  return f;
}

module.exports = {
  apps: apps,
  tiles: tiles,
  homeWidgets: homeWidgets,
  pickFile: pickFile,
  fileInfo: fileInfo,
  fileIcon: fileIcon,
  fileIconOf: fileIconOf,
  previewFile: previewFile,
  searchIcons: searchIcons,
  panelInfo: panelInfo,
  add: add,
  setIcon: setIcon,
  remove: remove,
  reorder: reorder,
  icon: icon,
  cleanLabel: cleanLabel,
  imageType: imageType,
  _reset: function () { store = null; }
};
