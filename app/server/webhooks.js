const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const paths = require('./paths');
const log = require('./log');
const events = require('./events');

const NAME_RE = /^[a-z0-9_-]{1,40}$/;
const MAX_NAMES = 100;
const MAX_VALUE_CHARS = 8192;
const MAX_TEXT = { title: 80, message: 400 };
const KINDS = ['info', 'ok', 'err'];

function fail(message, code) { return Object.assign(new Error(message), { code: code || 'BAD_REQUEST' }); }

class JsonFile {
  constructor(name) { this.name = name; }
  file() { return path.join(paths.DATA_DIR, this.name); }
  read(fallback) {
    try { return JSON.parse(fs.readFileSync(this.file(), 'utf8')); } catch (e) { return fallback; }
  }
  write(data) {
    fs.mkdirSync(paths.DATA_DIR, { recursive: true });
    const tmp = this.file() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, this.file());
  }
}

class PushStore {
  constructor(file) {
    this.file = file;
    this.values = null;
  }

  load() {
    if (!this.values) {
      const data = this.file.read({});
      this.values = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    }
    return this.values;
  }

  set(name, value) {
    if (!NAME_RE.test(name)) throw fail('Nome non valido: usa minuscole, numeri, - e _ (massimo 40)');
    const all = this.load();
    if (!all[name] && Object.keys(all).length >= MAX_NAMES) throw fail('Troppi valori: al massimo ' + MAX_NAMES);
    const text = JSON.stringify(value);
    if (text === undefined || text.length > MAX_VALUE_CHARS) throw fail('Valore troppo grande');
    all[name] = { value: value, at: Date.now() };
    this.file.write(all);
    return all[name];
  }

  get(name) {
    const hit = this.load()[name];
    return hit ? hit : null;
  }

  remove(name) {
    const all = this.load();
    delete all[name];
    this.file.write(all);
  }

  list() {
    const all = this.load();
    return Object.keys(all).sort().map(function (n) { return { name: n, value: all[n].value, at: all[n].at }; });
  }

  reset() { this.values = null; }
}

const settings = new JsonFile('webhooks.json');
const store = new PushStore(new JsonFile('push.json'));

function newKey() { return crypto.randomBytes(18).toString('hex'); }

function key() {
  const data = settings.read({});
  if (data && typeof data.key === 'string' && data.key.length >= 16) return data.key;
  const fresh = newKey();
  settings.write({ key: fresh });
  log.info('webhook', 'Chiave webhook creata');
  return fresh;
}

function rotate() {
  const fresh = newKey();
  settings.write({ key: fresh });
  log.info('webhook', 'Chiave webhook cambiata');
  return fresh;
}

function sameKey(given) {
  const a = Buffer.from(String(given));
  const b = Buffer.from(key());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function plain(input) {
  const out = {};
  Object.keys(input || {}).forEach(function (k) {
    const v = input[k];
    out[k] = typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)) && v.length < 16 ? Number(v) : v;
  });
  return out;
}

function pushValue(name, body, query) {
  let value;
  if (body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length) value = body;
  else if (Array.isArray(body)) value = body;
  else if (query && Object.keys(query).length) value = plain(query);
  else throw fail('Manda un valore: JSON nel corpo o ?valore=... nell\'indirizzo');
  const saved = store.set(name, value);
  events.bus.publish('push', { name: name, value: value });
  return { name: name, at: saved.at };
}

function text(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

function notify(input) {
  input = input || {};
  const title = text(input.title, MAX_TEXT.title);
  const message = text(input.message || input.text, MAX_TEXT.message);
  if (!title && !message) throw fail('Serve un titolo o un messaggio');
  const kind = KINDS.indexOf(input.kind) >= 0 ? input.kind : 'info';
  events.bus.publish('notify', { title: title, message: message, kind: kind });
  return { title: title, message: message, kind: kind };
}

function goto(page) {
  const config = require('./config');
  const id = String(page || '');
  const known = config.dock().pages.some(function (p) { return p.id === id; });
  if (!known) throw fail('Pagina sconosciuta: ' + id);
  events.bus.publish('goto', { page: id });
  return { page: id };
}

function endpoints(base) {
  const k = key();
  return {
    key: k,
    push: base + '/hook/' + k + '/push/<name>',
    notify: base + '/hook/' + k + '/notify',
    goto: base + '/hook/' + k + '/goto/<page>'
  };
}

function guard(attempts) {
  return function (req, res, next) {
    if (sameKey(req.params.key)) return next();
    if (attempts(req)) return res.status(429).json({ ok: false, error: { code: 'RATE_LIMIT', message: 'Troppi tentativi, aspetta un minuto' } });
    res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Webhook sconosciuto' } });
  };
}

function router(express, attempts) {
  const r = express.Router({ mergeParams: true });
  const reply = function (fn) {
    return function (req, res) {
      try { res.json({ ok: true, data: fn(req) }); } catch (e) {
        res.status(e.code === 'BAD_REQUEST' ? 400 : 500).json({ ok: false, error: { code: e.code || 'ERROR', message: e.message } });
      }
    };
  };
  r.use(express.urlencoded({ extended: false, limit: '16kb' }));
  r.all('/:key/push/:name', guard(attempts), reply(function (req) { return pushValue(req.params.name, req.body, req.query); }));
  r.all('/:key/notify', guard(attempts), reply(function (req) { return notify(Object.assign({}, req.query, req.body)); }));
  r.all('/:key/goto/:page', guard(attempts), reply(function (req) { return goto(req.params.page); }));
  return r;
}

module.exports = { key: key, rotate: rotate, store: store, pushValue: pushValue, notify: notify, goto: goto, endpoints: endpoints, router: router, NAME_RE: NAME_RE };
