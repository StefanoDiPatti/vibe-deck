const fs = require('fs');
const paths = require('./paths');
const secrets = require('./secrets');

const PLAIN_KEYS = { DOCK_TOKEN: true };
function isSecretKey(key) {
  return !PLAIN_KEYS[key] && /(TOKEN|SECRET|PASSWORD|PASS|API_KEY|_KEY)$/i.test(key);
}

function parseEnv(text) {
  const out = {};
  text.split(/\r?\n/).forEach(function (line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed[0] === '#') return;
    const eq = trimmed.indexOf('=');
    if (eq < 1) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value[0] === '"' && value[value.length - 1] === '"') ||
        (value[0] === "'" && value[value.length - 1] === "'")) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  });
  return out;
}

function sealEnv(file) {
  file = file || paths.ENV_FILE;
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const eol = text.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const sealed = [];
  const lines = text.split(/\r?\n/).map(function (line) {
    const m = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*?)\s*$/.exec(line);
    if (!m || !isSecretKey(m[2])) return line;
    let value = m[4];
    if ((value[0] === '"' && value[value.length - 1] === '"') || (value[0] === "'" && value[value.length - 1] === "'")) value = value.slice(1, -1);
    if (!value || secrets.isEncrypted(value)) return line;
    sealed.push(m[2]);
    return m[1] + m[2] + m[3] + secrets.encrypt(value);
  });
  if (!sealed.length) return [];
  fs.writeFileSync(file + '.tmp', lines.join(eol), { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
  return sealed;
}

function loadEnv(file) {
  file = file || paths.ENV_FILE;
  if (!fs.existsSync(file)) return {};
  try {
    const sealed = process.env.NODE_TEST_CONTEXT && file === paths.ENV_FILE ? [] : sealEnv(file);
    if (sealed.length) console.log('  .env: cifrati ' + sealed.join(', '));
  } catch (e) {
    console.error('  .env: cifratura dei segreti non riuscita (' + e.message + '): restano in chiaro');
  }
  const parsed = parseEnv(fs.readFileSync(file, 'utf8'));
  Object.keys(parsed).forEach(function (key) {
    if (process.env[key] !== undefined) return;
    let value = parsed[key];
    if (secrets.isEncrypted(value)) {
      try { value = secrets.decrypt(value); } catch (e) {
        console.error('  .env: ' + key + ' non decifrabile (' + e.message + '): scrivilo di nuovo in chiaro');
        return;
      }
    }
    process.env[key] = value;
  });
  return parsed;
}

module.exports = { parseEnv: parseEnv, loadEnv: loadEnv, sealEnv: sealEnv, isSecretKey: isSecretKey };
