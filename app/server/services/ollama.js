const config = require('../config');
const common = require('../platform/common');
const chats = require('./chats');

const MAX_MESSAGES = 40;

function settings() {
  const s = (config.get('services').ollama) || {};
  return {
    url: (process.env.OLLAMA_URL || s.url || 'http://127.0.0.1:11434').replace(/\/+$/, ''),
    defaultModel: s.defaultModel || '',
    timeoutMs: s.timeoutMs || 180000,
    system: s.system || '',
    keepAlive: s.keepAlive || '10m'
  };
}

async function models() {
  const s = settings();
  try {
    const r = await common.fetchJson(s.url + '/api/tags', { timeout: 3000 });
    if (!r.ok) return { running: false, models: [], error: 'Ollama ha risposto ' + r.status };
    const list = ((r.data && r.data.models) || []).map(function (m) {
      return { name: m.name, sizeGb: m.size ? Math.round((m.size / 1073741824) * 10) / 10 : null };
    });
    list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    let def = s.defaultModel;
    if (!def || !list.some(function (m) { return m.name === def; })) def = list.length ? list[0].name : '';
    return { running: true, models: list, defaultModel: def };
  } catch (e) {
    return { running: false, models: [], error: 'Ollama non è in esecuzione (' + s.url + ')' };
  }
}

function stripThinking(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

async function chat(sessionId, model, text) {
  const s = settings();
  if (!model) throw Object.assign(new Error('Scegli un modello'), { code: 'BAD_REQUEST' });
  let session = chats.get('ollama', sessionId);
  if (!session || session.model !== model) session = chats.create('ollama', { model: model });
  if (session.busy) throw Object.assign(new Error('Sto ancora rispondendo al messaggio precedente'), { code: 'BUSY' });
  if (session.messages.length >= MAX_MESSAGES) {
    throw Object.assign(new Error('Conversazione troppo lunga: premi NUOVA'), { code: 'TOO_LONG' });
  }

  const messages = [];
  if (s.system) messages.push({ role: 'system', content: s.system });
  session.messages.push({ role: 'user', content: String(text) });
  session.busy = true;
  try {
    const r = await common.fetchJson(s.url + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model, messages: messages.concat(session.messages), stream: false, keep_alive: s.keepAlive }),
      timeout: s.timeoutMs
    });
    if (!r.ok) throw new Error((r.data && r.data.error) || ('Ollama ha risposto ' + r.status));
    const reply = stripThinking(r.data && r.data.message && r.data.message.content);
    session.messages.push({ role: 'assistant', content: reply });
    return { sessionId: session.id, model: model, reply: reply };
  } catch (e) {
    session.messages.pop();
    if (e.name === 'AbortError') throw new Error('Ollama ci sta mettendo troppo: riprova o usa un modello più piccolo');
    if (/fetch failed|ECONNREFUSED/i.test(e.message)) throw new Error('Ollama non è in esecuzione');
    throw e;
  } finally {
    session.busy = false;
  }
}

module.exports = { models: models, chat: chat, stripThinking: stripThinking, settings: settings };
