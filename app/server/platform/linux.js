const fs = require('fs');
const os = require('os');
const path = require('path');
const keys = require('./keys');
const common = require('./common');
const mixer = require('./linux-mixer');
const kwin = require('./linux-kwin');

const SEP = '\u001f';

function has(cmd) { return !!common.which(cmd); }
function isWayland() { return (process.env.XDG_SESSION_TYPE || '').toLowerCase() === 'wayland' || !!process.env.WAYLAND_DISPLAY; }

function inputTool() {
  if (isWayland() && has('wtype')) return 'wtype';
  if (has('xdotool') && process.env.DISPLAY) return 'xdotool';
  if (has('wtype')) return 'wtype';
  return null;
}

async function mustRun(cmd, args, what) {
  const r = await common.run(cmd, args, { timeout: 8000 });
  if (!r.ok) throw new Error(what + ' non riuscito: ' + (r.stderr.trim() || r.error));
  return r;
}

async function volume(command) {
  if (has('wpctl')) {
    const target = '@DEFAULT_AUDIO_SINK@';
    if (command === 'mute') return mustRun('wpctl', ['set-mute', target, 'toggle'], 'Mute');
    return mustRun('wpctl', ['set-volume', '-l', '1.0', target, command === 'volume_up' ? '5%+' : '5%-'], 'Volume');
  }
  if (has('pactl')) {
    const sink = '@DEFAULT_SINK@';
    if (command === 'mute') return mustRun('pactl', ['set-sink-mute', sink, 'toggle'], 'Mute');
    return mustRun('pactl', ['set-sink-volume', sink, command === 'volume_up' ? '+5%' : '-5%'], 'Volume');
  }
  if (has('amixer')) {
    if (command === 'mute') return mustRun('amixer', ['-q', 'set', 'Master', 'toggle'], 'Mute');
    return mustRun('amixer', ['-q', 'set', 'Master', command === 'volume_up' ? '5%+' : '5%-'], 'Volume');
  }
  throw new Error('Nessuno strumento per il volume (installa pipewire/wpctl o pulseaudio-utils)');
}

async function sendKeysImpl(combo) {
  const tool = inputTool();
  if (tool === 'xdotool') {
    return mustRun('xdotool', ['key', '--clearmodifiers', keys.toX11(combo).join('+')], 'Scorciatoia');
  }
  if (tool === 'wtype') {
    const args = [];
    const mods = [];
    combo.forEach(function (k) {
      const sym = keys.KEYS[k].x11;
      if (keys.isModifier(k)) { const m = sym === 'super' ? 'logo' : sym; mods.push(m); args.push('-M', m); }
      else args.push('-k', sym);
    });
    mods.reverse().forEach(function (m) { args.push('-m', m); });
    return mustRun('wtype', args, 'Scorciatoia');
  }
  throw new Error('Per i tasti installa xdotool (X11) o wtype (Wayland)');
}

const artCache = {};

