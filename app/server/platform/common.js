const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');

const MEDIA_COMMANDS = ['play_pause', 'next', 'previous', 'stop', 'volume_up', 'volume_down', 'mute'];

function expandPath(p) {
  if (typeof p !== 'string') return p;
  let out = p.replace(/%([^%]+)%/g, function (m, name) {
    return process.env[name] !== undefined ? process.env[name] : m;
  });
  out = out.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, function (m, a, b) {
    const v = process.env[a || b];
    return v !== undefined ? v : m;
  });
  if (out === '~' || out.indexOf('~/') === 0 || out.indexOf('~\\') === 0) out = os.homedir() + out.slice(1);
  return out;
}

function looksLikePath(p) { return /[\\/]/.test(p); }

function looseName(s) { return String(s).replace(/[\s   ]+/g, ' ').trim().toLowerCase(); }

function resolveWildcard(p) {
  if (typeof p !== 'string') return p;
  if (p.indexOf('*') < 0 && (!looksLikePath(p) || fs.existsSync(p))) return p;
  const sep = p.indexOf('\\') >= 0 ? '\\' : '/';
  const parts = p.split(/[\\/]/);
  let current = [parts[0] === '' ? sep : parts[0] + (/^[A-Za-z]:$/.test(parts[0]) ? sep : '')];
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    if (!seg) continue;
    const next = [];
    current.forEach(function (dir) {
      if (seg.indexOf('*') < 0) {
        const exact = path.join(dir, seg);
        if (fs.existsSync(exact)) { next.push(exact); return; }
        let names = [];
        try { names = fs.readdirSync(dir); } catch (e) { return; }
        const want = looseName(seg);
        const hit = names.filter(function (n) { return looseName(n) === want; })[0];
        if (hit) next.push(path.join(dir, hit));
        return;
      }
      const re = new RegExp('^' + seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
      let entries = [];
      try { entries = fs.readdirSync(dir); } catch (e) { return; }
      entries.filter(function (n) { return re.test(n); })
        .sort(function (a, b) { return b.localeCompare(a, undefined, { numeric: true }); })
        .forEach(function (n) { next.push(path.join(dir, n)); });
    });
    current = next;
    if (!current.length) return p;
  }
  for (let j = 0; j < current.length; j++) if (fs.existsSync(current[j])) return current[j];
  return p;
}

const whichCache = {};
const dirCache = {};
function listDir(dir) {
  if (!dirCache[dir]) {
    try { dirCache[dir] = fs.readdirSync(dir).map(function (n) { return n.toLowerCase(); }); } catch (e) { dirCache[dir] = []; }
  }
  return dirCache[dir];
}
function which(cmd) {
  if (whichCache[cmd] !== undefined) return whichCache[cmd];
  let found = null;
  if (looksLikePath(cmd)) {
    found = fs.existsSync(cmd) ? cmd : null;
  } else {
    const exts = process.platform === 'win32'
      ? [''].concat((process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').toLowerCase().split(';'))
      : [''];
    const dirs = (process.env.PATH || '').split(path.delimiter);
    outer:
    for (let i = 0; i < dirs.length; i++) {
      if (!dirs[i]) continue;
      for (let j = 0; j < exts.length; j++) {
        const candidate = path.join(dirs[i], cmd + exts[j]);
        try {
          const st = fs.statSync(candidate);
          if (st.isFile()) { found = candidate; break outer; }
        } catch (e) {
          if (process.platform === 'win32' && listDir(dirs[i]).indexOf((cmd + exts[j]).toLowerCase()) >= 0) {
            found = candidate;
            break outer;
          }
        }
      }
    }
  }
  whichCache[cmd] = found;
  return found;
}

function run(cmd, args, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    execFile(cmd, args || [], {
      timeout: opts.timeout || 5000,
      maxBuffer: 64 * 1024,
      windowsHide: true,
      cwd: opts.cwd,
      env: opts.env || process.env,
      encoding: 'utf8'
    }, function (err, stdout, stderr) {
      resolve({
        ok: !err,
        code: err ? (typeof err.code === 'number' ? err.code : -1) : 0,
        notFound: !!(err && err.code === 'ENOENT'),
        stdout: stdout || '',
        stderr: stderr || '',
        error: err ? err.message : null
      });
    });
  });
}

function spawnDetached(cmd, args, cwd) {
  return new Promise(function (resolve, reject) {
    let child;
    try {
      child = spawn(cmd, args || [], { cwd: cwd || os.homedir(), detached: true, stdio: 'ignore', windowsHide: false });
    } catch (e) { return reject(e); }
    let settled = false;
    child.once('error', function (e) { if (!settled) { settled = true; reject(e); } });
    child.once('spawn', function () { if (!settled) { settled = true; child.unref(); resolve(); } });
  });
}

function quoteWinArg(arg) {
  arg = String(arg);
  if (arg && !/[\s"]/.test(arg)) return arg;
  return '"' + arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1') + '"';
}

async function fetchJson(url, opts) {
  opts = opts || {};
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, opts.timeout || 5000);
  try {
    const res = await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    return { ok: res.ok, status: res.status, data: data, text: text, headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

function stripAnsi(s) {
  return String(s || '').replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '').replace(/\u001b\][^\u0007]*\u0007/g, '');
}

function monitorName(deviceId, names) {
  const parts = String(deviceId || '').split('#');
  if (parts.length < 3) return '';
  const key = ('display\\' + parts[1] + '\\' + parts[2]).toLowerCase();
  const hit = Object.keys(names || {}).filter(function (k) { return k.indexOf(key) === 0; })[0];
  return hit ? names[hit] : '';
}

function osKey() { return process.platform === 'win32' ? 'windows' : process.platform; }

function available(p) {
  const list = Array.isArray(p) ? p : [p];
  return list.some(function (x) {
    if (typeof x !== 'string' || !x) return false;
    const file = resolveWildcard(expandPath(x));
    return looksLikePath(file) ? fs.existsSync(file) : !!which(file);
  });
}

function forPlatform(entry) {
  if (!entry || typeof entry !== 'object') return null;
  let specific = entry[osKey()];
  if (Array.isArray(specific)) {
    const options = specific.filter(function (v) { return v && typeof v === 'object'; });
    specific = options.filter(function (v) { return available(v.path || v.cmd); })[0] || options[0];
  }
  if (specific && typeof specific === 'object') return Object.assign({}, entry, specific);
  if ((entry.windows || entry.linux) && !entry.path && !entry.cmd) return null;
  return entry;
}

module.exports = {
  monitorName: monitorName,
  MEDIA_COMMANDS: MEDIA_COMMANDS,
  expandPath: expandPath,
  looksLikePath: looksLikePath,
  resolveWildcard: resolveWildcard,
  which: which,
  run: run,
  spawnDetached: spawnDetached,
  quoteWinArg: quoteWinArg,
  fetchJson: fetchJson,
  stripAnsi: stripAnsi,
  osKey: osKey,
  available: available,
  forPlatform: forPlatform
};
