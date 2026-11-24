'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SVG = path.join(__dirname, '..', 'linux', 'vibe-deck.svg');
const OUT = path.join(__dirname, 'vibe-deck.ico');
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const SAMPLES = 4;

function attr(tag, name) {
  const m = new RegExp('\\b' + name + '="([^"]*)"').exec(tag);
  return m ? m[1] : null;
}

function color(hex) {
  const h = String(hex || '').replace('#', '');
  return h.length === 6 ? [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] : null;
}

function readShapes(svg) {
  const view = (attr(svg, 'viewBox') || '0 0 128 128').split(/\s+/).map(Number);
  const shapes = [];
  (svg.match(/<rect\b[^>]*>/g) || []).forEach(function (tag) {
    const r = { x: +attr(tag, 'x') || 0, y: +attr(tag, 'y') || 0, w: +attr(tag, 'width'), h: +attr(tag, 'height'), rx: +attr(tag, 'rx') || 0 };
    const fill = color(attr(tag, 'fill'));
    const stroke = color(attr(tag, 'stroke'));
    if (fill) shapes.push(Object.assign({ color: fill, ring: 0 }, r));
    if (stroke) shapes.push(Object.assign({ color: stroke, ring: +attr(tag, 'stroke-width') || 1 }, r));
  });
  return { size: view[2], shapes: shapes };
}

function insideRounded(px, py, s) {
  if (px < s.x || py < s.y || px > s.x + s.w || py > s.y + s.h) return false;
  const r = Math.min(s.rx, s.w / 2, s.h / 2);
  const cx = Math.min(Math.max(px, s.x + r), s.x + s.w - r);
  const cy = Math.min(Math.max(py, s.y + r), s.y + s.h - r);
  return (px - cx) * (px - cx) + (py - cy) * (py - cy) <= r * r;
}

function covers(px, py, s) {
  if (!s.ring) return insideRounded(px, py, s);
  const half = s.ring / 2;
  const outer = { x: s.x - half, y: s.y - half, w: s.w + s.ring, h: s.h + s.ring, rx: s.rx + half };
  const inner = { x: s.x + half, y: s.y + half, w: s.w - s.ring, h: s.h - s.ring, rx: Math.max(0, s.rx - half) };
  return insideRounded(px, py, outer) && !insideRounded(px, py, inner);
}

function render(art, size) {
  const scale = art.size / size;
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const px = (x + (sx + 0.5) / SAMPLES) * scale;
          const py = (y + (sy + 0.5) / SAMPLES) * scale;
          let c = null;
          art.shapes.forEach(function (s) { if (covers(px, py, s)) c = s.color; });
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
      }
      const i = (y * size + x) * 4;
      rgba[i] = a ? Math.round(r / a) : 0;
      rgba[i + 1] = a ? Math.round(g / a) : 0;
      rgba[i + 2] = a ? Math.round(b / a) : 0;
      rgba[i + 3] = Math.round(255 * a / (SAMPLES * SAMPLES));
    }
  }
  return rgba;
}

const CRC = (function () {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(rgba, size) {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0);
  head.writeUInt32BE(size, 4);
  head[8] = 8;
  head[9] = 6;
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(function (im) {
    const e = Buffer.alloc(16);
    e[0] = im.size >= 256 ? 0 : im.size;
    e[1] = im.size >= 256 ? 0 : im.size;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(im.data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += im.data.length;
    return e;
  });
  return Buffer.concat([header].concat(entries, images.map(function (im) { return im.data; })));
}

const art = readShapes(fs.readFileSync(SVG, 'utf8'));
const images = SIZES.map(function (size) { return { size: size, data: png(render(art, size), size) }; });
fs.writeFileSync(OUT, ico(images));
if (process.argv.indexOf('--png') >= 0) fs.writeFileSync(OUT.replace(/\.ico$/, '-256.png'), images[images.length - 1].data);
console.log('Icona pronta: ' + path.relative(process.cwd(), OUT) + ' (' + SIZES.join(', ') + ' px)');
