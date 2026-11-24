const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const common = require('../../../server/platform/common');

const PACKAGE = 'Microsoft.MicrosoftStickyNotes_8wekyb3d8bbwe';
const PROCESS = 'Microsoft.Notes.exe';
const RESTART_DELAY = 1200;

let sqlite = null;
function driver() {
  if (sqlite === null) {
    try {
      sqlite = require('node:sqlite');
    } catch (e) { sqlite = false; }
  }
  return sqlite;
}

let testDb = null;

function dbPath() {
  if (testDb) return testDb;
  return process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Packages', PACKAGE, 'LocalState', 'plum.sqlite') : '';
}

function available() {
  if (testDb) return !!driver() && fs.existsSync(testDb);
  return process.platform === 'win32' && !!driver() && !!dbPath() && fs.existsSync(dbPath());
}

function open(readOnly) {
  return new (driver().DatabaseSync)(dbPath(), { readOnly: !!readOnly });
}

const FORMAT = { b: 'bold', i: 'italic', ul: 'underline', strike: 'strike' };

function parseRich(s) {
  const chars = [];
  const on = { bold: false, italic: false, underline: false, strike: false };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      if (s[i + 1] === '\\') { chars.push({ c: '\\', st: Object.assign({}, on) }); i++; continue; }
      const m = /^\\([a-z]+)(-?\d*) ?/.exec(s.slice(i));
      if (m) {
        if (FORMAT[m[1]]) on[FORMAT[m[1]]] = m[2] !== '0';
        i += m[0].length - 1;
        continue;
      }
    }
    chars.push({ c: c, st: Object.assign({}, on) });
  }
  return chars;
}

const MARKER = /^\s*([-–•*]|\d+[.)]|\[[ xX]?\])\s+/;

function splitLines(text) {
  const sep = /\r\n/.test(text) ? '\r\n' : '\n';
  return {
    sep: sep,
    lines: String(text || '').split(sep).map(function (raw) {
      const m = /^\\id=([0-9a-fA-F-]+) ?([\s\S]*)$/.exec(raw);
      return m ? { id: m[1], body: m[2], orig: m[2], raw: raw } : { id: null, body: raw, orig: raw, raw: raw };
    })
  };
}

function describeLine(body) {
  const chars = parseRich(body);
  const full = chars.map(function (x) { return x.c; }).join('');
  const marker = MARKER.exec(full);
  const start = marker ? marker[0].length : 0;
  const visible = chars.slice(start).filter(function (x) { return /\S/.test(x.c); });
  const text = full.slice(start).replace(/\s+/g, ' ').trim();
  const struck = visible.length > 0 && visible.every(function (x) { return x.st.strike; });
  const checked = !!(marker && /\[[xX]\]/.test(marker[1]));
  const heading = !marker && visible.length > 0 && visible.every(function (x) { return x.st.bold || x.st.underline || x.st.italic; }) && !struck;
  const rest = chars.slice(start);
  let k = 0;
  while (k < rest.length && (rest[k].st.bold || rest[k].st.underline)) k++;
  let label = k > 0 && k < rest.length ? rest.slice(0, k).map(function (x) { return x.c; }).join('').replace(/\s+/g, ' ').trim() : '';
  if (label && text.indexOf(label) !== 0) label = '';
  return { text: text, label: label, done: struck || checked, heading: heading, marker: marker ? marker[1] : '' };
}

function describeNote(row) {
  const parsed = splitLines(row.Text);
  const lines = parsed.lines.filter(function (l) { return l.id; }).map(function (l) {
    return Object.assign({ lineId: l.id }, describeLine(l.body));
  }).filter(function (l) { return l.text; });
  let title = '';
  if (lines.length > 1 && lines[0].heading) title = lines.shift().text;
  return {
    id: row.Id,
    title: title,
    updated: Number(row.u || 0),
    items: lines.map(function (l) {
      return { id: row.Id + ':' + l.lineId, text: l.text.slice(0, 300), label: l.label, done: l.done, priority: 'normal', note: row.Id };
    })
  };
}

