const fs = require('fs');
const path = require('path');
const { simpleParser } = require('mailparser');
const { Worker } = require('worker_threads');
const paths = require('../paths');
const platform = require('../platform');
const log = require('../log');
const secrets = require('../secrets');
const tb = require('./thunderbird');

const FILE = path.join(paths.DATA_DIR, 'mail.json');
const LIST_SIZE = 40;
const MAX_SOURCE = 3 * 1024 * 1024;
const MAX_TEXT = 20000;
const PROFILE_TTL = 15000;

let store = null;
let found = { at: 0, profile: null, accounts: [] };
const cache = {};

function fail(msg, code) { return Object.assign(new Error(msg), { code: code || 'UNAVAILABLE' }); }

function load() {
  if (store) return store;
  store = secrets.loadJson(FILE, log) || {};
  if (store.accounts) {
    delete store.accounts;
    save();
    log.info('mail', 'account IMAP vecchi rimossi da data/mail.json: ora la posta si legge da Thunderbird');
  }
  if (!Array.isArray(store.hidden)) store.hidden = [];
  return store;
}
function save() { secrets.writeJson(FILE, store); }

function discover(force) {
  if (!force && found.at && Date.now() - found.at < PROFILE_TTL) return found;
  const profile = tb.findProfile();
  let list = [];
  if (profile && profile.dir) {
    try { list = tb.accounts(profile.dir); } catch (e) { log.debug('mail', 'prefs.js: ' + e.message); }
  }
  found = { at: Date.now(), profile: profile, accounts: list };
  return found;
}

function account(id) {
  const a = discover().accounts.filter(function (x) { return x.key === id; })[0];
  if (!a) throw fail('Account non trovato in Thunderbird (è stato rimosso?)', 'NOT_FOUND');
  return a;
}

function stampOf(file) {
  try { const s = fs.statSync(file); return s.size + ':' + s.mtimeMs; } catch (e) { return ''; }
}

function parseInWorker(job) {
  return new Promise(function (resolve, reject) {
    const w = new Worker(path.join(__dirname, 'thunderbird-worker.js'), { workerData: job });
    w.once('message', resolve);
    w.once('error', reject);
    w.once('exit', function (code) { if (code) reject(new Error('lettura interrotta (' + code + ')')); });
  });
}

const pending = {};
function readInbox(a) {
  const inbox = tb.inboxPath(a);
  const stamp = stampOf(inbox + '.msf') + '|' + stampOf(inbox);
  const c = cache[a.key];
  if (c && c.stamp === stamp) return Promise.resolve(c);
  if (pending[a.key] && pending[a.key].stamp === stamp) return pending[a.key].promise;
  const promise = parseInWorker({ inbox: inbox, maildir: a.maildir }).then(function (r) {
    if (r.error) {
      if (c) return c;
      if (r.error === 'missing') throw fail('Posta in arrivo di ' + a.email + ' non ancora scaricata: apri Thunderbird e aspetta che finisca di sincronizzare', 'UNAVAILABLE');
      throw fail('File di Thunderbird illeggibile (' + r.error + ')', 'UNAVAILABLE');
    }
    const messages = r.messages.map(function (m) { return Object.assign(m, { date: new Date(m.date) }); });
    messages.sort(function (x, y) { return y.date - x.date; });
    const out = { stamp: stamp, messages: messages, unread: messages.filter(function (m) { return !m.seen; }).length, total: messages.length, error: '' };
    cache[a.key] = out;
    return out;
  }).catch(function (e) {
    errors[a.key] = e.message;
    throw e.code ? e : fail(e.message);
  }).finally(function () {
    if (pending[a.key] && pending[a.key].promise === promise) delete pending[a.key];
  });
  pending[a.key] = { stamp: stamp, promise: promise };
  return promise.then(function (d) { delete errors[a.key]; return d; });
}
const errors = {};

async function check() {
  const f = discover(true);
  await Promise.all(f.accounts.map(function (a) { return readInbox(a).catch(function () { return null; }); }));
  return f;
}

async function startupCheck() {
  const f = await check();
  if (!f.profile) { log.info('mail', 'Thunderbird non trovato: la pagina EMAIL resta vuota (vedi pannello > Email)'); return; }
  if (!f.accounts.length) { log.info('mail', 'Thunderbird trovato, ma senza account di posta'); return; }
  log.info('mail', 'Thunderbird: ' + f.accounts.map(function (a) {
    const c = cache[a.key];
    return a.email + (c ? ' (' + c.total + ' messaggi, ' + c.unread + ' da leggere)' : ' (' + (errors[a.key] || 'non letto') + ')');
  }).join(', '));
}

function visible() {
  const hidden = load().hidden;
  return discover().accounts.filter(function (a) { return hidden.indexOf(a.key) < 0; });
}

