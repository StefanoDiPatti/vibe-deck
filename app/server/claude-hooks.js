const fs = require('fs');
const os = require('os');
const path = require('path');
const paths = require('./paths');

const MARK = 'claude-hook.js';
const ENTRIES = [
  { event: 'PermissionRequest', kind: 'permission', matcher: '', timeout: 110 },
  { event: 'Notification', kind: 'waiting', matcher: 'permission_prompt|idle_prompt', timeout: 10 },
  { event: 'Stop', kind: 'done', matcher: '', timeout: 10 }
];

function settingsFile() {
  return process.env.DOCK_CLAUDE_SETTINGS || path.join(os.homedir(), '.claude', 'settings.json');
}

function fail(message) { return Object.assign(new Error(message), { code: 'BAD_REQUEST' }); }

function read() {
  const file = settingsFile();
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw fail('Non riesco a leggere ' + file + ': ' + e.message);
  }
  if (!text.trim()) return {};
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('non è un oggetto');
    return data;
  } catch (e) { throw fail(file + ' non è un JSON valido (' + e.message + '): non lo tocco'); }
}

function write(data) {
  const file = settingsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const backup = file + '.vibe-deck.bak';
  if (fs.existsSync(file) && !fs.existsSync(backup)) fs.copyFileSync(file, backup);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

function commandFor(kind) {
  return 'node "' + path.join(paths.ROOT, 'scripts', MARK) + '" ' + kind;
}

function isOurs(group) {
  return !!group && Array.isArray(group.hooks) && group.hooks.some(function (h) { return h && typeof h.command === 'string' && h.command.indexOf(MARK) >= 0; });
}

function status() {
  const data = read();
  const hooks = data.hooks && typeof data.hooks === 'object' ? data.hooks : {};
  const have = ENTRIES.filter(function (e) { return Array.isArray(hooks[e.event]) && hooks[e.event].some(isOurs); });
  return { file: settingsFile(), installed: have.length === ENTRIES.length, partial: have.length > 0 && have.length < ENTRIES.length, events: have.map(function (e) { return e.event; }) };
}

function install() {
  const data = read();
  if (data.hooks !== undefined && (typeof data.hooks !== 'object' || data.hooks === null || Array.isArray(data.hooks))) throw fail('"hooks" in settings.json non è un oggetto: non lo tocco');
  data.hooks = data.hooks || {};
  ENTRIES.forEach(function (e) {
    const list = Array.isArray(data.hooks[e.event]) ? data.hooks[e.event].filter(function (g) { return !isOurs(g); }) : [];
    list.push({ matcher: e.matcher, hooks: [{ type: 'command', command: commandFor(e.kind), timeout: e.timeout }] });
    data.hooks[e.event] = list;
  });
  write(data);
  return status();
}

function uninstall() {
  const data = read();
  if (data.hooks && typeof data.hooks === 'object') {
    Object.keys(data.hooks).forEach(function (event) {
      if (!Array.isArray(data.hooks[event])) return;
      const kept = data.hooks[event].filter(function (g) { return !isOurs(g); });
      if (kept.length) data.hooks[event] = kept;
      else delete data.hooks[event];
    });
    if (!Object.keys(data.hooks).length) delete data.hooks;
    write(data);
  }
  return status();
}

module.exports = { status: status, install: install, uninstall: uninstall, ENTRIES: ENTRIES, commandFor: commandFor };
