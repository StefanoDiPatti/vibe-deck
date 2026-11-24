'use strict';
const github = require('./lib/github');

module.exports = {
  description: 'Your GitHub repositories with CI, deploys, pull requests and issues',
  routes: function (router, ctx) {
    router.get('/', ctx.route(function (req) { return github.summary(req.query.refresh === '1'); }));
    router.post('/open', ctx.route(async function (req) {
      const b = req.body || {};
      const url = github.urlFor(String(b.repo || ''), String(b.what || ''));
      if (!url) throw Object.assign(new Error('Repository sconosciuto'), { code: 'NOT_FOUND' });
      await ctx.platform.open(url);
      return { message: 'Aperto sul PC' };
    }));
  }
};
