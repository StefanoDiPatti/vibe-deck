const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const paths = require('../../../server/paths');
const config = require('../../../server/config');
const sticky = require('./sticky');

const FILE = path.join(paths.DATA_DIR, 'todo.json');
const SEED = path.join(paths.DEFAULTS_DIR, 'todo.json');
let items = null;
let groups = null;
const listeners = [];

function settings() { return (config.get('services') || {}).todo || {}; }
let forced = null;
function useMemo() { if (forced) return forced === 'memo'; return settings().source !== 'local' && sticky.available(); }

function changed() { listeners.forEach(function (fn) { try { fn(); } catch (e) { } }); }

function clean(i) {
  return {
    id: String(i.id || crypto.randomBytes(4).toString('hex')),
    text: String(i.text).slice(0, 300),
    done: !!i.done,
    priority: i.priority === 'high' ? 'high' : 'normal',
    note: i.note ? String(i.note) : '',
    group: i.group ? String(i.group) : ''
  };
}

function load() {
  if (items) return items;
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {
    try { raw = JSON.parse(fs.readFileSync(SEED, 'utf8')); } catch (e2) { raw = { items: [] }; }
  }
  items = (raw.items || []).filter(function (i) { return i && i.text; }).map(clean);
  groups = (raw.groups || []).filter(function (g) { return g && g.id; }).map(function (g) { return { id: String(g.id), title: String(g.title || '') }; });
  return items;
}

function save() {
  if (!fs.existsSync(paths.DATA_DIR)) fs.mkdirSync(paths.DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ groups: groups || [], items: items }, null, 2));
  fs.renameSync(tmp, FILE);
}

function find(id) {
  const list = load();
  for (let i = 0; i < list.length; i++) if (list[i].id === String(id)) return list[i];
  const err = new Error('Attività non trovata');
  err.code = 'NOT_FOUND';
  throw err;
}

function groupTitle(noteId) {
  load();
  const g = (groups || []).filter(function (x) { return x.id === noteId; })[0];
  return g ? g.title : '';
}

const local = {
  list: function () { return load(); },
  notes: function () { load(); return (groups || []).slice(); },
  add: function (text, priority, noteId, id) {
    text = String(text || '').trim().slice(0, 200);
    if (!text) throw Object.assign(new Error('Testo vuoto'), { code: 'BAD_REQUEST' });
    load();
    if (!noteId && groups && groups.length) noteId = groups[0].id;
    const item = clean({ id: id, text: text, priority: priority, note: noteId || '', group: groupTitle(noteId) });
    items.push(item);
    save();
    return item;
  },
  toggle: function (id) { const it = find(id); it.done = !it.done; save(); return it; },
  remove: function (id) { find(id); items = load().filter(function (i) { return i.id !== String(id); }); save(); return true; },
  clearDone: function () { const before = load().length; items = load().filter(function (i) { return !i.done; }); save(); return before - items.length; },
  replace: function (snap) {
    items = (snap.items || []).filter(function (i) { return i && i.text; }).map(clean);
    groups = (snap.groups || []).map(function (g) { return { id: String(g.id), title: String(g.title || '') }; });
    save();
  },
  setGroups: function (list) { load(); groups = list.map(function (g) { return { id: String(g.id), title: String(g.title || '') }; }); save(); },
  setText: function (id, text) { const it = find(id); it.text = String(text).slice(0, 300); save(); }
};

function snapshot() {
  const memo = useMemo();
  const list = memo ? sticky.list() : local.list();
  return {
    groups: memo ? sticky.notes() : local.notes(),
    items: list.map(function (i) { return { id: i.id, text: i.text, done: !!i.done, note: i.note || '', group: i.group || '' }; })
  };
}

async function applyRemote(op) {
  const it = op.item;
  if (useMemo()) {
    if (op.type === 'add') {
      const target = sticky.notes().filter(function (n) { return n.id === it.note; })[0];
      const added = await sticky.add(it.text, target ? target.id : '', target ? '' : (it.group || settings().memo));
      if (it.done) await sticky.toggle(added.id);
      return;
    }
    if (op.type === 'toggle') {
      const cur = sticky.list().filter(function (x) { return x.id === it.id; })[0];
      if (cur && cur.done !== it.done) await sticky.toggle(it.id);
      return;
    }
    if (op.type === 'remove') { await sticky.remove(it.id); return; }
    return;
  }
  if (op.type === 'add') {
    const item = local.add(it.text, 'normal', it.note, it.id);
    if (it.done) local.toggle(item.id);
    return;
  }
  if (op.type === 'toggle') { const cur = find(it.id); if (cur.done !== it.done) local.toggle(it.id); return; }
  if (op.type === 'remove') { local.remove(it.id); return; }
  if (op.type === 'text') local.setText(it.id, it.text);
}

function wrap(fn) {
  return async function () {
    const r = await fn.apply(null, arguments);
    changed();
    return r;
  };
}

module.exports = {
  source: function () { return useMemo() ? 'memo' : 'local'; },
  notes: function () { return useMemo() ? sticky.notes() : local.notes(); },
  list: function () { return useMemo() ? sticky.list() : local.list(); },
  add: wrap(async function (text, priority, noteId) { return useMemo() ? sticky.add(text, noteId, settings().memo) : local.add(text, priority, noteId); }),
  toggle: wrap(async function (id) { return useMemo() ? sticky.toggle(id) : local.toggle(id); }),
  remove: wrap(async function (id) { return useMemo() ? sticky.remove(id) : local.remove(id); }),
  clearDone: wrap(async function () { return useMemo() ? sticky.clearDone() : local.clearDone(); }),
  snapshot: snapshot,
  applyRemote: applyRemote,
  replaceLocal: function (snap) { if (!useMemo()) local.replace(snap); },
  setLocalGroups: function (list) { if (!useMemo()) local.setGroups(list); },
  onChange: function (fn) { listeners.push(fn); },
  _reset: function () { items = null; groups = null; },
  _setSource: function (src) { forced = src; }
};
