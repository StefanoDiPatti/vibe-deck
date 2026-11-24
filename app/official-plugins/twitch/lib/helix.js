'use strict';

function api() { return process.env.TWITCH_API || 'https://api.twitch.tv/helix'; }
function idUrl() { return process.env.TWITCH_ID || 'https://id.twitch.tv/oauth2'; }
const TIMEOUT_MS = 12000;
const SCOPES = [
  'channel:manage:broadcast', 'channel:edit:commercial', 'clips:edit', 'moderator:manage:chat_settings',
  'user:write:chat', 'user:read:chat', 'moderator:read:followers'
];

function fail(message, code) { return Object.assign(new Error(message), { code: code || 'UNAVAILABLE' }); }

async function call(method, url, opts) {
  const o = opts || {};
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: method, signal: ctrl.signal, headers: o.headers, body: o.body });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { message: text }; }
    if (!res.ok) {
      const err = fail('Twitch: ' + ((data && (data.message || data.error)) || ('errore ' + res.status)), res.status === 401 ? 'UNAUTHORIZED_TWITCH' : res.status === 400 ? 'BAD_REQUEST' : 'UNAVAILABLE');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw fail('Twitch non risponde');
    if (e.code) throw e;
    throw fail('Twitch non raggiungibile');
  } finally {
    clearTimeout(timer);
  }
}

function form(obj) {
  return Object.keys(obj).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]); }).join('&');
}

class DeviceAuth {
  start(clientId) {
    return call('POST', idUrl() + '/device', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ client_id: clientId, scopes: SCOPES.join(' ') }) });
  }
  poll(clientId, deviceCode) {
    return call('POST', idUrl() + '/token', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ client_id: clientId, scopes: SCOPES.join(' '), device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' })
    });
  }
  refresh(clientId, refreshToken) {
    return call('POST', idUrl() + '/token', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ client_id: clientId, grant_type: 'refresh_token', refresh_token: refreshToken }) });
  }
}

class Helix {
  constructor(session) { this.session = session; }

  async request(method, path, query, body, retried) {
    const s = this.session();
    if (!s || !s.token) throw fail('Collega Twitch dal pannello di controllo sul PC', 'UNAVAILABLE');
    const qs = query ? '?' + form(query) : '';
    try {
      return await call(method, api() + path + qs, {
        headers: Object.assign({ Authorization: 'Bearer ' + s.token, 'Client-Id': s.clientId }, body ? { 'Content-Type': 'application/json' } : {}),
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      if (e.code === 'UNAUTHORIZED_TWITCH' && !retried && s.onExpired) {
        await s.onExpired();
        return this.request(method, path, query, body, true);
      }
      throw e;
    }
  }

  async me() { return ((await this.request('GET', '/users')).data || [])[0] || null; }
  async stream(userId) { return ((await this.request('GET', '/streams', { user_id: userId })).data || [])[0] || null; }
  async channel(userId) { return ((await this.request('GET', '/channels', { broadcaster_id: userId })).data || [])[0] || null; }
  async followers(userId) { return (await this.request('GET', '/channels/followers', { broadcaster_id: userId, first: 1 })).total || 0; }
  async categories(query) { return ((await this.request('GET', '/search/categories', { query: query, first: 8 })).data || []).map(function (c) { return { id: c.id, name: c.name }; }); }
  setChannel(userId, changes) { return this.request('PATCH', '/channels', { broadcaster_id: userId }, changes); }
  marker(userId, description) { return this.request('POST', '/streams/markers', null, { user_id: userId, description: description || 'Vibe Deck' }); }
  async clip(userId) { return ((await this.request('POST', '/clips', { broadcaster_id: userId })).data || [])[0] || null; }
  async commercial(userId, length) { return ((await this.request('POST', '/channels/commercial', null, { broadcaster_id: userId, length: length })).data || [])[0] || null; }
  async chatSettings(userId) { return ((await this.request('GET', '/chat/settings', { broadcaster_id: userId, moderator_id: userId })).data || [])[0] || {}; }
  setChatSettings(userId, changes) { return this.request('PATCH', '/chat/settings', { broadcaster_id: userId, moderator_id: userId }, changes); }
  say(userId, text) { return this.request('POST', '/chat/messages', null, { broadcaster_id: userId, sender_id: userId, message: text }); }
}

module.exports = { Helix: Helix, DeviceAuth: DeviceAuth, SCOPES: SCOPES };
