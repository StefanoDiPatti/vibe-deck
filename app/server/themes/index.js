'use strict';
const fs = require('fs');
const build = require('../../scripts/build-themes');
const palette = require('./palette');
const presets = require('./presets');
const { registry, CLASSIC } = require('./styles');
const { ThemeStore, NAME_MAX, ID_RE } = require('./store');

const FORMAT = 1;

function bad(msg) { return Object.assign(new Error(msg), { code: 'BAD_REQUEST' }); }

class CssGenerator {
  constructor(pluginStyles) { this.pluginStyles = pluginStyles || function () { return []; }; }

  recolor(css, from, to) {
    const rc = new palette.PaletteRecolorer(from, to);
    return build.mapRules(css, function (role, c) { return rc.color(c, role); }, true);
  }

  generate(styleId, pal) {
    const style = registry.get(styleId) || registry.get('classic');
    const parts = [this.recolor(fs.readFileSync(build.CSS, 'utf8'), CLASSIC, pal)];
    if (style.id !== 'classic') parts.push(this.recolor(style.extraCss(), style.palette(), pal));
    const self = this;
    this.pluginStyles().forEach(function (s) {
      try { parts.push(self.recolor(fs.readFileSync(s.path, 'utf8'), CLASSIC, pal)); } catch (e) { }
    });
    return parts.filter(Boolean).join('\n') + '\n';
  }

  stamp() {
    const st = (function () { try { return fs.statSync(build.CSS).mtimeMs; } catch (e) { return 0; } })();
    return st + '|' + this.pluginStyles().map(function (s) { return s.path + ':' + s.mtime; }).join('|');
  }
}

class ThemeService {
  constructor(opts) {
    opts = opts || {};
    this.store = opts.store || new ThemeStore(opts.file);
    this.css = new CssGenerator(opts.pluginStyles);
    this.cssCache = {};
  }

  setPluginStyles(fn) { this.css.pluginStyles = fn; this.cssCache = {}; }

  resolve(id) {
    const entries = this.store.entries();
    const style = registry.get(id);
    if (style) {
      const own = entries[id] && palette.clean(entries[id].palette);
      const modified = !!own && !palette.same(own, style.palette());
      return { id: id, name: style.name, style: id, custom: false, modified: modified, palette: modified ? own : style.palette() };
    }
    const e = entries[id];
    if (!ID_RE.test(id) || !e) return null;
    const pal = palette.clean(e.palette);
    if (!pal || !registry.has(e.style)) return null;
    return { id: id, name: String(e.name || id).slice(0, NAME_MAX), style: e.style, custom: true, modified: true, palette: pal };
  }

  ids() {
    const own = registry.all().map(function (s) { return s.id; });
    return own.concat(Object.keys(this.store.entries()).filter(function (k) { return ID_RE.test(k); }));
  }

  all() {
    const self = this;
    return this.ids().map(function (id) { return self.resolve(id); }).filter(Boolean);
  }

  version(t) {
    if (!t.modified) return '';
    const s = JSON.stringify([t.style, t.palette]);
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  forTablet() {
    const self = this;
    return this.all().map(function (t) {
      return { id: t.id, name: t.name, style: t.style, custom: t.custom, v: self.version(t), sw: [t.palette.bg, t.palette.surface, t.palette.accent] };
    });
  }

  stamp() { return this.store.stamp(); }

  forControl() {
    return {
      themes: this.all(),
      styles: registry.all().map(function (s) { return s.info(); }),
      presets: presets.all(),
      tokens: palette.TOKENS
    };
  }

  cssFor(id) {
    const t = this.resolve(id);
    if (!t || !t.modified) return '';
    const key = id + '|' + this.version(t) + '|' + this.css.stamp();
    if (this.cssCache[id] && this.cssCache[id].key === key) return this.cssCache[id].css;
    const css = this.css.generate(t.style, t.palette);
    this.cssCache[id] = { key: key, css: css };
    return css;
  }

  draftCss(style, pal) {
    const p = palette.clean(pal);
    if (!p) throw bad('Palette non valida: servono ' + palette.IDS.length + ' colori #rrggbb');
    if (!registry.has(style)) throw bad('Stile sconosciuto: ' + style);
    return this.css.generate(style, p);
  }

  newId(name) {
    const base = 'u-' + (String(name || 'tema').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'tema');
    const entries = this.store.entries();
    let id = base, n = 2;
    while (entries[id]) id = base + '-' + (n++);
    return id;
  }

  save(input) {
    input = input || {};
    const pal = palette.clean(input.palette);
    if (!pal) throw bad('Palette non valida: servono ' + palette.IDS.length + ' colori #rrggbb');
    const entries = Object.assign({}, this.store.entries());
    let id = String(input.id || '');
    const style = registry.get(id);
    if (style) {
      if (palette.same(pal, style.palette())) delete entries[id];
      else entries[id] = { palette: pal };
    } else {
      const name = String(input.name || '').trim().slice(0, NAME_MAX);
      if (!name) throw bad('Dai un nome al tema');
      if (!registry.has(input.style)) throw bad('Stile sconosciuto: ' + input.style);
      if (!id || !entries[id]) id = this.newId(name);
      if (!ID_RE.test(id)) throw bad('Id del tema non valido');
      entries[id] = { name: name, style: input.style, palette: pal };
    }
    this.store.write(entries);
    return { id: id, theme: this.resolve(id) };
  }

  reset(id) {
    const entries = Object.assign({}, this.store.entries());
    if (!entries[id]) return { id: id, removed: false };
    delete entries[id];
    this.store.write(entries);
    return { id: id, removed: true };
  }

  exportTheme(id) {
    const t = this.resolve(id);
    if (!t) throw bad('Tema sconosciuto: ' + id);
    return { vibeDeckTheme: FORMAT, name: t.name, style: t.style, palette: t.palette };
  }

  importTheme(obj) {
    if (!obj || obj.vibeDeckTheme !== FORMAT) throw bad('Non è un tema di Vibe Deck (manca "vibeDeckTheme": 1)');
    return this.save({ name: obj.name, style: obj.style, palette: obj.palette });
  }
}

module.exports = { ThemeService: ThemeService, CssGenerator: CssGenerator, FORMAT: FORMAT };