const SERVICES = [[/gmail|googlemail/, 'Gmail'], [/outlook|office365|hotmail|live./, 'Outlook'], [/icloud|me.com|mac.com/, 'iCloud'],
  [/yahoo/, 'Yahoo'], [/libero/, 'Libero'], [/virgilio/, 'Virgilio'], [/aruba/, 'Aruba'], [/tiscali/, 'Tiscali']];
function accountLabel(a) {
  if (a.name && a.name !== a.email && a.name !== a.host) return a.name;
  const host = String(a.host || '').toLowerCase();
  for (let i = 0; i < SERVICES.length; i++) if (SERVICES[i][0].test(host)) return SERVICES[i][1];
  return String(a.email || '').split('@')[1] || a.host || 'Email';
}

function publicAccount(a) {
  const c = cache[a.key];
  const err = errors[a.key] || '';
  return { id: a.key, label: accountLabel(a), provider: 'thunderbird', email: a.email, unread: c ? c.unread : null, status: c ? 'ready' : err ? 'error' : pending[a.key] ? 'loading' : 'idle', error: c ? '' : err };
}

function state() {
  return { accounts: visible().map(publicAccount) };
}

async function list(id) {
  const a = account(id);
  const d = await readInbox(a);
  return {
    account: publicAccount(a),
    unread: d.unread,
    total: d.total,
    messages: d.messages.slice(0, LIST_SIZE).map(function (m) {
      return { uid: m.key, from: m.from, subject: m.subject, date: m.date.toISOString(), seen: m.seen, flagged: m.flagged };
    })
  };
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function addr(list) {
  const x = (list || [])[0];
  return x ? { name: x.name || '', address: x.address || '' } : { name: '', address: '' };
}

async function message(id, uid) {
  uid = String(uid || '');
  if (!/^[\w.,:+=-]{1,200}$/.test(uid)) throw fail('Messaggio non valido', 'BAD_REQUEST');
  const a = account(id);
  const d = await readInbox(a);
  const m = d.messages.filter(function (x) { return x.key === uid; })[0];
  if (!m) throw fail('Messaggio non trovato (forse spostato o cancellato)', 'NOT_FOUND');
  const src = tb.readSource(tb.inboxPath(a), m, a.maildir, MAX_SOURCE);
  if (!src) {
    return {
      uid: uid, subject: m.subject, from: m.from, to: [], date: m.date.toISOString(), attachments: [], truncated: false,
      text: 'Il testo di questo messaggio non è sul PC.\n\nIn Thunderbird: impostazioni dell\'account > Sincronizzazione e archiviazione > "Conserva i messaggi di questo account sul computer", oppure apri il messaggio una volta in Thunderbird.'
    };
  }
  const parsed = await simpleParser(src);
  let text = parsed.text || htmlToText(parsed.html);
  const cut = text.length > MAX_TEXT;
  if (cut) text = text.slice(0, MAX_TEXT);
  return {
    uid: uid,
    subject: parsed.subject || m.subject,
    from: parsed.from ? addr(parsed.from.value) : m.from,
    to: ((parsed.to && parsed.to.value) || []).map(function (x) { return x.address; }).slice(0, 5),
    date: (parsed.date || m.date).toISOString(),
    text: text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
    truncated: cut,
    attachments: (parsed.attachments || []).filter(function (x) { return x.contentDisposition !== 'inline'; })
      .map(function (x) { return x.filename || 'allegato'; }).slice(0, 10)
  };
}

async function openWebmail() {
  const exe = tb.executable();
  if (exe) await platform.launch({ path: exe });
  else if (process.platform !== 'win32') await platform.launch({ path: 'thunderbird' });
  else throw fail('Thunderbird non trovato sul PC', 'UNSUPPORTED');
  return { message: 'Thunderbird aperto sul PC' };
}

function panelInfo() {
  const f = discover(true);
  const hidden = load().hidden;
  return {
    source: 'thunderbird',
    download: tb.DOWNLOAD_URL,
    installed: !!(tb.executable() || f.profile),
    profile: !!(f.profile && f.profile.dir),
    exe: !!tb.executable(),
    accounts: f.accounts.map(function (a) {
      readInbox(a).catch(function () {});
      return Object.assign(publicAccount(a), { host: a.host, shown: hidden.indexOf(a.key) < 0, offline: a.offline });
    })
  };
}

function setShown(id, shown) {
  account(id);
  const s = load();
  s.hidden = s.hidden.filter(function (x) { return x !== id; });
  if (!shown) s.hidden.push(id);
  save();
}

module.exports = {
  state: state,
  list: list,
  message: message,
  openWebmail: openWebmail,
  panelInfo: panelInfo,
  setShown: setShown,
  check: check,
  startupCheck: startupCheck,
  htmlToText: htmlToText,
  _reset: function () { store = null; Object.keys(errors).forEach(function (k) { delete errors[k]; }); found = { at: 0, profile: null, accounts: [] }; Object.keys(cache).forEach(function (k) { delete cache[k]; }); }
};
