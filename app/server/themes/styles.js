'use strict';
const build = require('../../scripts/build-themes');

const CLASSIC = {
  bg: '#0b0f14', surface: '#18212c', raised: '#1d2835', line: '#2a3746', text: '#e8eef4',
  muted: '#8b9bab', accent: '#3d8bfd', ok: '#3fb950', warn: '#d29922', err: '#e5534b'
};

const SOURCE = {
  bg: ['bg', '#0b0f14'], surface: ['bg', '#18212c'], raised: ['bg', '#1d2835'], line: ['line', '#2a3746'],
  text: ['fg', '#e8eef4'], muted: ['fg', '#8b9bab'], accent: ['line', '#3d8bfd'], ok: ['line', '#3fb950'],
  warn: ['line', '#d29922'], err: ['line', '#e5534b']
};

class Style {
  constructor(id, name) { this.id = id; this.name = name; }
  palette() { return Object.assign({}, CLASSIC); }
  extraCss() { return ''; }
  info() { return { id: this.id, name: this.name, palette: this.palette() }; }
}

class GeneratedStyle extends Style {
  constructor(id, name, overrides) { super(id, name); this.overrides = overrides || {}; }
  module() { return require('../../scripts/themes/' + this.id); }
  palette() {
    const theme = this.module();
    const out = {};
    Object.keys(SOURCE).forEach(function (k) {
      const m = build.mapColor(theme, SOURCE[k][0], SOURCE[k][1]);
      out[k] = (m && /^#[0-9a-f]{6}$/i.test(m) ? m : CLASSIC[k]).toLowerCase();
    });
    return Object.assign(out, this.overrides);
  }
  extraCss() { return this.module().css || ''; }
}

class StyleRegistry {
  constructor() { this.items = {}; this.order = []; }
  register(style) { this.items[style.id] = style; this.order.push(style.id); return this; }
  get(id) { return this.items[id] || null; }
  has(id) { return !!this.items[id]; }
  all() { const self = this; return this.order.map(function (id) { return self.items[id]; }); }
}

const registry = new StyleRegistry()
  .register(new Style('classic', 'Classico'))
  .register(new GeneratedStyle('material', 'Material'))
  .register(new GeneratedStyle('neon', 'Neon Elgato'))
  .register(new GeneratedStyle('brutal', 'Neo-brutalista', { accent: '#4d9dff' }));

module.exports = { registry: registry, CLASSIC: CLASSIC, Style: Style, GeneratedStyle: GeneratedStyle };