let cache = null;
function readNotes() {
  if (cache && Date.now() - cache.at < 1500) return cache.notes;
  const db = open(true);
  try {
    const rows = db.prepare(
      'select Id, Text, cast(UpdatedAt as text) as u from Note ' +
      'where DeletedAt is null and coalesce(IsFutureNote, 0) = 0 and Text is not null'
    ).all();
    const notes = rows.map(describeNote).filter(function (n) { return n.items.length || n.title; });
    notes.sort(function (a, b) { return b.updated - a.updated; });
    notes.forEach(function (n, i) { if (!n.title) n.title = 'Memo ' + (i + 1); });
    cache = { at: Date.now(), notes: notes };
    return notes;
  } finally {
    db.close();
  }
}

function list() {
  const out = [];
  readNotes().forEach(function (n) {
    n.items.forEach(function (it) { out.push(Object.assign({ group: n.title }, it)); });
  });
  return out;
}

function notes() {
  return readNotes().map(function (n) { return { id: n.id, title: n.title }; });
}

function targetNote(noteId, preferred) {
  const all = readNotes();
  if (!all.length) throw Object.assign(new Error('Nessuna memo trovata: creane una nell\'app Memo'), { code: 'NOT_FOUND' });
  if (noteId) {
    const byId = all.filter(function (n) { return n.id === noteId; })[0];
    if (byId) return byId;
  }
  if (preferred) {
    const want = String(preferred).toLowerCase();
    const byTitle = all.filter(function (n) { return n.title.toLowerCase().indexOf(want) >= 0; })[0];
    if (byTitle) return byTitle;
  }
  return all[0];
}

async function isRunning() {
  const r = await common.run('tasklist', ['/FI', 'IMAGENAME eq ' + PROCESS, '/NH', '/FO', 'CSV'], { timeout: 4000 });
  return r.stdout.toLowerCase().indexOf(PROCESS.toLowerCase()) >= 0;
}

function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function stopApp() {
  await common.run('taskkill', ['/F', '/IM', PROCESS], { timeout: 5000 });
  for (let i = 0; i < 20; i++) {
    if (!(await isRunning())) break;
    await wait(150);
  }
  await wait(250);
}

function startApp() {
  return common.spawnDetached('explorer.exe', ['shell:AppsFolder\\' + PACKAGE + '!App']).catch(function () { });
}

let chain = Promise.resolve();
let restartTimer = null;

function ticksNow() {
  return (BigInt(Date.now()) + 62135596800000n) * 10000n;
}

function enqueueSync(db, noteId) {
  const row = db.prepare('select OutboundQueueJson as q from SyncState limit 1').get();
  if (!row) return;
  let queue = [];
  try { queue = JSON.parse(row.q || '[]'); } catch (e) { queue = []; }
  if (!Array.isArray(queue)) queue = [];
  const already = queue.some(function (op) { return op && op.type === 'update' && op.localNoteId === noteId; });
  if (!already) {
    queue.push({ type: 'update', localNoteId: noteId });
    db.prepare('update SyncState set OutboundQueueJson = ?').run(JSON.stringify(queue));
  }
}

function mutate(noteId, fn) {
  const job = chain.then(async function () {
    const pending = !!restartTimer;
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
    const running = !testDb && (pending || (await isRunning()));
    if (running && !pending) await stopApp();
    try {
      const db = open(false);
      try {
        const row = db.prepare('select Id, Text from Note where Id = ? and DeletedAt is null').get(noteId);
        if (!row) throw Object.assign(new Error('Memo non trovata (forse cancellata sul PC)'), { code: 'NOT_FOUND' });
        const parsed = splitLines(row.Text || '');
        const result = fn(parsed.lines);
        const text = parsed.lines.map(function (l) {
          if (l.body === l.orig) return l.raw;
          return l.id ? '\\id=' + l.id + ' ' + l.body : l.body;
        }).join(parsed.sep);
        db.prepare('update Note set Text = ?, UpdatedAt = ? where Id = ?').run(text, ticksNow(), noteId);
        enqueueSync(db, noteId);
        return result;
      } finally {
        db.close();
        cache = null;
      }
    } finally {
      if (running) restartTimer = setTimeout(function () { restartTimer = null; startApp(); }, RESTART_DELAY);
    }
  });
  chain = job.catch(function () {});
  return job;
}