module.exports = {
  name: 'linux',

  init: function () { return Promise.resolve(); },

  capabilities: function () {
    const notes = [];
    if (!has('playerctl')) notes.push('playerctl mancante: niente Now Playing');
    if (!inputTool()) notes.push('xdotool/wtype mancanti: niente scorciatoie');
    if (isWayland() && !has('wtype')) notes.push('Wayland: installa wtype per le scorciatoie');
    return {
      media: has('playerctl') || has('xdotool'),
      keys: !!inputTool(),
      text: !!inputTool(),
      focus: has('xdotool') && !!process.env.DISPLAY,
      nowPlaying: has('playerctl'),
      appVolume: has('playerctl'),
      art: has('playerctl'),
      notes: notes
    };
  },

  media: async function (command) {
    if (command === 'volume_up' || command === 'volume_down' || command === 'mute') return volume(command);
    const map = { play_pause: 'play-pause', next: 'next', previous: 'previous', stop: 'stop' };
    if (!map[command]) throw new Error('Comando media sconosciuto: ' + command);
    if (has('playerctl')) return mustRun('playerctl', [map[command]], 'Comando media');
    const sym = { play_pause: 'XF86AudioPlay', next: 'XF86AudioNext', previous: 'XF86AudioPrev', stop: 'XF86AudioStop' };
    if (has('xdotool')) return mustRun('xdotool', ['key', sym[command]], 'Comando media');
    throw new Error('Installa playerctl per i controlli multimediali');
  },

  sendKeys: sendKeysImpl,

  typeText: async function (text) {
    const tool = inputTool();
    if (tool === 'xdotool') return mustRun('xdotool', ['type', '--delay', '8', '--', String(text)], 'Testo');
    if (tool === 'wtype') return mustRun('wtype', ['--', String(text)], 'Testo');
    throw new Error('Per digitare testo installa xdotool (X11) o wtype (Wayland)');
  },

  focus: async function (name) {
    if (!has('xdotool') || !process.env.DISPLAY) throw Object.assign(new Error('Focus finestra disponibile solo su X11 con xdotool'), { code: 'UNSUPPORTED' });
    const r = await common.run('xdotool', ['search', '--onlyvisible', '--class', String(name), 'windowactivate', '--sync'], { timeout: 4000 });
    if (!r.ok) throw new Error('Finestra "' + name + '" non trovata');
    return r;
  },

  open: function (target) {
    if (!has('xdg-open')) return Promise.reject(new Error('xdg-open non trovato'));
    return common.spawnDetached('xdg-open', [String(target)]);
  },

  launch: function (app) {
    const file = common.resolveWildcard(common.expandPath(app.path));
    const args = (app.args || []).map(common.expandPath);
    const cwd = app.cwd ? common.expandPath(app.cwd) : os.homedir();
    if (/\.desktop$/.test(file)) {
      if (has('gtk-launch')) return common.spawnDetached('gtk-launch', [path.basename(file, '.desktop')], cwd);
    }
    if (common.looksLikePath(file) && !fs.existsSync(file)) return Promise.reject(new Error('non trovato in ' + file));
    if (!common.looksLikePath(file) && !has(file)) return Promise.reject(new Error('"' + file + '" non è nel PATH'));
    return common.spawnDetached(file, args, cwd);
  },

  sessions: async function () {
    if (!has('playerctl')) return { supported: false, sessions: [] };
    const list = await common.run('playerctl', ['-l'], { timeout: 3000 });
    if (!list.ok) return { supported: true, sessions: [] };
    const names = list.stdout.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    const fmt = ['{{status}}', '{{title}}', '{{artist}}', '{{album}}', '{{mpris:artUrl}}', '{{position}}', '{{mpris:length}}', '{{shuffle}}'].join(SEP);
    const out = [];
    for (let i = 0; i < names.length; i++) {
      const r = await common.run('playerctl', ['-p', names[i], 'metadata', '--format', fmt], { timeout: 3000 });
      if (!r.ok || !r.stdout.trim()) continue;
      const f = r.stdout.replace(/\r?\n$/, '').split(SEP);
      const status = (f[0] || '').toLowerCase();
      artCache[names[i]] = f[4] || null;
      out.push({
        id: names[i],
        app: names[i],
        current: i === 0,
        title: f[1] || '',
        artist: f[2] || '',
        album: f[3] || '',
        status: status === 'playing' ? 'playing' : status === 'paused' ? 'paused' : 'stopped',
        position: (parseInt(f[5], 10) || 0) / 1e6,
        duration: (parseInt(f[6], 10) || 0) / 1e6,
        start: 0,
        updatedAt: Date.now(),
        hasArt: !!f[4],
        canSeek: true,
        canShuffle: f[7] === 'true' || f[7] === 'false',
        shuffle: f[7] === 'true'
      });
    }
    return { supported: true, sessions: out };
  },

  control: function (session, action, extra) {
    const p = ['-p', session.app];
    const map = { play_pause: ['play-pause'], next: ['next'], previous: ['previous'], stop: ['stop'] };
    if (action === 'seek') return mustRun('playerctl', p.concat(['position', String(Math.max(0, Number(extra) || 0))]), 'Seek');
    if (action === 'shuffle') return mustRun('playerctl', p.concat(['shuffle', extra ? 'On' : 'Off']), 'Shuffle');
    if (!map[action]) return Promise.reject(new Error('Azione sconosciuta: ' + action));
    return mustRun('playerctl', p.concat(map[action]), 'Comando media');
  },

  art: async function (session) {
    const url = artCache[session.app];
    if (!url) return null;
    if (url.indexOf('file://') === 0) {
      const file = decodeURIComponent(url.slice(7));
      if (!fs.existsSync(file)) return null;
      const ext = path.extname(file).toLowerCase();
      return { mime: ext === '.png' ? 'image/png' : 'image/jpeg', data: fs.readFileSync(file) };
    }
    if (/^https?:\/\//.test(url)) return { url: url };
    return null;
  },

  appVolume: async function (names, delta, mute, session) {
    if (!session || !has('playerctl')) throw new Error('Volume dell\'app non disponibile');
    if (delta) {
      const sign = delta > 0 ? '+' : '-';
      await mustRun('playerctl', ['-p', session.app, 'volume', Math.abs(delta).toFixed(2) + sign], 'Volume app');
    }
    const r = await common.run('playerctl', ['-p', session.app, 'volume'], { timeout: 3000 });
    const v = parseFloat(r.stdout);
    return isNaN(v) ? -1 : v;
  },

  audioProcesses: function () { return Promise.resolve([]); },

  mixer: mixer.mixer,
  setDefaultDevice: mixer.setDefaultDevice,
  setDeviceVolume: mixer.setDeviceVolume,
  setAppVolume: mixer.setAppVolume,

  netBytes: async function () {
    try {
      const text = fs.readFileSync('/proc/net/dev', 'utf8');
      let rx = 0; let tx = 0;
      text.split('\n').slice(2).forEach(function (line) {
        const m = /^\s*([^:]+):\s*(.*)$/.exec(line);
        if (!m) return;
        const name = m[1].trim();
        if (/^(lo|docker|veth|br-|virbr|vmnet|tun|tap)/.test(name)) return;
        const cols = m[2].trim().split(/\s+/);
        rx += parseInt(cols[0], 10) || 0;
        tx += parseInt(cols[8], 10) || 0;
      });
      return { rx: rx, tx: tx };
    } catch (e) { return null; }
  },

  netInfo: async function () {
    if (has('iwgetid')) {
      const r = await common.run('iwgetid', ['-r'], { timeout: 2000 });
      if (r.ok && r.stdout.trim()) return { type: 'wifi', name: r.stdout.trim(), signal: null };
    }
    if (has('nmcli')) {
      const r = await common.run('nmcli', ['-t', '-f', 'TYPE,STATE,CONNECTION', 'device'], { timeout: 3000 });
      const lines = r.stdout.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const f = lines[i].split(':');
        if (f[1] === 'connected' && f[0] === 'wifi') return { type: 'wifi', name: f.slice(2).join(':'), signal: null };
        if (f[1] === 'connected' && f[0] === 'ethernet') return { type: 'ethernet', name: 'Ethernet' };
      }
    }
    return { type: 'ethernet', name: 'Rete' };
  },

  windows: async function () {
    if (!has('wmctrl') || !process.env.DISPLAY) return [];
    const r = await common.run('wmctrl', ['-lp'], { timeout: 3000 });
    if (!r.ok) return [];
    return r.stdout.split('\n').filter(Boolean).map(function (l) {
      const m = /^(\S+)\s+\S+\s+(\d+)\s+\S+\s?(.*)$/.exec(l);
      if (!m) return null;
      let proc = '';
      try { proc = fs.readFileSync('/proc/' + m[2] + '/comm', 'utf8').trim().toLowerCase(); } catch (e) { }
      return { id: m[1], process: proc, title: m[3] };
    }).filter(Boolean);
  },

  closeWindows: async function (processName, titlePattern) {
    const wins = await module.exports.windows();
    const re = titlePattern ? new RegExp(titlePattern, 'i') : null;
    let n = 0;
    for (let i = 0; i < wins.length; i++) {
      if (wins[i].process !== String(processName).toLowerCase() || (re && !re.test(wins[i].title))) continue;
      const r = await common.run('wmctrl', ['-ic', wins[i].id], { timeout: 3000 });
      if (r.ok) n++;
    }
    return n;
  },

  cpuTemp: async function () {
    const base = '/sys/class/hwmon';
    try {
      const dirs = fs.readdirSync(base);
      for (let i = 0; i < dirs.length; i++) {
        const dir = path.join(base, dirs[i]);
        let name = '';
        try { name = fs.readFileSync(path.join(dir, 'name'), 'utf8').trim(); } catch (e) { continue; }
        if (!/^(coretemp|k10temp|zenpower|cpu_thermal|acpitz)$/.test(name)) continue;
        const v = parseInt(fs.readFileSync(path.join(dir, 'temp1_input'), 'utf8'), 10);
        if (!isNaN(v)) return Math.round(v / 1000);
      }
    } catch (e) { }
    return null;
  },

  gpuFallback: async function () {
    try {
      const cards = fs.readdirSync('/sys/class/drm').filter(function (n) { return /^card\d+$/.test(n); });
      for (let i = 0; i < cards.length; i++) {
        const dev = path.join('/sys/class/drm', cards[i], 'device');
        const busyFile = path.join(dev, 'gpu_busy_percent');
        if (!fs.existsSync(busyFile)) continue;
        const out = { name: 'GPU', usage: parseInt(fs.readFileSync(busyFile, 'utf8'), 10), temp: null, memUsedMb: null, memTotalMb: null };
        try {
          out.memUsedMb = Math.round(parseInt(fs.readFileSync(path.join(dev, 'mem_info_vram_used'), 'utf8'), 10) / 1048576);
          out.memTotalMb = Math.round(parseInt(fs.readFileSync(path.join(dev, 'mem_info_vram_total'), 'utf8'), 10) / 1048576);
        } catch (e) { }
        try {
          const hw = path.join(dev, 'hwmon');
          const h = fs.readdirSync(hw)[0];
          out.temp = Math.round(parseInt(fs.readFileSync(path.join(hw, h, 'temp1_input'), 'utf8'), 10) / 1000);
        } catch (e) { }
        return out;
      }
    } catch (e) { }
    return null;
  },

  monitors: function () { return kwin.monitors(); },
  windowList: function () { return kwin.windowList(); },
  deskWindows: function () { return kwin.deskWindows(); },
  placeWindow: function (id, rect, max, focus) { return kwin.placeWindow(id, rect, max, focus); },
  windowAction: function (id, action) { return kwin.windowAction(id, action); },
  moveWindowToDesktop: function (id, desk) { return kwin.moveWindowToDesktop(id, desk); },
  virtualDesktops: function () { return kwin.virtualDesktops(); },
  switchDesktop: function (id) { return kwin.switchDesktop(id); },
  createDesktop: function () { return kwin.createDesktop(); },
  removeDesktop: function (id) { return kwin.removeDesktop(id); },
  screensNote: function () { return kwin.available() ? '' : kwin.why(); },

  shutdown: function () {}
};
