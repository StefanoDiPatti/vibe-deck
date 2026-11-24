'use strict';
const fs = require('fs');
const path = require('path');

const DDRAGON = process.env.LOL_DDRAGON || 'https://ddragon.leagueoflegends.com';
const MERAKI = process.env.LOL_MERAKI || 'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json';
const LOCALE = 'it_IT';
const UA = 'VibeDeck (+https://github.com/StefanoDiPatti/vibe-deck)';
const VERSION_TTL_MS = 6 * 3600 * 1000;
const ROLES_TTL_MS = 7 * 24 * 3600 * 1000;
const TIMEOUT_MS = 20000;
const ROLE_OF = { TOP: 'top', JUNGLE: 'jungle', MIDDLE: 'mid', BOTTOM: 'adc', SUPPORT: 'support' };
const ROLES = ['top', 'jungle', 'mid', 'adc', 'support'];
const IMAGE_KINDS = ['champion', 'spell', 'passive'];
const IMAGE_RE = /^[A-Za-z0-9_.-]+\.png$/;
const ID_RE = /^[A-Za-z0-9]+$/;

function fail(message, code) { return Object.assign(new Error(message), { code: code || 'UNAVAILABLE' }); }

async function download(url, binary) {
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA } });
    if (!res.ok) throw fail('Riot non risponde (' + res.status + ')');
    return binary ? Buffer.from(await res.arrayBuffer()) : JSON.parse(await res.text());
  } catch (e) {
    if (e.name === 'AbortError') throw fail('Riot non risponde');
    if (e.code) throw e;
    throw fail('Dati di League of Legends non raggiungibili (internet?)');
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(s) {
  return String(s || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\{\{[^}]*\}\}/g, '…').replace(/\s+/g, ' ').trim();
}

function uggSlug(id) {
  return id === 'MonkeyKing' ? 'wukong' : String(id).toLowerCase();
}

function uggUrl(id, role) {
  return 'https://u.gg/lol/champions/' + uggSlug(id) + '/build' + (ROLES.indexOf(role) >= 0 ? '?role=' + role : '');
}

class DiskCache {
  constructor(dir) { this.dir = dir; }
  file(name) { return path.join(this.dir, name); }
  readJson(name, maxAge) {
    try {
      const f = this.file(name);
      if (maxAge && Date.now() - fs.statSync(f).mtimeMs > maxAge) return null;
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) { return null; }
  }
  writeJson(name, data) {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.file(name), JSON.stringify(data));
  }
  readBuffer(name) { try { return fs.readFileSync(this.file(name)); } catch (e) { return null; } }
  writeBuffer(name, buf) {
    const f = this.file(name);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, buf);
  }
}

class LolData {
  constructor(dataDir) {
    this.cache = new DiskCache(dataDir);
    this.version = { value: '', at: 0 };
    this.list = null;
    this.details = {};
    this.pending = null;
  }

  async currentVersion() {
    if (this.version.value && Date.now() - this.version.at < VERSION_TTL_MS) return this.version.value;
    try {
      const versions = await download(DDRAGON + '/api/versions.json');
      this.version = { value: String(versions[0]), at: Date.now() };
    } catch (e) {
      const saved = this.cache.readJson('champions.json');
      if (!saved) throw e;
      this.version = { value: saved.version, at: Date.now() };
    }
    return this.version.value;
  }

  async roles() {
    const fresh = this.cache.readJson('roles.json', ROLES_TTL_MS);
    if (fresh) return fresh;
    try {
      const all = await download(MERAKI);
      const out = {};
      Object.keys(all).forEach(function (id) {
        out[id] = (all[id].positions || []).map(function (p) { return ROLE_OF[p]; }).filter(Boolean);
      });
      this.cache.writeJson('roles.json', out);
      return out;
    } catch (e) {
      return this.cache.readJson('roles.json') || {};
    }
  }

  async champions() {
    if (this.pending) return this.pending;
    const self = this;
    this.pending = (async function () {
      const version = await self.currentVersion();
      if (self.list && self.list.version === version) return self.list;
      const saved = self.cache.readJson('champions.json');
      if (saved && saved.version === version && saved.champions.length) { self.list = saved; return saved; }
      const [data, roles] = await Promise.all([download(DDRAGON + '/cdn/' + version + '/data/' + LOCALE + '/champion.json'), self.roles()]);
      const champions = Object.keys(data.data || {}).map(function (id) {
        const c = data.data[id];
        return { id: c.id, name: c.name, title: c.title, tags: c.tags || [], roles: roles[c.id] || [] };
      }).sort(function (a, b) { return a.name.localeCompare(b.name, 'it'); });
      self.list = { version: version, roles: ROLES, champions: champions };
      self.cache.writeJson('champions.json', self.list);
      return self.list;
    })().finally(function () { self.pending = null; });
    return this.pending;
  }

  async champion(id) {
    if (!ID_RE.test(String(id || ''))) throw fail('Campione non valido', 'BAD_REQUEST');
    const list = await this.champions();
    const base = list.champions.filter(function (c) { return c.id === id; })[0];
    if (!base) throw fail('Campione non trovato: ' + id, 'NOT_FOUND');
    const key = list.version + '/' + id;
    if (this.details[key]) return this.details[key];
    const data = await download(DDRAGON + '/cdn/' + list.version + '/data/' + LOCALE + '/champion/' + id + '.json');
    const c = data.data[id];
    const keys = ['Q', 'W', 'E', 'R'];
    const out = Object.assign({}, base, {
      lore: stripHtml(c.blurb),
      abilities: [{ key: 'P', name: c.passive.name, text: stripHtml(c.passive.description), image: 'passive/' + c.passive.image.full }]
        .concat(c.spells.map(function (s, i) {
          return { key: keys[i], name: s.name, text: stripHtml(s.description), image: 'spell/' + s.image.full, cooldown: s.cooldownBurn };
        })),
      builds: (base.roles.length ? base.roles : ['']).map(function (r) { return { role: r, url: uggUrl(id, r) }; })
    });
    this.details[key] = out;
    return out;
  }

  async image(kind, file) {
    if (IMAGE_KINDS.indexOf(kind) < 0 || !IMAGE_RE.test(String(file || ''))) throw fail('Immagine non valida', 'BAD_REQUEST');
    const version = await this.currentVersion();
    const name = path.join('img', version, kind, file);
    const cached = this.cache.readBuffer(name);
    if (cached) return cached;
    const buf = await download(DDRAGON + '/cdn/' + version + '/img/' + kind + '/' + file, true);
    this.cache.writeBuffer(name, buf);
    return buf;
  }
}

module.exports = { LolData: LolData, uggUrl: uggUrl, uggSlug: uggSlug, stripHtml: stripHtml, ROLES: ROLES, ROLE_OF: ROLE_OF };
