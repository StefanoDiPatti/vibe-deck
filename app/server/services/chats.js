const crypto = require('crypto');

const MAX_SESSIONS = 30;
const sessions = {};

function create(provider, extra) {
  const ids = Object.keys(sessions);
  if (ids.length >= MAX_SESSIONS) {
    ids.sort(function (a, b) { return sessions[a].touched - sessions[b].touched; });
    delete sessions[ids[0]];
  }
  const id = crypto.randomBytes(8).toString('hex');
  sessions[id] = Object.assign({ id: id, provider: provider, messages: [], touched: Date.now(), busy: false }, extra || {});
  return sessions[id];
}

function get(provider, id) {
  const s = id && sessions[id];
  if (!s || s.provider !== provider) return null;
  s.touched = Date.now();
  return s;
}

function remove(id) { delete sessions[id]; }

module.exports = { create: create, get: get, remove: remove };
