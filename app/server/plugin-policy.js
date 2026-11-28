const fs = require('fs');
const path = require('path');

const MAX_FILE_BYTES = 512 * 1024;
const MAX_FILES = 200;

const ES5_FORBIDDEN = [
  [/\.startsWith\(|\.endsWith\(|\.includes\(/, 'ES6 string/array methods'],
  [/\.closest\(/, 'Element.closest'],
  [/\.classList\b/, 'classList'],
  [/querySelectorAll\([^)]*\)\.forEach/, 'NodeList.forEach'],
  [/\bfetch\(/, 'fetch'],
  [/\bPromise\b/, 'Promise'],
  [/\.bind\(/, 'Function.bind'],
  [/\.find\(|\.findIndex\(/, 'Array.find'],
  [/Object\.assign|Array\.from/, 'Object.assign / Array.from'],
  [/new CustomEvent/, 'CustomEvent'],
  [/\{\s*passive\s*:/, 'passive event listener options'],
  [/=>/, 'arrow functions'],
  [/(^|[^\w$.])(let|const)\s+[\w${[]/, 'let / const'],
  [/`/, 'template strings'],
  [/(^|[^\w$.])class\s+\w+/, 'classes'],
  [/\.\.\.[\w$[({]/, 'spread / rest'],
  [/\basync\s+function|\bawait\s/, 'async / await']
];

const CSS_FORBIDDEN = [[/display\s*:\s*(flex|grid|inline-flex)/, 'flexbox / grid'], [/\bgap\s*:/, 'gap'], [/var\(--/, 'CSS variables'], [/calc\(/, 'calc()']];

function strip(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

function walk(dir, ext, out, depth) {
  let list = [];
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  list.forEach(function (d) {
    if (d.name === 'node_modules' || d.name[0] === '.') return;
    const full = path.join(dir, d.name);
    if (d.isDirectory()) { if (depth < 4) walk(full, ext, out, depth + 1); } else if (ext.test(d.name)) out.push(full);
  });
  return out;
}

class Rule {
  constructor(id, level, kinds, check) {
    this.id = id;
    this.level = level;
    this.kinds = kinds;
    this.check = check;
  }
}

const NETWORK_RE = /\bfetch\(|require\(\s*['"](?:node:)?(?:https?|net|tls|dgram|dns|http2)['"]\s*\)/;
const WRITE_RE = /(?:\bfs|\bfsp|\bfs\.promises|require\(\s*['"](?:node:)?fs['"]\s*\))\.(?:writeFile|writeFileSync|appendFile|appendFileSync|unlink|unlinkSync|rm|rmSync|rename|renameSync|copyFile|copyFileSync|mkdir|mkdirSync)\b/;
const DATA_RE = /dataDir|DATA_DIR|ensureDataDir|secrets|tmpdir/;

const RULES = [
  new Rule('no-eval', 'security', ['server', 'tablet', 'panel'], function (code) {
    return /(^|[^\w$.])eval\s*\(|\bnew\s+Function\s*\(|(^|[^\w$.])Function\s*\(\s*['"]|require\(\s*['"](?:node:)?vm['"]\s*\)|setTimeout\(\s*['"]|setInterval\(\s*['"]/.test(code) ? ['uses eval, Function(), vm or a string timer'] : [];
  }),
  new Rule('exec-declared', 'security', ['server'], function (code, o) {
    return /require\(\s*['"](?:node:)?child_process['"]\s*\)/.test(code) && !o.exec ? ['runs programs (child_process) but plugin.json does not declare "permissions": { "exec": true }'] : [];
  }),
  new Rule('network-declared', 'security', ['server'], function (code, o) {
    return NETWORK_RE.test(code) && !o.network && !o.http.length ? ['uses the network but plugin.json declares neither "permissions": { "network": true } nor permissions.http'] : [];
  }),
  new Rule('no-secrets-of-the-deck', 'security', ['server'], function (code) {
    return /DOCK_TOKEN|secret-key|webhooks\.json|runtime\.json|rules\.json|['"\/\\]\.env['"]/.test(code) ? ['reads the access code, the encryption key, the webhook key or other private files of the deck'] : [];
  }),
  new Rule('writes-in-data', 'security', ['server'], function (code) {
    return WRITE_RE.test(code) && !DATA_RE.test(code) ? ['writes files without using ctx.dataDir (plugins may only write in their own data folder)'] : [];
  }),
  new Rule('no-deck-internals', 'security', ['server'], function (code, o) {
    return !o.official && /require\(\s*['"](?:\.\.\/)+server\//.test(code) ? ['requires internals of the deck (server/…); use only the ctx object'] : [];
  }),
  new Rule('no-remote-loading', 'security', ['tablet', 'tabletcss', 'panel'], function (code) {
    return /<(?:script|img|iframe|video|audio|source)\b[^>]*\bsrc\s*=\s*\\?["']\s*(?:https?:)?\/\/|<link\b[^>]*\bhref\s*=\s*\\?["']\s*(?:https?:)?\/\/|\.src\s*=\s*["']\s*(?:https?:)?\/\/|url\(\s*["']?\s*(?:https?:)?\/\/|@import\s+(?:url\()?["']?\s*(?:https?:)?\/\/|\.open\(\s*["'][A-Z]+["']\s*,\s*["']\s*(?:https?:)?\/\/|\bfetch\(\s*["']\s*https?:/.test(code) ? ['loads something from another site (scripts, styles, fonts, images or requests must stay on the deck)'] : [];
  }),
  new Rule('tablet-es5', 'compat', ['tablet'], function (code) {
    return ES5_FORBIDDEN.filter(function (r) { return r[0].test(code); }).map(function (r) { return 'tablet script is not ES5-safe: ' + r[1]; });
  }),
  new Rule('tablet-css', 'compat', ['tabletcss'], function (code) {
    return CSS_FORBIDDEN.filter(function (r) { return r[0].test(code); }).map(function (r) { return 'tablet CSS uses ' + r[1] + ' (not available on old browsers)'; });
  })
];

function kindOf(dir, file) {
  const rel = path.relative(dir, file).split(path.sep);
  if (rel[0] === 'public') return /\.css$/.test(file) ? 'tabletcss' : 'tablet';
  if (rel[0] === 'control') return /\.css$/.test(file) ? 'panelcss' : 'panel';
  if (rel[0] === 'index.js' || rel[0] === 'lib') return 'server';
  return '';
}

function manifestProblems(manifest) {
  const out = [];
  const perm = manifest.permissions || {};
  const bad = function (m) { out.push({ rule: 'permissions', level: 'security', file: 'plugin.json', message: m }); };
  ['exec', 'network'].forEach(function (k) { if (perm[k] !== undefined && typeof perm[k] !== 'boolean') bad('permissions.' + k + ' must be true or false'); });
  if (perm.local !== undefined && (!Array.isArray(perm.local) || perm.local.some(function (x) { return typeof x !== 'string'; }))) bad('permissions.local must be a list of short descriptions');
  if (perm.http !== undefined && (!Array.isArray(perm.http) || perm.http.some(function (h) { return typeof h !== 'string' || !/^[a-z0-9.-]+(:\d+)?$/i.test(h); }))) bad('permissions.http must be a list of host names');
  return out;
}

function inspect(dir, manifest, options) {
  const o = {
    official: !!(options && options.official),
    exec: !!(manifest && manifest.permissions && manifest.permissions.exec === true),
    network: !!(manifest && manifest.permissions && manifest.permissions.network === true),
    http: Array.isArray(manifest && manifest.permissions && manifest.permissions.http) ? manifest.permissions.http : []
  };
  const problems = manifestProblems(manifest || {});
  const files = walk(dir, /\.(?:js|css)$/, [], 0).filter(function (f) { return kindOf(dir, f); });
  if (files.length > MAX_FILES) problems.push({ rule: 'size', level: 'security', file: '', message: 'too many files (' + files.length + ', maximum ' + MAX_FILES + ')' });
  files.slice(0, MAX_FILES).forEach(function (full) {
    const rel = path.relative(dir, full).split(path.sep).join('/');
    const kind = kindOf(dir, full);
    let src;
    try {
      if (fs.statSync(full).size > MAX_FILE_BYTES) { problems.push({ rule: 'size', level: 'security', file: rel, message: 'file larger than ' + (MAX_FILE_BYTES / 1024) + ' KB' }); return; }
      src = fs.readFileSync(full, 'utf8');
    } catch (e) { return; }
    const code = strip(src);
    RULES.forEach(function (rule) {
      if (rule.kinds.indexOf(kind) < 0) return;
      rule.check(code, o).forEach(function (m) { problems.push({ rule: rule.id, level: rule.level, file: rel, message: m }); });
    });
  });
  return problems;
}

function blocking(problems) {
  return problems.filter(function (p) { return p.level === 'security'; });
}

function describe(problems) {
  return problems.map(function (p) { return (p.file ? p.file + ': ' : '') + p.message + ' [' + p.rule + ']'; });
}

module.exports = { inspect: inspect, blocking: blocking, describe: describe, RULES: RULES, ES5_FORBIDDEN: ES5_FORBIDDEN, CSS_FORBIDDEN: CSS_FORBIDDEN, strip: strip };
