const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const acorn = require('acorn');
const { stripJsonComments } = require('../server/config');

const ROOT = path.join(__dirname, '..', '..');

function trackedFiles() {
  try {
    return cp.execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
  } catch (e) {
    return null;
  }
}

function jsComments(src) {
  const found = [];
  const opts = { ecmaVersion: 'latest', allowHashBang: true, allowReturnOutsideFunction: true, onComment: function (block, text) { found.push(text); } };
  try { acorn.parse(src, Object.assign({ sourceType: 'script' }, opts)); } catch (e) { found.length = 0; acorn.parse(src, Object.assign({ sourceType: 'module' }, opts)); }
  return found;
}

function cssComments(src) {
  const found = [];
  let quote = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i + 2); found.push(src.slice(i, end < 0 ? src.length : end + 2)); i = end < 0 ? src.length : end + 1; }
  }
  return found;
}

function lineComments(src, pattern) {
  return src.split('\n').map(function (l, n) { return n === 0 && l.startsWith('#!') ? '' : l; }).filter(function (l) { return pattern.test(l); });
}

function commentsIn(file, src) {
  const ext = path.extname(file).toLowerCase();
  const base = path.basename(file);
  if (ext === '.js') return jsComments(src);
  if (ext === '.css') return cssComments(src);
  if (ext === '.json') return stripJsonComments(src) === src ? [] : ['// or /* */'];
  if (ext === '.html' || ext === '.svg') {
    const found = src.match(/<!--[\s\S]*?-->/g) || [];
    src.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/g, function (m, attrs, body) { if (!/\bsrc=/.test(attrs)) found.push.apply(found, jsComments(body)); return m; });
    src.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/g, function (m, body) { found.push.apply(found, cssComments(body)); return m; });
    return found;
  }
  if (ext === '.ps1') return lineComments(src.replace(/^﻿/, ''), /^\s*(#|<#)|\s#\s|\/\/\s/);
  if (ext === '.sh' || ext === '.yml' || ext === '.yaml' || ['.gitignore', '.gitattributes', 'CODEOWNERS', '.env.example'].indexOf(base) >= 0) return lineComments(src, /^\s*#|\s#\s/);
  if (ext === '.vbs') return lineComments(src, /^\s*'/);
  if (ext === '.bat' || ext === '.cmd') return lineComments(src, /^\s*@?(rem\b|::)/i);
  return [];
}

test('zero comments: no file in the repository contains comments', function (t) {
  const files = trackedFiles();
  if (!files) { t.skip('git not available'); return; }
  const offenders = [];
  files.forEach(function (file) {
    if (/(^|\/)package-lock\.json$/.test(file)) return;
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) return;
    const found = commentsIn(file, fs.readFileSync(full, 'utf8'));
    if (found.length) offenders.push(file + ': ' + String(found[0]).split('\n')[0].trim().slice(0, 80));
  });
  assert.deepStrictEqual(offenders, [], 'remove these comments (project rule: zero comments)');
});