function splitId(id) {
  const m = /^([0-9a-fA-F-]+):([0-9a-fA-F-]+)$/.exec(String(id || ''));
  if (!m) throw Object.assign(new Error('Attività non valida'), { code: 'BAD_REQUEST' });
  return { note: m[1], line: m[2] };
}

function findLine(lines, lineId) {
  for (let i = 0; i < lines.length; i++) if (lines[i].id === lineId) return i;
  throw Object.assign(new Error('Riga non trovata: la memo è cambiata, aggiorna'), { code: 'NOT_FOUND' });
}

function cleanText(text) {
  return String(text || '').replace(/[\r\n\t]+/g, ' ').replace(/\\/g, '/').replace(/\s+/g, ' ').trim().slice(0, 200);
}

function stripStrike(body) { return body.replace(/\\strike0? ?/g, ''); }

module.exports = {
  available: available,
  list: list,
  notes: notes,

  add: function (text, noteId, preferred) {
    const clean = cleanText(text);
    if (!clean) return Promise.reject(Object.assign(new Error('Testo vuoto'), { code: 'BAD_REQUEST' }));
    const note = targetNote(noteId, preferred);
    return mutate(note.id, function (lines) {
      let marker = '- ';
      for (let i = lines.length - 1; i >= 0; i--) {
        if (!lines[i].id) continue;
        const d = describeLine(lines[i].body);
        if (d.marker && !/\[/.test(d.marker)) { marker = d.marker + ' '; break; }
        if (d.text && !d.heading) { marker = ''; break; }
      }
      let line = lines[lines.length - 1];
      if (!line || !line.id || describeLine(line.body).text) {
        line = { id: crypto.randomUUID(), body: '' };
        lines.push(line);
      }
      line.body = marker + clean;
      return { id: note.id + ':' + line.id, text: clean, done: false, priority: 'normal', note: note.id, group: note.title };
    });
  },

  toggle: function (id) {
    const ref = splitId(id);
    return mutate(ref.note, function (lines) {
      const i = findLine(lines, ref.line);
      const d = describeLine(lines[i].body);
      const plain = stripStrike(lines[i].body);
      lines[i].body = d.done ? plain.replace(/\[[xX]\]/, '[ ]') : '\\strike ' + plain + '\\strike0';
      return { id: id, text: d.text, done: !d.done };
    });
  },

  remove: function (id) {
    const ref = splitId(id);
    return mutate(ref.note, function (lines) {
      lines.splice(findLine(lines, ref.line), 1);
      return true;
    });
  },

  clearDone: async function () {
    let removed = 0;
    const all = readNotes();
    for (let n = 0; n < all.length; n++) {
      const doneIds = all[n].items.filter(function (it) { return it.done; }).map(function (it) { return splitId(it.id).line; });
      if (!doneIds.length) continue;
      removed += await mutate(all[n].id, function (lines) {
        let count = 0;
        for (let i = lines.length - 1; i >= 0; i--) {
          if (doneIds.indexOf(lines[i].id) >= 0) { lines.splice(i, 1); count++; }
        }
        return count;
      });
    }
    return removed;
  },

  _useTestDb: function (p) { testDb = p; cache = null; },
  _parse: { parseRich: parseRich, describeLine: describeLine, describeNote: describeNote, splitLines: splitLines }
};
