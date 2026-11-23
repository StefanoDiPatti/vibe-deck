'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CSS = path.join(ROOT, 'public', 'css', 'dock.css');
const OUT = path.join(ROOT, 'public', 'css', 'themes');
const THEMES = ['material', 'neon', 'brutal'];

const ROLE = {
  background: 'bg', 'background-color': 'bg', 'background-image': 'bg',
  color: 'fg', fill: 'fg', stroke: 'fg', 'text-shadow': 'fg',
  border: 'line', 'border-color': 'line', 'border-top': 'line', 'border-bottom': 'line', 'border-left': 'line',
  'border-right': 'line', 'border-top-color': 'line', 'border-bottom-color': 'line', 'border-left-color': 'line',
  'border-right-color': 'line', outline: 'line', 'box-shadow': 'line', '-webkit-box-shadow': 'line'
};
const COLOR_RE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)/g;

function norm(c) {
  c = c.toLowerCase().replace(/\s+/g, '');
  if (/^#[0-9a-f]{3}$/.test(c)) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  return c;
}
function split(c) {
  const m = /^rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)$/.exec(c);
  if (!m) return { key: c, alpha: null };
  return { key: 'rgb(' + m[1] + ',' + m[2] + ',' + m[3] + ')', alpha: m[4] === undefined ? null : m[4] };
}
function hexToRgb(h) { h = norm(h); return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

function parse(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  let i = 0;
  function block(start) {
    let depth = 0;
    for (let k = start; k < css.length; k++) {
      if (css[k] === '{') depth++;
      else if (css[k] === '}') { depth--; if (depth === 0) return k; }
    }
    return css.length;
  }
  function walk(from, to, media) {
    let k = from;
    while (k < to) {
      const open = css.indexOf('{', k);
      if (open < 0 || open >= to) break;
      const head = css.slice(k, open).trim();
      const close = block(open);
      if (/^@media/.test(head)) walk(open + 1, close, head);
      else if (!/^@/.test(head) && head) out.push({ media: media, selector: head, body: css.slice(open + 1, close) });
      k = close + 1;
    }
  }
  walk(0, css.length, null);
  return out;
}

function decls(body) {
  return body.split(';').map(function (d) {
    const c = d.indexOf(':');
    if (c < 0) return null;
    return { prop: d.slice(0, c).trim().toLowerCase(), value: d.slice(c + 1).trim() };
  }).filter(function (d) { return d && d.prop && d.value; });
}

function report() {
  const seen = {};
  parse(fs.readFileSync(CSS, 'utf8')).forEach(function (r) {
    decls(r.body).forEach(function (d) {
      const role = ROLE[d.prop];
      if (!role) return;
      (d.value.match(COLOR_RE) || []).forEach(function (c) {
        const k = role + ' ' + split(norm(c)).key;
        seen[k] = (seen[k] || 0) + 1;
      });
    });
  });
  Object.keys(seen).sort().forEach(function (k) { console.log(String(seen[k]).padStart(3) + '  ' + k); });
}

function mapColor(theme, role, c) {
  const s = split(norm(c));
  const to = (theme[role] && theme[role][s.key]) || (theme.all && theme.all[s.key]);
  if (!to) return null;
  if (s.alpha === null) return to;
  const rgb = /^#/.test(to) ? hexToRgb(to) : null;
  return rgb ? 'rgba(' + rgb.join(', ') + ', ' + s.alpha + ')' : to;
}

function build(name) {
  const theme = require('./themes/' + name);
  const rules = parse(fs.readFileSync(CSS, 'utf8'));
  const lines = [];
  let media = null;
  rules.forEach(function (r) {
    const out = [];
    decls(r.body).forEach(function (d) {
      const role = ROLE[d.prop];
      if (!role) return;
      let changed = false;
      const v = d.value.replace(COLOR_RE, function (c) {
        const m = mapColor(theme, role, c);
        if (m && m !== norm(c)) { changed = true; return m; }
        return c;
      });
      if (changed) out.push(d.prop + ': ' + v);
    });
    if (!out.length) return;
    if (r.media !== media) {
      if (media) lines.push('}');
      if (r.media) lines.push(r.media + ' {');
      media = r.media;
    }
    lines.push((media ? '  ' : '') + r.selector.replace(/\s+/g, ' ') + ' { ' + out.join('; ') + '; }');
  });
  if (media) lines.push('}');
  return lines.join('\n') + '\n\n' + theme.css.trim() + '\n';
}

function buildAll() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  THEMES.forEach(function (n) { fs.writeFileSync(path.join(OUT, n + '.css'), build(n)); });
}

module.exports = { build: build, THEMES: THEMES, parse: parse };

if (require.main === module) {
  if (process.argv.indexOf('--report') >= 0) report();
  else { buildAll(); console.log('Temi generati in public/css/themes: ' + THEMES.join(', ')); }
}
