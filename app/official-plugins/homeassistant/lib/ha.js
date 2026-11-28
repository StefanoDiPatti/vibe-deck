'use strict';

const TIMEOUT_MS = 8000;
const CACHE_MS = 2000;
const MAX_FAVORITES = 24;
const MAX_BODY = 4000;
const ENTITY_RE = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const NAME_RE = /^[a-z0-9_]+$/;

const TAP = {
  light: ['light', 'toggle'],
  switch: ['switch', 'toggle'],
  input_boolean: ['input_boolean', 'toggle'],
  fan: ['fan', 'toggle'],
  humidifier: ['humidifier', 'toggle'],
  automation: ['automation', 'toggle'],
  scene: ['scene', 'turn_on'],
  script: ['script', 'turn_on'],
  button: ['button', 'press'],
  input_button: ['input_button', 'press'],
  media_player: ['media_player', 'media_play_pause']
};
const BLOCKED_DOMAINS = ['lock', 'alarm_control_panel', 'shell_command', 'python_script', 'hassio', 'rest_command'];
const BLOCKED_SERVICES = ['homeassistant.restart', 'homeassistant.stop', 'homeassistant.reload_all', 'homeassistant.set_location'];
const STATE_TEXT = { on: 'ACCESO', off: 'SPENTO', unavailable: 'NON DISPONIBILE', unknown: '?', home: 'A CASA', not_home: 'FUORI', open: 'APERTO', closed: 'CHIUSO', playing: 'IN RIPRODUZIONE', paused: 'IN PAUSA', idle: 'FERMO', heat: 'CALDO', cool: 'FREDDO', auto: 'AUTO' };

function fail(message, code) { return Object.assign(new Error(message), { code: code || 'UNAVAILABLE' }); }

function cleanUrl(text) {
  const url = String(text || '').trim().replace(/\/+$/, '').replace(/\/api$/, '');
  if (!/^https?:\/\/[^\s/]+(:\d+)?(\/[^\s]*)?$/i.test(url)) throw fail('L\'indirizzo deve essere come http://homeassistant.local:8123', 'BAD_REQUEST');
  return url;
}

function domainOf(id) { return String(id).split('.')[0]; }

function describe(state) {
  const attrs = state.attributes || {};
  const domain = domainOf(state.entity_id);
  const unit = attrs.unit_of_measurement || '';
  const raw = String(state.state);
  const text = STATE_TEXT[raw] || (unit ? raw + ' ' + unit : raw);
  return {
    id: state.entity_id,
    name: attrs.friendly_name || state.entity_id,
    domain: domain,
    state: raw,
    on: raw === 'on' || raw === 'open' || raw === 'playing' || raw === 'home',
    unit: unit,
    label: text,
    tap: !!TAP[domain],
    icon: domain === 'light' ? 'bolt' : domain === 'switch' || domain === 'input_boolean' ? 'power' : domain === 'media_player' ? 'music' : domain === 'scene' ? 'palette' : domain === 'script' || domain === 'automation' ? 'play' : domain === 'sensor' || domain === 'binary_sensor' ? 'info' : 'apps'
  };
}

class HomeAssistant {
  constructor(opts) {
    const o = opts || {};
    this.secrets = o.secrets;
    this.file = o.file;
    this.fetch = o.fetch || fetch;
    this.log = o.log || { info: function () {}, warn: function () {} };
    this.cache = { at: 0, list: null };
  }

  settings() {
    const s = (this.secrets && this.file && this.secrets.loadJson(this.file, this.log)) || {};
    return { url: String(s.url || ''), token: String(s.token || ''), favorites: Array.isArray(s.favorites) ? s.favorites.filter(function (x) { return ENTITY_RE.test(String(x)); }) : [] };
  }

  write(next) {
    this.secrets.writeJson(this.file, next);
    this.cache = { at: 0, list: null };
  }

  save(input) {
    const b = input || {};
    const old = this.settings();
    const url = b.url === undefined ? old.url : (String(b.url).trim() === '' ? '' : cleanUrl(b.url));
    const token = b.token === undefined || b.token === '' ? old.token : String(b.token).trim();
    if (token && !/^[\x21-\x7e]{20,600}$/.test(token)) throw fail('Il token sembra sbagliato (si crea dal profilo di Home Assistant)', 'BAD_REQUEST');
    this.write({ url: url, token: b.removeToken ? '' : token, favorites: old.favorites });
  }

  setFavorites(list) {
    if (!Array.isArray(list)) throw fail('Lista non valida', 'BAD_REQUEST');
    const clean = [];
    list.forEach(function (x) { if (ENTITY_RE.test(String(x)) && clean.indexOf(String(x)) < 0) clean.push(String(x)); });
    if (clean.length > MAX_FAVORITES) throw fail('Al massimo ' + MAX_FAVORITES + ' dispositivi', 'BAD_REQUEST');
    const s = this.settings();
    this.write({ url: s.url, token: s.token, favorites: clean });
    return clean;
  }

