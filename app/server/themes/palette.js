'use strict';
const color = require('./color');

const TOKENS = [
  { id: 'bg', label: 'Sfondo', hint: 'dietro a tutto, barra in alto e in basso' },
  { id: 'surface', label: 'Riquadri', hint: 'widget e pannelli' },
  { id: 'raised', label: 'Pulsanti', hint: 'pulsanti e voci dei menu' },
  { id: 'line', label: 'Bordi', hint: 'bordi e separatori' },
  { id: 'text', label: 'Testo', hint: 'testo principale' },
  { id: 'muted', label: 'Testo secondario', hint: 'titoli piccoli, dettagli' },
  { id: 'accent', label: 'Accento', hint: 'pagina attiva, selezioni, barre' },
  { id: 'ok', label: 'OK / acceso', hint: 'verde: connesso, in esecuzione' },
  { id: 'warn', label: 'Attenzione', hint: 'giallo/arancio: avvisi' },
  { id: 'err', label: 'Errore', hint: 'rosso: errori, muto, chiudi' }
];
const IDS = TOKENS.map(function (t) { return t.id; });
const PREFER = { fg: ['text', 'muted'], line: ['line'], bg: ['text', 'bg', 'surface', 'raised'] };

function clean(p) {
  if (!p || typeof p !== 'object') return null;
  const out = {};
  for (const id of IDS) {
    if (!color.isHex(p[id])) return null;
    out[id] = p[id].toLowerCase();
  }
  return out;
}

function same(a, b) { return !!a && !!b && IDS.every(function (id) { return a[id] === b[id]; }); }

class PaletteRecolorer {
  constructor(from, to) {
    this.anchors = this.build(from, to);
    this.cache = {};
  }

  build(from, to) {
    const list = IDS.map(function (id) { return { id: id, src: color.parse(from[id]).rgb, dst: color.parse(to[id]).rgb }; });
    const darkFrom = color.luminance(color.parse(from.bg).rgb) < color.luminance(color.parse(from.text).rgb);
    const darkTo = color.luminance(color.parse(to.bg).rgb) < color.luminance(color.parse(to.text).rgb);
    const black = [0, 0, 0], white = [255, 255, 255];
    const lo = darkTo ? black : white, hi = darkTo ? white : black;
    list.push({ id: 'lo', src: darkFrom ? black : white, dst: lo });
    list.push({ id: 'hi', src: darkFrom ? white : black, dst: hi });
    return list;
  }

  map(rgb, role) {
    const key = rgb.join(',') + '|' + (role || '');
    if (this.cache[key]) return this.cache[key];
    const a = this.anchors, fits = [];
    let min = Infinity;
    for (let i = 0; i < a.length; i++) {
      for (let j = i; j < a.length; j++) {
        const fit = this.project(rgb, a[i].src, a[j].src);
        fits.push({ dist: fit.dist, i: i, j: j, t: fit.t });
        if (fit.dist < min) min = fit.dist;
      }
    }
    const pref = PREFER[role] || [];
    const rank = function (f) {
      const near = f.t < 0.5 ? a[f.i].id : a[f.j].id;
      const k = pref.indexOf(near);
      return k < 0 ? pref.length : k;
    };
    const best = fits.filter(function (f) { return f.dist <= min + 0.5; })
      .sort(function (x, y) { return rank(x) - rank(y) || x.dist - y.dist || (x.i - y.i) || (x.j - y.j); })[0];
    const out = color.mix(a[best.i].dst, a[best.j].dst, best.t);
    this.cache[key] = out;
    return out;
  }

  project(c, a, b) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    let t = 0;
    if (len > 0) t = Math.max(0, Math.min(1, ((c[0] - a[0]) * ab[0] + (c[1] - a[1]) * ab[1] + (c[2] - a[2]) * ab[2]) / len));
    const p = color.mix(a, b, t);
    const d = Math.sqrt(Math.pow(c[0] - p[0], 2) + Math.pow(c[1] - p[1], 2) + Math.pow(c[2] - p[2], 2));
    return { t: t, dist: d };
  }

  color(css, role) {
    const c = color.parse(css);
    if (!c) return null;
    const pure = (c.rgb[0] === 0 && c.rgb[1] === 0 && c.rgb[2] === 0);
    if (c.alpha !== null && pure) return null;
    return color.format(this.map(c.rgb, role), c.alpha);
  }
}

module.exports = { TOKENS: TOKENS, IDS: IDS, clean: clean, same: same, PaletteRecolorer: PaletteRecolorer };
