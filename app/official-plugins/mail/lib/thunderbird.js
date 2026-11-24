const fs = require('fs');
const os = require('os');
const path = require('path');
const libmime = require('libmime');

function roots() {
  if (process.env.DOCK_THUNDERBIRD_DIR) return [process.env.DOCK_THUNDERBIRD_DIR];
  const home = os.homedir();
  if (process.platform === 'win32') {
    return [path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Thunderbird')];
  }
  if (process.platform === 'darwin') return [path.join(home, 'Library', 'Thunderbird')];
  return [
    path.join(home, '.thunderbird'),
    path.join(home, '.var', 'app', 'org.mozilla.Thunderbird', '.thunderbird'),
    path.join(home, 'snap', 'thunderbird', 'common', '.thunderbird'),
    path.join(home, '.config', 'thunderbird')
  ];
}

function parseIni(text) {
  const out = {};
  let cur = null;
  String(text || '').split(/\r?\n/).forEach(function (line) {
    const s = line.trim();
    if (!s || s[0] === ';' || s[0] === '#') return;
    const sec = /^\[(.+)\]$/.exec(s);
    if (sec) { cur = out[sec[1]] = {}; return; }
    const i = s.indexOf('=');
    if (cur && i > 0) cur[s.slice(0, i).trim()] = s.slice(i + 1).trim();
  });
  return out;
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (e) { return null; }
}

function findProfile() {
  const list = roots();
  for (let i = 0; i < list.length; i++) {
    const root = list[i];
    const ini = readText(path.join(root, 'profiles.ini'));
    if (ini === null) continue;
    const p = parseIni(ini);
    const inst = parseIni(readText(path.join(root, 'installs.ini')) || '');
    const resolve = function (rel, isRel) {
      const r = String(rel || '').replace(/\//g, path.sep);
      return isRel === '0' ? r : path.join(root, r);
    };
    const candidates = [];
    Object.keys(p).forEach(function (k) { if (/^Install/i.test(k) && p[k].Default) candidates.push(resolve(p[k].Default, '1')); });
    Object.keys(inst).forEach(function (k) { if (inst[k].Default) candidates.push(resolve(inst[k].Default, '1')); });
    const profiles = Object.keys(p).filter(function (k) { return /^Profile/i.test(k) && p[k].Path; }).map(function (k) { return p[k]; });
    profiles.filter(function (x) { return x.Default === '1'; }).forEach(function (x) { candidates.push(resolve(x.Path, x.IsRelative)); });
    profiles.forEach(function (x) { candidates.push(resolve(x.Path, x.IsRelative)); });
    for (let j = 0; j < candidates.length; j++) {
      if (fs.existsSync(path.join(candidates[j], 'prefs.js'))) return { root: root, dir: candidates[j] };
    }
    return { root: root, dir: null };
  }
  return null;
}

function parsePrefs(text) {
  const out = {};
  const re = /^\s*user_pref\(\s*("(?:[^"\\]|\\.)*")\s*,\s*([\s\S]*?)\s*\);\s*$/gm;
  let m;
  while ((m = re.exec(String(text || '')))) {
    try { out[JSON.parse(m[1])] = JSON.parse(m[2]); } catch (e) { }
  }
  return out;
}

function accounts(profileDir) {
  const prefs = parsePrefs(readText(path.join(profileDir, 'prefs.js')));
  const keys = String(prefs['mail.accountmanager.accounts'] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  const out = [];
  keys.forEach(function (acc) {
    const server = prefs['mail.account.' + acc + '.server'];
    if (!server) return;
    const sp = function (k) { return prefs['mail.server.' + server + '.' + k]; };
    const type = sp('type');
    if (type !== 'imap' && type !== 'pop3') return;
    const ident = String(prefs['mail.account.' + acc + '.identities'] || '').split(',')[0].trim();
    const email = (ident && prefs['mail.identity.' + ident + '.useremail']) || String(sp('userName') || '');
    let dir = '';
    const rel = sp('directory-rel');
    if (rel && /^\[ProfD\]/.test(rel)) dir = path.join(profileDir, rel.replace(/^\[ProfD\]/, '').replace(/\//g, path.sep));
    if ((!dir || !fs.existsSync(dir)) && sp('directory')) dir = sp('directory');
    out.push({
      key: server,
      email: email,
      name: String(sp('name') || email),
      host: String(sp('hostname') || ''),
      type: type,
      dir: dir,
      maildir: /maildir/i.test(String(sp('storeContractID') || '')),
      offline: type === 'pop3' || sp('offline_download') !== false
    });
  });
  return out;
}

function inboxPath(acc) {
  const names = acc.type === 'imap' ? ['INBOX', 'Inbox'] : ['Inbox', 'INBOX'];
  for (let i = 0; i < names.length; i++) {
    const p = path.join(acc.dir, names[i]);
    if (fs.existsSync(p + '.msf') || fs.existsSync(p)) return p;
  }
  return path.join(acc.dir, names[0]);
}

function parseMork(input) {
  let text = String(input).replace(/@\$\$\{([0-9A-Fa-f]+)\{@([\s\S]*?)@\$\$\}(~abort~)?\1\}@/g, function (all, id, body, abort) {
    return abort ? '' : body;
  });
  const open = text.indexOf('@$${');
  if (open >= 0) text = text.slice(0, open);

  const cols = {};
  const atoms = {};
  const rows = {};
  const tables = [];
  let i = 0;
  const n = text.length;

  function skip() {
    for (;;) {
      while (i < n && text.charCodeAt(i) <= 32) i++;
      if (text.charCodeAt(i) === 47 && text.charCodeAt(i + 1) === 47) { while (i < n && text.charCodeAt(i) !== 10) i++; continue; }
      return;
    }
  }
  function isHex(c) { return (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102); }
  function literal() {
    const bytes = [];
    const push = function (c) {
      if (c < 256) { bytes.push(c); return; }
      const b = Buffer.from(String.fromCharCode(c), 'utf8');
      for (let k = 0; k < b.length; k++) bytes.push(b[k]);
    };
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 41) break;
      if (c === 92) {
        const nx = text.charCodeAt(i + 1);
        if (nx === 10) { i += 2; continue; }
        if (nx === 13) { i += text.charCodeAt(i + 2) === 10 ? 3 : 2; continue; }
        push(nx); i += 2; continue;
      }
      if (c === 36 && isHex(text.charCodeAt(i + 1)) && isHex(text.charCodeAt(i + 2))) {
        bytes.push(parseInt(text.substr(i + 1, 2), 16)); i += 3; continue;
      }
      push(c); i++;
    }
    return Buffer.from(bytes).toString('utf8');
  }
  const STOP = new Uint8Array(128);
  '()[]{}<>=^:'.split('').forEach(function (ch) { STOP[ch.charCodeAt(0)] = 1; });
  function token() {
    const s = i;
    for (;;) {
      const c = text.charCodeAt(i);
      if (i >= n || c <= 32 || (c < 128 && STOP[c])) break;
      i++;
    }
    return text.slice(s, i);
  }
  function oid() {
    let id = token();
    let scope = '';
    if (text[i] === ':') {
      i++;
      if (text[i] === '^') { i++; scope = colName(token()); } else scope = token();
    }
    return { id: id.toUpperCase(), scope: scope };
  }
  function colName(id) { return cols[String(id).toUpperCase()] || String(id); }

  function dict() {
    i++;
    let isCols = false;
    for (;;) {
      skip();
      if (i >= n) return;
      const c = text[i];
      if (c === '>') { i++; return; }
      if (c === '<') {
        i++;
        for (;;) {
          skip();
          if (text[i] === '>' || i >= n) { i++; break; }
          if (text[i] === '(') {
            i++;
            const k = token();
            skip();
            if (text[i] === '=') { i++; const v = literal(); if (k === 'a') isCols = v === 'c'; }
            i++;
          } else i++;
        }
        continue;
      }
      if (c === '(') {
        i++;
        const id = token().toUpperCase();
        skip();
        if (text[i] === '=') { i++; const v = literal(); (isCols ? cols : atoms)[id] = v; }
        while (i < n && text[i] !== ')') i++;
        i++;
        continue;
      }
      i++;
    }
  }

  function row(scopeDef, table) {
    i++;
    skip();
    let cut = false;
    if (text[i] === '-') { cut = true; i++; }
    const o = oid();
    const key = o.id + ':' + (o.scope || scopeDef || '');
    if (!rows[key] || cut) rows[key] = {};
    const r = rows[key];
    if (table) table.rows[key] = true;
    for (;;) {
      skip();
      if (i >= n) return key;
      const c = text[i];
      if (c === ']') { i++; return key; }
      if (c === '[') { skipBlock('[', ']'); continue; }
      if (c === '(') {
        i++;
        let col;
        skip();
        if (text[i] === '^') { i++; col = colName(token()); } else col = token();
        skip();
        if (text[i] === '=') { i++; r[col] = literal(); }
        else if (text[i] === '^') { i++; skip(); const a = token().toUpperCase(); r[col] = atoms[a] !== undefined ? atoms[a] : ''; }
        while (i < n && text[i] !== ')') i++;
        i++;
        continue;
      }
      i++;
    }
  }
  function skipBlock(a, b) {
    let depth = 0;
    while (i < n) {
      const c = text[i];
      if (c === '(') { i++; literal(); i++; continue; }
      if (c === a) depth++;
      else if (c === b) { depth--; if (depth === 0) { i++; return; } }
      i++;
    }
  }

  function table() {
    i++;
    skip();
    let clear = false;
    if (text[i] === '-') { clear = true; i++; }
    const o = oid();
    let t = tables.filter(function (x) { return x.id === o.id && x.scope === o.scope; })[0];
    if (!t) { t = { id: o.id, scope: o.scope, kind: '', rows: {} }; tables.push(t); }
    if (clear) t.rows = {};
    for (;;) {
      skip();
      if (i >= n) return;
      const c = text[i];
      if (c === '}') { i++; return; }
      if (c === '{') {
        const s = i;
        skipBlock('{', '}');
        const m = /\(k\^([0-9A-Fa-f]+)/.exec(text.slice(s, i));
        if (m) t.kind = colName(m[1]);
        continue;
      }
      if (c === '[') { row(o.scope, t); continue; }
      if (c === '-') {
        i++;
        skip();
        if (text[i] === '[') { delete t.rows[row(o.scope, null)]; continue; }
        const r = oid();
        delete t.rows[r.id + ':' + (r.scope || o.scope || '')];
        continue;
      }
      if (/[0-9A-Fa-f]/.test(c)) { const r = oid(); t.rows[r.id + ':' + (r.scope || o.scope || '')] = true; continue; }
      i++;
    }
  }

  while (i < n) {
    skip();
    if (i >= n) break;
    const c = text[i];
    if (c === '<') dict();
    else if (c === '{') table();
    else if (c === '[') row('', null);
    else if (c === '@') { while (i < n && text[i] !== '\n') i++; }
    else i++;
  }
  return { cols: cols, atoms: atoms, rows: rows, tables: tables };
}

const F_READ = 0x1, F_MARKED = 0x4, F_EXPUNGED = 0x8, F_HASRE = 0x10, F_OFFLINE = 0x80;

function hex(v) { const x = parseInt(v, 16); return isNaN(x) ? 0 : x; }

function decode(s) {
  try { return libmime.decodeWords(String(s || '')); } catch (e) { return String(s || ''); }
}
function parseAddress(s) {
  const t = decode(s).trim();
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>/.exec(t);
  if (m) return { name: m[1].trim(), address: m[2].trim() };
  return { name: '', address: t };
}

function messagesFromMork(db) {
  let keys = null;
  const msgTables = db.tables.filter(function (t) { return /msgs/i.test(t.kind) || /msgs:all|scope:msgs/i.test(t.scope); });
  if (msgTables.length) {
    keys = {};
    msgTables.forEach(function (t) { Object.keys(t.rows).forEach(function (k) { keys[k] = true; }); });
  }
  const out = [];
  Object.keys(keys || db.rows).forEach(function (k) {
    const r = db.rows[k];
    if (!r || r['date'] === undefined || r['flags'] === undefined) return;
    const flags = hex(r['flags']);
    if (flags & F_EXPUNGED) return;
    const subj = decode(r['subject'] || '');
    const id = k.split(':')[0];
    out.push({
      key: id,
      subject: (flags & F_HASRE ? 'Re: ' : '') + subj,
      from: parseAddress(r['sender'] || ''),
      date: new Date(hex(r['date']) * 1000),
      seen: !!(flags & F_READ),
      flagged: !!(flags & F_MARKED),
      offline: !!(flags & F_OFFLINE),
      messageId: r['message-id'] || '',
      token: r['storeToken'] !== undefined && r['storeToken'] !== '' ? String(r['storeToken']) : (r['msgOffset'] !== undefined ? String(hex(r['msgOffset'])) : ''),
      size: hex(r['offlineMsgSize'] || r['size'] || '0')
    });
  });
  return out;
}

const SEP = /(^|\n)From [^\n]*\n(?=[\x21-\x39\x3b-\x7e]+:)/g;

function messagesFromMbox(file, maxBytes) {
  let fd;
  try { fd = fs.openSync(file, 'r'); } catch (e) { return []; }
  try {
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, maxBytes || 32 * 1024 * 1024);
    const start = size - len;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    const text = buf.toString('latin1');
    const starts = [];
    let m;
    SEP.lastIndex = 0;
    while ((m = SEP.exec(text))) starts.push(m.index + m[1].length);
    if (start === 0 && text.indexOf('From ') === 0 && starts[0] !== 0) starts.unshift(0);
    const out = [];
    starts.forEach(function (s, idx) {
      const end = idx + 1 < starts.length ? starts[idx + 1] : text.length;
      const head = text.slice(s, Math.min(end, s + 32768));
      const nl = head.indexOf('\n');
      const hEnd = head.search(/\r?\n\r?\n/);
      const headers = Buffer.from(head.slice(nl + 1, hEnd > 0 ? hEnd : head.length), 'latin1').toString('utf8');
      const h = parseHeaders(headers);
      const st = parseInt(h['x-mozilla-status'] || '0', 16) || 0;
      if (st & F_EXPUNGED) return;
      const d = new Date(h['date'] || '');
      out.push({
        key: String(start + s),
        subject: decode(h['subject'] || ''),
        from: parseAddress(h['from'] || ''),
        date: isNaN(d.getTime()) ? new Date(0) : d,
        seen: !!(st & F_READ),
        flagged: !!(st & F_MARKED),
        offline: true,
        messageId: (h['message-id'] || '').replace(/[<>]/g, ''),
        token: String(start + s),
        size: end - s
      });
    });
    return out;
  } finally { fs.closeSync(fd); }
}

function parseHeaders(text) {
  const out = {};
  String(text).replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach(function (line) {
    const i = line.indexOf(':');
    if (i > 0) { const k = line.slice(0, i).trim().toLowerCase(); if (out[k] === undefined) out[k] = line.slice(i + 1).trim(); }
  });
  return out;
}

function readSource(inbox, msg, maildir, maxBytes) {
  if (maildir) {
    const name = path.basename(String(msg.token || ''));
    if (!name) return null;
    const dirs = ['cur', 'new', ''];
    for (let i = 0; i < dirs.length; i++) {
      const f = path.join(inbox, dirs[i], name);
      if (fs.existsSync(f)) {
        const fd = fs.openSync(f, 'r');
        try {
          const len = Math.min(fs.fstatSync(fd).size, maxBytes);
          const b = Buffer.alloc(len);
          fs.readSync(fd, b, 0, len, 0);
          return b;
        } finally { fs.closeSync(fd); }
      }
    }
    return null;
  }
  const off = parseInt(msg.token, 10);
  if (isNaN(off) || off < 0) return null;
  let fd;
  try { fd = fs.openSync(inbox, 'r'); } catch (e) { return null; }
  try {
    const size = fs.fstatSync(fd).size;
    if (off >= size) return null;
    const want = Math.min(maxBytes, size - off, msg.size ? msg.size + 4096 : maxBytes);
    const b = Buffer.alloc(want);
    fs.readSync(fd, b, 0, want, off);
    let text = b.toString('latin1');
    if (text.indexOf('From ') !== 0) return null;
    text = text.slice(text.indexOf('\n') + 1);
    SEP.lastIndex = 0;
    const m = SEP.exec(text);
    if (m) text = text.slice(0, m.index);
    return Buffer.from(text.replace(/^>(>*From )/gm, '$1'), 'latin1');
  } finally { fs.closeSync(fd); }
}

function executable() {
  if (process.platform === 'win32') {
    const list = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Mozilla Thunderbird', 'thunderbird.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Mozilla Thunderbird', 'thunderbird.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Mozilla Thunderbird', 'thunderbird.exe')
    ];
    return list.filter(function (f) { return fs.existsSync(f); })[0] || '';
  }
  const list = ['/usr/bin/thunderbird', '/usr/local/bin/thunderbird', '/snap/bin/thunderbird', '/var/lib/flatpak/exports/bin/org.mozilla.Thunderbird',
    path.join(os.homedir(), '.local/share/flatpak/exports/bin/org.mozilla.Thunderbird')];
  return list.filter(function (f) { return fs.existsSync(f); })[0] || '';
}

const DOWNLOAD_URL = 'https://www.thunderbird.net/download/';

module.exports = {
  DOWNLOAD_URL: DOWNLOAD_URL,
  roots: roots,
  findProfile: findProfile,
  accounts: accounts,
  inboxPath: inboxPath,
  parseIni: parseIni,
  parsePrefs: parsePrefs,
  parseMork: parseMork,
  messagesFromMork: messagesFromMork,
  messagesFromMbox: messagesFromMbox,
  readSource: readSource,
  executable: executable
};
