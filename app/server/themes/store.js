'use strict';
const fs = require('fs');
const path = require('path');
const paths = require('../paths');
const { parseJson } = require('../config');

const NAME_MAX = 40;
const ID_RE = /^u-[a-z0-9-]{1,40}$/;

class ThemeStore {
  constructor(file) {
    this.file = file || path.join(paths.CONFIG_DIR, 'themes.json');
    this.cache = null;
    this.mtime = -1;
    this.listeners = [];
  }

  read() {
    let st = null;
    try { st = fs.statSync(this.file); } catch (e) { st = null; }
    const m = st ? st.mtimeMs : 0;
    if (this.cache && m === this.mtime) return this.cache;
    let data = { themes: {} };
    if (st) {
      try { data = parseJson(fs.readFileSync(this.file, 'utf8')) || data; } catch (e) { data = this.cache || { themes: {} }; }
    }
    if (!data.themes || typeof data.themes !== 'object') data.themes = {};
    if (!Array.isArray(data.tablet)) data.tablet = [];
    this.cache = data;
    this.mtime = m;
    return data;
  }

  stamp() { this.read(); return Math.round(this.mtime).toString(36); }

  entries() { return this.read().themes; }

  tablet() { return this.read().tablet.map(String); }

  write(themes, tablet) {
    if (tablet === undefined) tablet = this.tablet();
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ themes: themes, tablet: tablet }, null, 2) + '\n');
    fs.renameSync(tmp, this.file);
    this.cache = null;
    this.listeners.forEach(function (fn) { try { fn(); } catch (e) { } });
  }

  onChange(fn) { this.listeners.push(fn); }
}

module.exports = { ThemeStore: ThemeStore, NAME_MAX: NAME_MAX, ID_RE: ID_RE };
