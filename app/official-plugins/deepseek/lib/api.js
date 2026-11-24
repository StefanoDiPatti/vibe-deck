'use strict';

const DEFAULT_URL = 'https://api.deepseek.com';
const SHORT_TIMEOUT_MS = 10000;

function fail(message, code, status) { return Object.assign(new Error(message), { code: code || 'UNAVAILABLE', status: status }); }

function friendly(status, body) {
  const msg = body && body.error && body.error.message ? body.error.message : '';
  if (status === 401) return fail('Chiave API di DeepSeek non valida', 'UNAUTHORIZED_DEEPSEEK', status);
  if (status === 402) return fail('Credito DeepSeek esaurito: ricarica su platform.deepseek.com', 'NO_CREDIT', status);
  if (status === 422 || status === 400) return fail('DeepSeek ha rifiutato la richiesta' + (msg ? ': ' + msg : ''), 'BAD_REQUEST', status);
  if (status === 429) return fail('Troppe richieste a DeepSeek: riprova tra poco', 'RATE_LIMIT', status);
  if (status >= 500) return fail('DeepSeek ha un problema in questo momento (' + status + ')', 'UNAVAILABLE', status);
  return fail('DeepSeek ha risposto ' + status + (msg ? ': ' + msg : ''), 'UNAVAILABLE', status);
}

class SseParser {
  constructor(onEvent) { this.buf = ''; this.onEvent = onEvent; }
  push(chunk) {
    this.buf += chunk;
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).replace(/\r$/, '');
      this.buf = this.buf.slice(i + 1);
      if (line.indexOf('data:') !== 0) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let json = null;
      try { json = JSON.parse(data); } catch (e) { continue; }
      this.onEvent(json);
    }
  }
}

class DeepSeekApi {
  constructor(opts) {
    const o = opts || {};
    this.url = String(o.url || process.env.DEEPSEEK_URL || DEFAULT_URL).replace(/\/+$/, '');
    this.key = String(o.key || '');
  }

  headers() {
    return { Authorization: 'Bearer ' + this.key, 'Content-Type': 'application/json', Accept: 'application/json' };
  }

  async request(method, route, body, timeoutMs) {
    if (!this.key) throw fail('Manca la chiave API di DeepSeek: inseriscila nel pannello del PC', 'SETUP');
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || SHORT_TIMEOUT_MS);
    try {
      const res = await fetch(this.url + route, { method: method, headers: this.headers(), body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : {}; } catch (e) { data = {}; }
      if (!res.ok) throw friendly(res.status, data);
      return data;
    } catch (e) {
      throw this.network(e);
    } finally {
      clearTimeout(timer);
    }
  }

  network(e) {
    if (e.name === 'AbortError') return fail('DeepSeek non risponde');
    if (e.code && e.code !== 'ECONNREFUSED' && !/fetch failed/i.test(e.message)) return e;
    return fail('Impossibile raggiungere DeepSeek (connessione Internet?)');
  }

  async models() {
    const d = await this.request('GET', '/models');
    return ((d && d.data) || []).map(function (m) { return String(m.id || ''); }).filter(Boolean).sort();
  }

  async balance() {
    const d = await this.request('GET', '/user/balance');
    const infos = (d && d.balance_infos) || [];
    const pick = infos.filter(function (b) { return b.currency === 'USD'; })[0] || infos[0] || null;
    return {
      available: !!(d && d.is_available),
      currency: pick ? String(pick.currency || '') : '',
      total: pick ? Number(pick.total_balance) || 0 : 0,
      granted: pick ? Number(pick.granted_balance) || 0 : 0,
      toppedUp: pick ? Number(pick.topped_up_balance) || 0 : 0
    };
  }

  async stream(body, handlers, timeoutMs) {
    if (!this.key) throw fail('Manca la chiave API di DeepSeek: inseriscila nel pannello del PC', 'SETUP');
    const h = handlers || {};
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || 300000);
    if (h.signal) h.signal.addEventListener('abort', function () { ctrl.abort(); });
    const usage = { value: null };
    const finish = { value: '' };
    const parser = new SseParser(function (ev) {
      const choice = ev.choices && ev.choices[0];
      if (ev.usage) usage.value = ev.usage;
      if (!choice) return;
      const d = choice.delta || {};
      if (d.reasoning_content && h.onThinking) h.onThinking(String(d.reasoning_content));
      if (d.content && h.onText) h.onText(String(d.content));
      if (choice.finish_reason) finish.value = choice.finish_reason;
    });
    try {
      const res = await fetch(this.url + '/chat/completions', {
        method: 'POST',
        headers: Object.assign(this.headers(), { Accept: 'text/event-stream' }),
        body: JSON.stringify(Object.assign({}, body, { stream: true, stream_options: { include_usage: true } })),
        signal: ctrl.signal
      });
      if (!res.ok) {
        let data = {};
        try { data = JSON.parse(await res.text()); } catch (e) { data = {}; }
        throw friendly(res.status, data);
      }
      const decoder = new TextDecoder();
      for await (const chunk of res.body) parser.push(decoder.decode(chunk, { stream: true }));
      parser.push('\n');
      return { finish: finish.value, usage: usage.value };
    } catch (e) {
      if (e.name === 'AbortError' && h.signal && h.signal.aborted) throw fail('Risposta fermata', 'STOPPED');
      throw this.network(e);
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { DeepSeekApi: DeepSeekApi, SseParser: SseParser, DEFAULT_URL: DEFAULT_URL };
