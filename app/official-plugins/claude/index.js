'use strict';
const claude = require('./lib/claude');
const desktopcode = require('./lib/desktopcode');
const claudeusage = require('./lib/claudeusage');
const voice = require('../../server/services/voice');

function str(v) { return String(v || ''); }

module.exports = {
  description: 'Claude chats, Claude Code sessions of the desktop app and subscription usage',
  routes: function (router, ctx) {
    const r = ctx.route;
    ctx.log.info('Claude: ' + (function (ci) { return ci.available ? ci.backend + ' (' + ci.model + ')' : 'non configurato'; })(claude.info()));
    router.get('/info', r(function () { return Object.assign(claude.info(), { voiceServer: voice.available() }); }));
    router.get('/usage', r(function (req) { return claudeusage.usage(req.query.refresh === '1'); }));
    router.get('/desktop', r(function () { return desktopcode.list(); }));
    router.get('/desktop/session', r(function (req) { return desktopcode.get(str(req.query.id)); }));
    router.post('/desktop/send', r(function (req) { const b = req.body || {}; return desktopcode.send(str(b.id), b.text); }));
    router.post('/desktop/cancel', r(function (req) { return desktopcode.cancel(str((req.body || {}).id)); }));
    router.post('/desktop/stop', r(function (req) { return desktopcode.stop(str((req.body || {}).id)); }));
    router.post('/desktop/open', r(function (req) { return desktopcode.openOnPc(str((req.body || {}).id)); }));
    router.post('/desktop/new', r(function (req) { const b = req.body || {}; return desktopcode.create(str(b.section), b.text); }));
    router.get('/chats', r(function () { return claude.listChats(); }));
    router.get('/chat', r(function (req) { return claude.getChat(str(req.query.kind), str(req.query.id)); }));
    router.post('/send', r(function (req) {
      const b = req.body || {};
      return claude.send(str(b.kind), b.id ? String(b.id) : null, str(b.text).slice(0, 12000), b.cwd ? String(b.cwd) : null);
    }));
    router.get('/job', r(function (req) { return claude.getJob(str(req.query.id)); }));
    router.post('/delete', r(function (req) { return claude.deleteChat(str((req.body || {}).id)); }));
  }
};