  async call(path, init) {
    const s = this.settings();
    if (!s.url || !s.token) throw fail('Home Assistant non è collegato: aggiungi indirizzo e token nel pannello', 'NOT_CONFIGURED');
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    try {
      const res = await this.fetch(s.url + path, Object.assign({ signal: ctrl.signal, redirect: 'error' }, init, { headers: Object.assign({ Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, (init && init.headers) || {}) }));
      if (res.status === 401 || res.status === 403) throw fail('Home Assistant ha rifiutato il token', 'UNAUTHORIZED');
      if (res.status === 404) throw fail('Non trovato su Home Assistant', 'NOT_FOUND');
      if (!res.ok) throw fail('Home Assistant ha risposto ' + res.status);
      const text = await res.text();
      try { return JSON.parse(text); } catch (e) { return text; }
    } catch (e) {
      if (e.name === 'AbortError') throw fail('Home Assistant non risponde');
      if (e.code) throw e;
      throw fail('Home Assistant non raggiungibile (' + (e.cause && e.cause.code || e.message) + ')');
    } finally { clearTimeout(timer); }
  }

  async states(force) {
    if (!force && this.cache.list && Date.now() - this.cache.at < CACHE_MS) return this.cache.list;
    const list = await this.call('/api/states');
    if (!Array.isArray(list)) throw fail('Risposta inattesa da Home Assistant');
    this.cache = { at: Date.now(), list: list };
    return list;
  }

  async entity(id) {
    if (!ENTITY_RE.test(String(id || ''))) throw fail('Nome del dispositivo non valido (es. light.salotto)', 'BAD_REQUEST');
    const all = await this.states();
    const hit = all.filter(function (s) { return s.entity_id === id; })[0];
    if (!hit) throw fail('Dispositivo non trovato: ' + id, 'NOT_FOUND');
    return hit;
  }

  async service(domain, service, data) {
    domain = String(domain || ''); service = String(service || '');
    if (!NAME_RE.test(domain) || !NAME_RE.test(service)) throw fail('Servizio non valido', 'BAD_REQUEST');
    if (BLOCKED_DOMAINS.indexOf(domain) >= 0 || BLOCKED_SERVICES.indexOf(domain + '.' + service) >= 0) throw fail('Per sicurezza il servizio ' + domain + '.' + service + ' non si può chiamare da qui', 'FORBIDDEN');
    const body = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    await this.call('/api/services/' + domain + '/' + service, { method: 'POST', body: JSON.stringify(body) });
    this.cache.at = 0;
    return { message: 'Fatto: ' + domain + '.' + service };
  }

  async tap(id) {
    const hit = await this.entity(id);
    const rule = TAP[domainOf(hit.entity_id)];
    if (!rule) throw fail('Questo dispositivo non si comanda con un tocco (' + domainOf(hit.entity_id) + ')', 'FORBIDDEN');
    await this.service(rule[0], rule[1], { entity_id: hit.entity_id });
    return { message: (hit.attributes && hit.attributes.friendly_name || hit.entity_id) + ': ' + rule[1].replace('_', ' ') };
  }

  async view() {
    const s = this.settings();
    if (!s.url || !s.token) return { connected: false, devices: [], count: 0, error: 'Home Assistant non è collegato: aggiungi indirizzo e token nel pannello' };
    try {
      const all = await this.states();
      const by = {};
      all.forEach(function (x) { by[x.entity_id] = x; });
      const devices = s.favorites.filter(function (id) { return by[id]; }).map(function (id) { return describe(by[id]); });
      return { connected: true, devices: devices, count: devices.length, on: devices.filter(function (d) { return d.on; }).length, error: '' };
    } catch (e) {
      return { connected: false, devices: [], count: 0, error: e.message };
    }
  }

  async read(id) {
    try {
      const state = await this.entity(id);
      const d = describe(state);
      return Object.assign({ connected: true, error: '', attributes: state.attributes || {} }, d);
    } catch (e) {
      return { connected: false, error: e.message, id: id, name: id, state: '', label: '', on: false };
    }
  }

  async catalog() {
    const all = await this.states(true);
    return all.map(describe).sort(function (a, b) { return a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name); })
      .map(function (d) { return { id: d.id, name: d.name, domain: d.domain, label: d.label, tap: d.tap }; });
  }

  panelInfo() {
    const s = this.settings();
    return { url: s.url, hasToken: !!s.token, favorites: s.favorites, max: MAX_FAVORITES };
  }

  async test() {
    const all = await this.states(true);
    return { count: all.length, domains: Object.keys(all.reduce(function (o, x) { o[domainOf(x.entity_id)] = 1; return o; }, {})).length };
  }
}

function hostAllowed(url) {
  try { const u = new URL(url); return /^https?:$/.test(u.protocol); } catch (e) { return false; }
}

async function webhook(args, transport) {
  const url = String(args.url || '').trim();
  if (!hostAllowed(url)) throw fail('L\'indirizzo deve iniziare con http:// o https://', 'BAD_REQUEST');
  const method = String(args.method || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST';
  const body = method === 'POST' && args.body !== undefined && args.body !== '' ? String(args.body).slice(0, MAX_BODY) : undefined;
  const headers = { 'User-Agent': 'VibeDeck' };
  if (body !== undefined) headers['Content-Type'] = /^\s*[{[]/.test(body) ? 'application/json' : 'text/plain';
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
  try {
    const res = await (transport || fetch)(url, { method: method, headers: headers, body: body, signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw fail('L\'indirizzo ha risposto ' + res.status);
    return { message: 'Chiamato (' + res.status + ')' };
  } catch (e) {
    if (e.name === 'AbortError') throw fail('L\'indirizzo non risponde');
    if (e.code) throw e;
    throw fail('Non raggiungibile (' + (e.cause && e.cause.code || e.message) + ')');
  } finally { clearTimeout(timer); }
}

module.exports = { HomeAssistant: HomeAssistant, webhook: webhook, describe: describe, TAP: TAP, BLOCKED_DOMAINS: BLOCKED_DOMAINS, cleanUrl: cleanUrl, ENTITY_RE: ENTITY_RE };
