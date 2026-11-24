'use strict';
const http = require('http');

class FakeDeepSeek {
  constructor(key) {
    this.key = key || 'sk-test-12345678';
    this.models = ['deepseek-v4-flash', 'deepseek-v4-pro'];
    this.balance = { is_available: true, balance_infos: [{ currency: 'USD', total_balance: '4.20', granted_balance: '0.20', topped_up_balance: '4.00' }] };
    this.requests = [];
    this.reply = 'Ciao! Sono **DeepSeek**.';
    this.thinking = '';
    this.delayMs = 5;
    this.status = 200;
    this.hold = false;
  }

  listen() {
    const self = this;
    this.server = http.createServer(function (req, res) { self.handle(req, res); });
    return new Promise(function (resolve) {
      self.server.listen(0, '127.0.0.1', function () { self.port = self.server.address().port; self.url = 'http://127.0.0.1:' + self.port; resolve(self); });
    });
  }

  close() { if (this.server) { this.server.closeAllConnections(); this.server.close(); } }

  json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }

  handle(req, res) {
    const self = this;
    let raw = '';
    req.on('data', function (d) { raw += d; });
    req.on('end', function () {
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch (e) { body = null; }
      self.requests.push({ method: req.method, url: req.url, body: body, auth: req.headers.authorization });
      if (req.headers.authorization !== 'Bearer ' + self.key) return self.json(res, 401, { error: { message: 'Authentication Fails' } });
      if (req.method === 'GET' && req.url === '/models') return self.json(res, 200, { object: 'list', data: self.models.map(function (m) { return { id: m, object: 'model', owned_by: 'deepseek' }; }) });
      if (req.method === 'GET' && req.url === '/user/balance') return self.json(res, 200, self.balance);
      if (req.method === 'POST' && req.url === '/chat/completions') return self.chat(body, res);
      self.json(res, 404, { error: { message: 'not found' } });
    });
  }

  chat(body, res) {
    if (this.status !== 200) return this.json(res, this.status, { error: { message: 'Insufficient Balance' } });
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const parts = [];
    const self = this;
    function ev(delta, finish) { return 'data: ' + JSON.stringify({ id: 'x', model: body.model, choices: [{ index: 0, delta: delta, finish_reason: finish || null }] }) + '\n\n'; }
    if (this.thinking) parts.push(ev({ role: 'assistant', reasoning_content: this.thinking }));
    const words = this.reply.match(/\S+\s*/g) || [];
    words.forEach(function (w) { parts.push(ev({ content: w })); });
    parts.push(ev({}, 'stop'));
    parts.push('data: ' + JSON.stringify({ id: 'x', choices: [], usage: { prompt_tokens: 12, completion_tokens: words.length } }) + '\n\n');
    parts.push('data: [DONE]\n\n');
    let i = 0;
    function next() {
      if (res.destroyed) return;
      if (self.hold && i === 2) { setTimeout(next, 50); return; }
      if (i >= parts.length) { res.end(); return; }
      res.write(parts[i++]);
      setTimeout(next, self.delayMs);
    }
    next();
  }
}

module.exports = { FakeDeepSeek: FakeDeepSeek };
