'use strict';
const ollama = require('./lib/ollama');

function bad(msg) { return Object.assign(new Error(msg), { code: 'BAD_REQUEST', status: 400 }); }

module.exports = {
  description: 'Chat with the local Ollama models',
  routes: function (router, ctx) {
    ollama.configure(function () { return ctx.config.get('services').ollama; });
    router.get('/models', ctx.route(function () { return ollama.models(); }));
    router.post('/chat', ctx.route(function (req) {
      const b = req.body || {};
      if (!b.text || !String(b.text).trim()) throw bad('Messaggio vuoto');
      return ollama.chat(b.sessionId, String(b.model || ''), String(b.text).slice(0, 8000));
    }));
  }
};
