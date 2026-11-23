const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const paths = require('../paths');
const common = require('../platform/common');

function settings() {
  const v = (config.get('services').voice) || {};
  return {
    command: v.command ? common.expandPath(v.command) : '',
    args: Array.isArray(v.args) && v.args.length ? v.args : ['{file}'],
    timeoutMs: v.timeoutMs || 120000
  };
}

function available() {
  const s = settings();
  return !!s.command && (common.looksLikePath(s.command) ? fs.existsSync(s.command) : !!common.which(s.command));
}

function extFor(mime) {
  if (/3gpp|amr/.test(mime)) return '.3gp';
  if (/mp4|m4a|aac/.test(mime)) return '.m4a';
  if (/ogg|opus/.test(mime)) return '.ogg';
  if (/webm/.test(mime)) return '.webm';
  if (/mpeg|mp3/.test(mime)) return '.mp3';
  return '.wav';
}

async function transcribe(buffer, mime) {
  if (!available()) throw Object.assign(new Error('Trascrizione sul PC non configurata (services.json -> voice)'), { code: 'UNAVAILABLE' });
  if (!buffer || !buffer.length) throw Object.assign(new Error('Audio vuoto'), { code: 'BAD_REQUEST' });
  const s = settings();
  const dir = path.join(paths.DATA_DIR, 'tmp');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'voce-' + crypto.randomBytes(4).toString('hex') + extFor(String(mime || '')));
  fs.writeFileSync(file, buffer);
  try {
    const r = await common.run(s.command, s.args.map(function (a) { return String(a).split('{file}').join(file); }), { timeout: s.timeoutMs });
    if (!r.ok) throw new Error('Trascrizione non riuscita: ' + (r.stderr.trim().split('\n').pop() || r.error));
    const text = r.stdout
      .replace(/^\s*\[[0-9:.\s\->]+\]\s*/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
    return { text: text };
  } finally {
    try { fs.unlinkSync(file); } catch (e) { }
  }
}

module.exports = { available: available, transcribe: transcribe };
