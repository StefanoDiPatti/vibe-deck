const crypto = require('crypto');
const events = require('./events');

const DEFAULT_WAIT_MS = 90000;
const MAX_PENDING = 10;
const SUMMARY_MAX = 300;

function fail(message, code) { return Object.assign(new Error(message), { code: code || 'BAD_REQUEST' }); }

function clip(text, max) {
  const t = String(text == null ? '' : text).replace(/[\u0000-\u001f]+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function summarize(tool, input) {
  const i = input && typeof input === 'object' ? input : {};
  const first = i.command || i.file_path || i.path || i.url || i.pattern || i.query || i.description || '';
  if (first) return clip(first, SUMMARY_MAX);
  const text = JSON.stringify(i);
  return text === '{}' ? '' : clip(text, SUMMARY_MAX);
}

class PermissionBroker {
  constructor(bus) {
    this.bus = bus;
    this.pending = new Map();
  }

  request(payload, waitMs) {
    payload = payload && typeof payload === 'object' ? payload : {};
    if (this.pending.size >= MAX_PENDING) return Promise.resolve({ decision: 'none' });
    const id = crypto.randomBytes(6).toString('hex');
    const tool = clip(payload.tool_name || 'Strumento', 60);
    const summary = summarize(tool, payload.tool_input);
    const project = clip(String(payload.cwd || '').split(/[\\/]/).filter(Boolean).pop() || '', 60);
    const wait = waitMs > 0 ? waitMs : DEFAULT_WAIT_MS;
    const broker = this;
    return new Promise(function (resolve) {
      const timer = setTimeout(function () { broker.settle(id, 'none'); }, wait);
      if (timer.unref) timer.unref();
      broker.pending.set(id, { id: id, tool: tool, summary: summary, project: project, at: Date.now(), expires: Date.now() + wait, resolve: resolve, timer: timer });
      broker.bus.publish('permission', { permId: id, tool: tool, summary: summary, title: project ? tool + ' · ' + project : tool, message: summary });
    });
  }

  settle(id, decision) {
    const hit = this.pending.get(id);
    if (!hit) return false;
    clearTimeout(hit.timer);
    this.pending.delete(id);
    hit.resolve({ decision: decision });
    return true;
  }

  answer(id, decision) {
    if (decision !== 'allow' && decision !== 'deny') throw fail('Risposta non valida');
    if (!this.settle(String(id), decision)) throw fail('La richiesta è scaduta o è già stata decisa', 'NOT_FOUND');
    return { id: id, decision: decision };
  }

  list() {
    return Array.from(this.pending.values()).map(function (p) {
      return { id: p.id, tool: p.tool, summary: p.summary, project: p.project, at: p.at, expires: p.expires };
    });
  }

  cancelAll() {
    const ids = Array.from(this.pending.keys());
    const broker = this;
    ids.forEach(function (id) { broker.settle(id, 'none'); });
  }
}

const broker = new PermissionBroker(events.bus);

module.exports = { broker: broker, PermissionBroker: PermissionBroker, summarize: summarize };
