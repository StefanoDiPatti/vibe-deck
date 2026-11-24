'use strict';
const path = require('path');
const { LolData, uggUrl, ROLES } = require('./lib/data');

let data = null;
function store(ctx) {
  if (!data) data = new LolData(path.join(ctx.dataDir));
  return data;
}

module.exports = {
  description: 'League of Legends: pick a champion by name or role, see the abilities, open the build on u.gg',
  actions: {
    build: {
      label: 'Build su u.gg',
      description: 'Apre sul PC la build di un campione su u.gg',
      params: [
        { name: 'champion', label: 'Campione (id di Riot, es. Ahri)', type: 'text', required: true },
        { name: 'role', label: 'Ruolo', type: 'select', options: ROLES.map(function (r) { return { value: r, label: r.toUpperCase() }; }) }
      ],
      run: async function (action, ctx) {
        if (!/^[A-Za-z0-9]+$/.test(String(action.champion || ''))) throw Object.assign(new Error('Campione non valido'), { code: 'BAD_CONFIG' });
        await ctx.execute({ type: 'open_url', url: uggUrl(action.champion, action.role) });
        return 'Build aperta sul PC';
      }
    }
  },
  publicRoutes: function (router, ctx) {
    router.get('/img/:kind/:file', function (req, res) {
      store(ctx).image(req.params.kind, req.params.file).then(function (buf) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'max-age=604800');
        res.end(buf);
      }, function (e) {
        res.status(e.code === 'BAD_REQUEST' ? 400 : 404).end();
      });
    });
  },
  routes: function (router, ctx) {
    const r = ctx.route;
    router.get('/champions', r(function () { return store(ctx).champions(); }));
    router.get('/champion/:id', r(function (req) { return store(ctx).champion(req.params.id); }));
    router.post('/open', r(async function (req) {
      const b = req.body || {};
      const c = await store(ctx).champion(String(b.id || ''));
      const role = ROLES.indexOf(b.role) >= 0 ? b.role : '';
      await ctx.execute({ type: 'open_url', url: uggUrl(c.id, role) });
      return { message: 'Build di ' + c.name + (role ? ' (' + role.toUpperCase() + ')' : '') + ' aperta sul PC' };
    }));
  }
};
