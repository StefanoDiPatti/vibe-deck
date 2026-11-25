'use strict';
const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const home = require('./home');

const ID_RE = /^u-[a-z0-9-]{1,40}$/;
const ICON_RE = /^[a-z0-9_-]{1,40}$/;
const TITLE_MAX = 16;
const DESC_MAX = 120;
const MAX_PAGES = 20;

function bad(m) { return Object.assign(new Error(m), { code: 'BAD_REQUEST' }); }

function slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}

class CustomPageStore {
  constructor(dir) { this.dir = dir || path.join(paths.CONFIG_DIR, 'pages'); }

  file(id) { return path.join(this.dir, id + '.json'); }

  read(id) {
    if (!ID_RE.test(id)) return null;
    try {
      const p = JSON.parse(fs.readFileSync(this.file(id), 'utf8'));
      return p && p.custom === true ? p : null;
    } catch (e) { return null; }
  }

  list() {
    let names = [];
    try { names = fs.readdirSync(this.dir); } catch (e) { names = []; }
    const self = this;
    return names.filter(function (n) { return /^u-[a-z0-9-]+\.json$/.test(n); })
      .map(function (n) { return self.read(n.slice(0, -5)); }).filter(Boolean)
      .sort(function (a, b) { return String(a.title).localeCompare(String(b.title)); });
  }

  write(page) {
    fs.mkdirSync(this.dir, { recursive: true });
    const file = this.file(page.id);
    fs.writeFileSync(file + '.tmp', JSON.stringify(page, null, 2) + '\n');
    fs.renameSync(file + '.tmp', file);
  }

  remove(id) {
    if (!this.read(id)) return false;
    fs.unlinkSync(this.file(id));
    return true;
  }
}

class CustomPages {
  constructor(store) { this.store = store || new CustomPageStore(); }

  list() { return this.store.list(); }

  newId(title, taken) {
    const base = 'u-' + (slug(title) || 'pagina');
    let id = base, n = 2;
    while (taken[id] || this.store.read(id)) id = base + '-' + (n++);
    return id;
  }

  save(input, existingIds) {
    input = input || {};
    const title = String(input.title || '').trim().replace(/\s+/g, ' ').toUpperCase().slice(0, TITLE_MAX);
    if (!title) throw bad('Dai un nome alla pagina');
    const icon = ICON_RE.test(String(input.icon || '')) ? String(input.icon) : 'apps';
    const description = String(input.description || '').trim().replace(/\s+/g, ' ').slice(0, DESC_MAX);
    const grid = home.clean(input, { title: 'La pagina', in: 'nella pagina', for: 'per questa pagina' });
    const taken = {};
    (existingIds || []).forEach(function (id) { taken[id] = true; });
    let id = String(input.id || '');
    if (id && !this.store.read(id)) id = '';
    if (!id) {
      if (this.list().length >= MAX_PAGES) throw bad('Al massimo ' + MAX_PAGES + ' pagine tue');
      id = this.newId(title, taken);
    }
    const page = { id: id, custom: true, title: title, icon: icon, description: description, tab: false, columns: grid.columns, rows: grid.rows, tiles: grid.tiles };
    this.store.write(page);
    return page;
  }

  remove(id) {
    if (!this.store.remove(String(id || ''))) throw bad('Pagina non trovata: ' + id);
    return true;
  }

  expand(page) {
    if (!page || page.custom !== true || !Array.isArray(page.tiles)) return page;
    return home.expand(page, { columns: page.columns, rows: page.rows, tiles: page.tiles.filter(function (t) { return t && typeof t.id === 'string'; }) }, page.id);
  }

  forEditor() {
    return this.list().map(function (p) {
      return { id: p.id, title: p.title, icon: p.icon, description: p.description || '', columns: p.columns, rows: p.rows, tiles: (p.tiles || []).map(function (t) { return { id: t.id, x: t.x, y: t.y, w: t.w, h: t.h }; }) };
    });
  }
}

const shared = new CustomPages();

module.exports = { CustomPages: CustomPages, CustomPageStore: CustomPageStore, shared: shared, ID_RE: ID_RE, TITLE_MAX: TITLE_MAX, DESC_MAX: DESC_MAX };
