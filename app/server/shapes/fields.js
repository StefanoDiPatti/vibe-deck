const MAX_DEPTH = 6;
const MAX_FIELDS = 200;
const MAX_SAMPLE = 80;

function kindOf(v) {
  if (v === null || v === undefined) return 'empty';
  if (Array.isArray(v)) return 'list';
  if (typeof v === 'object') return 'object';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  return 'text';
}

function sampleOf(v) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > MAX_SAMPLE ? s.slice(0, MAX_SAMPLE - 1) + '…' : s;
}

function join(base, key) { return base ? base + '.' + key : String(key); }

function isColumns(obj) {
  const keys = Object.keys(obj);
  const lists = keys.filter(function (k) { return Array.isArray(obj[k]) && obj[k].every(function (x) { return kindOf(x) !== 'object' && kindOf(x) !== 'list'; }); });
  if (lists.length < 2) return 0;
  const n = obj[lists[0]].length;
  return n > 0 && lists.every(function (k) { return obj[k].length === n; }) ? n : 0;
}

class FieldWalker {
  constructor() { this.out = []; }

  push(field) {
    if (this.out.length < MAX_FIELDS) this.out.push(field);
  }

  visit(value, path, depth) {
    const kind = kindOf(value);
    if (kind === 'object') return this.object(value, path, depth);
    if (kind === 'list') return this.list(value, path, depth);
    if (path) this.push({ path: path, type: kind, sample: sampleOf(value) });
  }

  object(obj, path, depth) {
    const rows = isColumns(obj);
    if (rows && path) {
      const first = {};
      Object.keys(obj).forEach(function (k) { if (Array.isArray(obj[k])) first[k] = obj[k][0]; });
      this.push({ path: path, type: 'columns', count: rows, hint: '{{' + path + '|zip}}', item: new FieldWalker().walk(first, 1) });
    }
    if (depth >= MAX_DEPTH) return;
    const self = this;
    Object.keys(obj).forEach(function (k) { self.visit(obj[k], join(path, k), depth + 1); });
  }

  list(arr, path, depth) {
    const first = arr[0];
    const field = { path: path || '.', type: 'list', count: arr.length, sample: '' };
    if (kindOf(first) === 'object') field.item = new FieldWalker().walk(first, 1);
    else field.sample = sampleOf(first);
    this.push(field);
    if (depth < MAX_DEPTH && kindOf(first) !== 'object' && kindOf(first) !== 'list' && first !== undefined) {
      this.push({ path: join(path, '0'), type: kindOf(first), sample: sampleOf(first) });
    }
  }

  walk(data, depth) {
    this.visit(data, '', depth || 0);
    return this.out;
  }
}

function fieldsOf(data) { return new FieldWalker().walk(data, 0); }

module.exports = { fieldsOf: fieldsOf, FieldWalker: FieldWalker };
