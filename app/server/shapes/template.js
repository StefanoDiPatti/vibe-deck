const Registry = require('./registry');

const filters = new Registry('filter');
const PLACEHOLDER = /\{\{\s*([^{}]+?)\}\}/g;
const ONLY = /^\{\{\s*([^{}]+?)\}\}$/;

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
}
function empty(v) { return v === null || v === undefined || v === ''; }

filters.register('round', function (v, digits) {
  const n = toNumber(v);
  if (isNaN(n)) return v;
  const k = Math.pow(10, Math.max(0, Math.min(6, parseInt(digits, 10) || 0)));
  return Math.round(n * k) / k;
});
filters.register('percent', function (v) {
  const n = toNumber(v);
  return isNaN(n) ? v : Math.round(n) + '%';
});
filters.register('bytes', function (v) {
  let n = toNumber(v);
  if (isNaN(n)) return v;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (Math.abs(n) >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return (i ? Math.round(n * 10) / 10 : Math.round(n)) + ' ' + units[i];
});
filters.register('duration', function (v) {
  const s = toNumber(v);
  if (isNaN(s)) return v;
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return d + ' g ' + h + ' h';
  if (h) return h + ' h ' + m + ' min';
  return m + ' min';
});
filters.register('ago', function (v) {
  const t = typeof v === 'string' && isNaN(Number(v)) ? Date.parse(v) : toNumber(v);
  if (isNaN(t)) return v;
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'ora';
  if (s < 3600) return Math.floor(s / 60) + ' min fa';
  if (s < 86400) return Math.floor(s / 3600) + ' h fa';
  return Math.floor(s / 86400) + ' g fa';
});
filters.register('upper', function (v) { return empty(v) ? v : String(v).toUpperCase(); });
filters.register('lower', function (v) { return empty(v) ? v : String(v).toLowerCase(); });
filters.register('default', function (v, def) { return empty(v) ? (def === undefined ? '' : def) : v; });
filters.register('yesno', function (v, yes, no) { return v ? (yes === undefined ? 'sì' : yes) : (no === undefined ? 'no' : no); });
filters.register('url', function (v) { return empty(v) ? '' : encodeURIComponent(String(v)); });
filters.register('count', function (v) {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === 'object') return Object.keys(v).length;
  return 0;
});
filters.register('map', function (v, name) {
  const table = this && this.maps && this.maps[name];
  if (!table || empty(v)) return v;
  const key = String(v);
  if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];
  return Object.prototype.hasOwnProperty.call(table, '*') ? table['*'] : v;
});
filters.register('zip', function (v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return Array.isArray(v) ? v : [];
  const keys = Object.keys(v).filter(function (k) { return Array.isArray(v[k]); });
  const n = keys.reduce(function (m, k) { return Math.max(m, v[k].length); }, 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    const row = {};
    keys.forEach(function (k) { row[k] = v[k][i]; });
    out.push(row);
  }
  return out;
});
filters.register('first', function (v) { return Array.isArray(v) ? v[0] : v; });
filters.register('join', function (v, sep) { return Array.isArray(v) ? v.join(sep === undefined ? ', ' : sep) : v; });
const DAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
function pad(n) { return (n < 10 ? '0' : '') + n; }
filters.register('date', function (v, format) {
  if (empty(v)) return v;
  const t = typeof v === 'number' ? v : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? Date.parse(v + 'T12:00:00') : Date.parse(v);
  if (isNaN(t)) return v;
  const d = new Date(t);
  if (format === 'time') return pad(d.getHours()) + ':' + pad(d.getMinutes());
  if (format === 'weekday') return DAYS[d.getDay()];
  if (format === 'day') return DAYS[d.getDay()] + ' ' + d.getDate();
  return d.getDate() + ' ' + MONTHS[d.getMonth()];
});

function lookup(data, path) {
  if (path === '.' || path === '') return data;
  const parts = path.split('.');
  let cur = data;
  for (let i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

function evaluate(expression, data, ctx) {
  const pieces = expression.split('|');
  let value = lookup(data, pieces[0].trim());
  for (let i = 1; i < pieces.length; i++) {
    const args = pieces[i].replace(/^\s+/, '').split(':');
    const filter = filters.get(args[0].trim());
    if (!filter) throw Object.assign(new Error('Filtro sconosciuto: ' + args[0]), { code: 'BAD_CONFIG' });
    value = filter.apply(ctx || null, [value].concat(args.slice(1)));
  }
  return value;
}

function value(tpl, data, ctx) {
  if (typeof tpl !== 'string') return tpl === undefined ? null : tpl;
  const m = ONLY.exec(tpl);
  if (m) {
    const v = evaluate(m[1], data, ctx);
    return v === undefined ? null : v;
  }
  return text(tpl, data, ctx);
}

function text(tpl, data, ctx) {
  if (tpl === null || tpl === undefined) return '';
  if (typeof tpl !== 'string') return String(tpl);
  return tpl.replace(PLACEHOLDER, function (all, expression) {
    const v = evaluate(expression, data, ctx);
    if (empty(v)) return '';
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
}

function number(tpl, data, ctx) {
  const n = toNumber(value(tpl, data, ctx));
  return isNaN(n) ? null : n;
}

function deep(obj, data, ctx) {
  if (typeof obj === 'string') {
    const only = ONLY.exec(obj);
    if (only) {
      const v = evaluate(only[1], data, ctx);
      return typeof v === 'number' || typeof v === 'boolean' ? v : text(obj, data, ctx);
    }
    return text(obj, data, ctx);
  }
  if (Array.isArray(obj)) return obj.map(function (x) { return deep(x, data, ctx); });
  if (obj && typeof obj === 'object') {
    const out = {};
    Object.keys(obj).forEach(function (k) { out[k] = deep(obj[k], data, ctx); });
    return out;
  }
  return obj;
}

function check(tpl) {
  if (typeof tpl !== 'string') return [];
  const problems = [];
  let m;
  PLACEHOLDER.lastIndex = 0;
  while ((m = PLACEHOLDER.exec(tpl))) {
    m[1].split('|').slice(1).forEach(function (f) {
      const name = f.split(':')[0].trim();
      if (!filters.has(name)) problems.push('filtro sconosciuto "' + name + '" in ' + tpl);
    });
  }
  return problems;
}

class View {
  constructor(data, ctx) {
    this.data = data;
    this.ctx = ctx || null;
  }
  text(tpl) { return text(tpl, this.data, this.ctx); }
  value(tpl) { return value(tpl, this.data, this.ctx); }
  number(tpl) { return number(tpl, this.data, this.ctx); }
  deep(obj) { return deep(obj, this.data, this.ctx); }
  child(data) { return new View(data, this.ctx); }
}

module.exports = { filters: filters, text: text, value: value, number: number, deep: deep, check: check, lookup: lookup, View: View };
