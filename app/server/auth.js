const crypto = require('crypto');
const log = require('./log');

const COOKIE = 'dock_token';
const attempts = {};

function token() { return (process.env.DOCK_TOKEN || '').trim(); }

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function normalizeIp(ip) {
  ip = String(ip || '');
  if (ip.indexOf('::ffff:') === 0) ip = ip.slice(7);
  return ip;
}

function isPrivateIp(ip) {
  ip = normalizeIp(ip);
  if (ip === '::1' || ip === '127.0.0.1' || ip.indexOf('127.') === 0) return true;
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  const m = /^172\.(\d+)\./.exec(ip);
  if (m && +m[1] >= 16 && +m[1] <= 31) return true;
  const lower = ip.toLowerCase();
  if (lower.indexOf('fe80:') === 0 || lower.indexOf('fc') === 0 || lower.indexOf('fd') === 0) return true;
  return false;
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach(function (part) {
    const eq = part.indexOf('=');
    if (eq < 0) return;
    const k = part.slice(0, eq).trim();
    try { out[k] = decodeURIComponent(part.slice(eq + 1).trim()); } catch (e) { out[k] = ''; }
  });
  return out;
}

function requestToken(req) {
  return req.get('x-dock-token') || parseCookies(req.headers.cookie)[COOKIE] || '';
}

function isAuthorized(req) {
  const t = token();
  if (!t) return true;
  return safeEqual(requestToken(req), t);
}

function setCookie(res) {
  res.setHeader('Set-Cookie', COOKIE + '=' + encodeURIComponent(token()) +
    '; Path=/; Max-Age=315360000; HttpOnly; SameSite=Lax');
}

function tooManyAttempts(ip) {
  const now = Date.now();
  const a = attempts[ip] || { count: 0, since: now };
  if (now - a.since > 60000) { a.count = 0; a.since = now; }
  a.count++;
  attempts[ip] = a;
  return a.count > 8;
}

function lanOnly(req, res, next) {
  if (process.env.ALLOW_ANY_IP === '1' || isPrivateIp(req.socket.remoteAddress)) return next();
  log.warn('auth', 'Richiesta rifiutata da IP non locale ' + req.socket.remoteAddress);
  res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Solo rete locale' } });
}

function requireToken(req, res, next) {
  if (isAuthorized(req)) return next();
  res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Token mancante o errato' } });
}

function tokenFromQuery(req, res, next) {
  if (req.path !== '/' || !req.query.t) return next();
  const given = String(req.query.t).trim();
  if (token() && safeEqual(given, token())) {
    setCookie(res);
    return res.redirect(302, '/#codice=' + encodeURIComponent(given));
  }
  res.redirect(302, '/');
}

function pairHandler(req, res) {
  const ip = normalizeIp(req.socket.remoteAddress);
  if (tooManyAttempts(ip)) {
    return res.status(429).json({ ok: false, error: { code: 'RATE_LIMIT', message: 'Troppi tentativi, aspetta un minuto' } });
  }
  const given = String((req.body && req.body.token) || '').trim();
  if (!token() || safeEqual(given, token())) {
    setCookie(res);
    log.info('auth', 'Dispositivo associato: ' + ip);
    return res.json({ ok: true, data: { paired: true } });
  }
  log.warn('auth', 'Codice errato da ' + ip);
  res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Codice errato' } });
}

function generateToken() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

module.exports = {
  isPrivateIp: isPrivateIp,
  parseCookies: parseCookies,
  isAuthorized: isAuthorized,
  lanOnly: lanOnly,
  requireToken: requireToken,
  tokenFromQuery: tokenFromQuery,
  pairHandler: pairHandler,
  generateToken: generateToken
};
