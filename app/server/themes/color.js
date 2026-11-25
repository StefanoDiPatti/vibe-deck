'use strict';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function isHex(c) { return typeof c === 'string' && HEX_RE.test(c); }

function parse(c) {
  c = String(c || '').toLowerCase().replace(/\s+/g, '');
  if (/^#[0-9a-f]{3}$/.test(c)) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  if (HEX_RE.test(c)) return { rgb: [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)], alpha: null };
  const m = /^rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)$/.exec(c);
  if (m) return { rgb: [+m[1], +m[2], +m[3]], alpha: m[4] === undefined ? null : m[4] };
  return null;
}

function hex(rgb) {
  return '#' + rgb.map(function (v) {
    const s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
    return s.length < 2 ? '0' + s : s;
  }).join('');
}

function format(rgb, alpha) {
  if (alpha === null || alpha === undefined) return hex(rgb);
  return 'rgba(' + rgb.map(function (v) { return Math.max(0, Math.min(255, Math.round(v))); }).join(', ') + ', ' + alpha + ')';
}

function mix(a, b, t) { return [0, 1, 2].map(function (i) { return a[i] + (b[i] - a[i]) * t; }); }

function luminance(rgb) {
  const l = rgb.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
}

function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

module.exports = { isHex: isHex, parse: parse, hex: hex, format: format, mix: mix, luminance: luminance, contrast: contrast };
