'use strict';
const viber = require('./lib/viber');

let service = null;
function get(ctx) {
  if (!service) service = viber.create({ platform: ctx.platform, keys: ctx.keys, log: ctx.log });
  return service;
}

module.exports = {
  description: 'Viber through its MCP server: panels, layouts, views, projects and tasks',
  actions: {
    viber: async function (a, ctx) {
      return { message: null, viber: await get(ctx).action(a) };
    }
  },
  routes: function (router, ctx) {
    const body = function (req, key) { return String((req.body || {})[key] || ''); };
    router.get('/state', ctx.route(function () { return get(ctx).state(); }));
    router.get('/tasks', ctx.route(function () { return get(ctx).tasks(); }));
    router.get('/projects', ctx.route(function () { return get(ctx).projects(); }));
    router.post('/panel', ctx.route(function (req) { return get(ctx).focusPanel(body(req, 'panel')); }));
    router.post('/view', ctx.route(function (req) { return get(ctx).view(body(req, 'mode')); }));
    router.post('/layout', ctx.route(function (req) { return get(ctx).setLayout(body(req, 'preset')); }));
    router.post('/project', ctx.route(function (req) { return get(ctx).project(body(req, 'target')); }));
  }
};
