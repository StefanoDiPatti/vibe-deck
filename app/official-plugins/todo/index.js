'use strict';
const todo = require('./lib/todo');
const todosync = require('./lib/todosync');
const voice = require('../../server/services/voice');

function state() { return { items: todo.list(), source: todo.source(), notes: todo.notes(), voiceServer: voice.available(), sync: todosync.status() }; }

module.exports = {
  description: 'Your tasks on the HOME: Sticky Notes or a local list',
  hooks: {
    start: function () { todosync.start(); },
    stop: function () { todosync.stop(); }
  },
  routes: function (router, ctx) {
    const r = ctx.route;
    router.get('/', r(state));
    router.post('/add', r(async function (req) {
      const b = req.body || {};
      const item = await todo.add(b.text, b.priority, b.note ? String(b.note) : '');
      return Object.assign(state(), { item: item });
    }));
    router.post('/toggle', r(async function (req) { await todo.toggle((req.body || {}).id); return state(); }));
    router.post('/remove', r(async function (req) { await todo.remove((req.body || {}).id); return state(); }));
    router.post('/sync', r(async function () { await todosync.sync(); return state(); }));
    router.post('/clear', r(async function () { const removed = await todo.clearDone(); return Object.assign(state(), { removed: removed }); }));
  }
};
