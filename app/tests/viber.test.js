'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const keys = require('../server/platform/keys');
const viber = require('../official-plugins/viber/lib/viber');

function fakeViber(t, world) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'viber-'));
  const projects = {};
  world.projects = world.projects.map(function (name) {
    const p = path.join(dir, name);
    fs.mkdirSync(p, { recursive: true });
    projects[name] = p;
    return p;
  });
  world.shown = projects[world.shown];
  world.agents = (world.agents || []).map(function (a) { return Object.assign({}, a, { agent: path.join(dir, a.agent) }); });
  const tasks = {};
  Object.keys(world.tasks || {}).forEach(function (name) { tasks[projects[name]] = world.tasks[name]; });
  world.tasks = tasks;
  const stateFile = path.join(dir, 'world.json');
  fs.writeFileSync(stateFile, JSON.stringify(world));
  const server = net.createServer(function (s) { s.end(); });
  const env = { VIBER_MCP_SERVER: path.join(__dirname, 'fixtures', 'fake-viber-mcp.js'), FAKE_VIBER_STATE: stateFile, VIBER_MCP_ENDPOINT: path.join(dir, 'endpoint.json') };
  const prev = {};
  Object.keys(env).forEach(function (k) { prev[k] = process.env[k]; process.env[k] = env[k]; });
  const sent = [];
  const svc = viber.create({
    platform: { focus: async function () { }, sendKeys: async function (combo) { sent.push(combo.join('+')); } },
    keys: keys
  });
  t.after(async function () {
    await svc.stop();
    server.close();
    Object.keys(prev).forEach(function (k) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; });
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  return new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', function () {
      fs.writeFileSync(env.VIBER_MCP_ENDPOINT, JSON.stringify({ port: server.address().port, token: 'x' }));
      resolve({
        svc: svc, projects: projects, sent: sent,
        calls: function () {
          try { return fs.readFileSync(stateFile + '.log', 'utf8').trim().split('\n').map(function (l) { return JSON.parse(l); }); } catch (e) { return []; }
        }
      });
    });
  });
}

const WORLD = function () {
  return {
    projects: ['alpha', 'beta'], shown: 'beta', panels: ['terminal', 'git-diff', 'chat'], active: 'git-diff',
    agents: [{ agent: 'alpha', title: 'Uno', state: 'idle', machine: 'pc' }, { agent: 'alpha-wt', title: 'Due', state: 'question', machine: 'pc' },
      { agent: 'beta', title: 'Tre', state: 'working', machine: 'pc' }, { agent: 'beta', title: 'Altro PC', state: 'question', machine: 'laptop' }],
    tasks: { beta: [{ id: 't1', text: 'Aperta', status: 'open' }, { id: 't2', text: 'In corso', status: 'in_progress', assignee: { branch: 'feat/x' } },
      { id: 's1', parentId: 't2', text: 'Passo', status: 'done' }] }
  };
};

test('Viber: pannello attivo e pannelli aperti dal layout (nomi interni tradotti)', function () {
  const s = viber.summarize({
    layout: { leaves: [{ panels: ['terminal', 'git-diff', 'chat', 'browser:abc', 'todos'], activePanel: 'git-diff' }] },
    worktree: { path: '/home/io/Progetti/StreamDeck-web/' }
  });
  assert.strictEqual(s.active, 'git');
  assert.strictEqual(s.name, 'StreamDeck-web');
  assert.deepStrictEqual(s.open.sort(), ['browser', 'chat', 'git', 'tasks', 'terminal']);
  const empty = viber.summarize({});
  assert.strictEqual(empty.active, '');
  assert.deepStrictEqual(empty.open, []);
});

test('Viber: progetto mostrato e progetti aperti letti dagli errori degli strumenti MCP', function () {
  assert.strictEqual(viber.shownIn('Your worktree /a is open in Viber but not on screen (showing: /p/vibe deck). Skip.'), '/p/vibe deck');
  assert.deepStrictEqual(viber.openIn('No Viber window shows /x (open projects: /p/a, /p/b). Skip.'), ['/p/a', '/p/b']);
  assert.strictEqual(viber.shownIn('altro'), '');
});

test('Viber: progetto di una cartella (anche worktree accanto), vince il nome più lungo', function () {
  const list = ['C:/P/Naruto Android Game', 'C:/P/vibe', 'C:/P/vibe-deck'];
  assert.strictEqual(viber.projectOf('C:/P/Naruto Android Game-feature-start', list), list[0]);
  assert.strictEqual(viber.projectOf('C:/P/vibe-deck/', list), list[2]);
  assert.strictEqual(viber.projectOf('C:/P/vibe-deck/app', list), list[2]);
  assert.strictEqual(viber.projectOf('C:/Altro', list), null);
});

test('Viber: scorciatoie di Viber tradotte in tasti della dock', function () {
  const svc = viber.create({ platform: {}, keys: keys });
  assert.deepStrictEqual(svc.comboOf({ key: ']', ctrl: true, meta: false }), ['CTRL', 'RBRACKET']);
  assert.deepStrictEqual(svc.comboOf({ key: 'PageDown', ctrl: true }), ['CTRL', 'PAGEDOWN']);
  assert.deepStrictEqual(svc.comboOf({ key: '2', ctrl: true, alt: true }), ['CTRL', 'ALT', '2']);
  assert.strictEqual(svc.comboOf({ key: '§', ctrl: true }), null);
  assert.deepStrictEqual(viber.VIEWS, { tabs: '1', agents: '2', focus: '3' });
});

test('Viber: azioni non valide rifiutate prima di chiamare Viber', async function () {
  const svc = viber.create({ platform: {}, keys: keys });
  await assert.rejects(svc.focusPanel('impostazioni'), /Pannello non valido/);
  await assert.rejects(svc.view('barra'), /Vista non valida/);
  await assert.rejects(svc.action({ type: 'viber' }), /senza "panel"/);
  await assert.rejects(svc.action({ type: 'viber', layout: 'griglia' }), /Disposizione non valida/);
});

test('Viber chiuso: stato offline con un messaggio chiaro, senza avviare il server MCP', async function (t) {
  const prev = process.env.VIBER_MCP_ENDPOINT;
  process.env.VIBER_MCP_ENDPOINT = path.join(os.tmpdir(), 'nessun-viber-' + process.pid + '.json');
  t.after(function () { if (prev === undefined) delete process.env.VIBER_MCP_ENDPOINT; else process.env.VIBER_MCP_ENDPOINT = prev; });
  const st = await viber.create({ platform: {}, keys: keys }).state();
  assert.strictEqual(st.online, false);
  assert.match(st.message, /Viber non è aperto/);
});

test('Viber via MCP: trova la finestra in primo piano e ne legge lo stato', async function (t) {
  const f = await fakeViber(t, WORLD());
  const st = await f.svc.state();
  assert.strictEqual(st.online, true, st.message);
  assert.strictEqual(st.name, 'beta');
  assert.strictEqual(st.active, 'git');
  assert.deepStrictEqual(st.open.sort(), ['chat', 'git', 'terminal']);
  const ui = f.calls().filter(function (c) { return c.tool === 'viber_get_state'; });
  assert.deepStrictEqual(ui.map(function (c) { return path.basename(c.cwd); }), ['alpha', 'beta'], 'tries the first project, then the one on screen');
  await f.svc.state();
  assert.strictEqual(f.calls().filter(function (c) { return c.tool === 'viber_get_state'; }).length, 3, 'remembers the project on screen');
});

test('Viber via MCP: pannello chiuso in Viber diventa un errore leggibile', async function (t) {
  const f = await fakeViber(t, WORLD());
  await f.svc.state();
  await assert.rejects(f.svc.focusPanel('files'), /non è tra le schede aperte in Viber/);
  const st = await f.svc.focusPanel('chat');
  assert.strictEqual(st.online, true);
  const focus = f.calls().filter(function (c) { return c.tool === 'viber_focus_panel'; });
  assert.deepStrictEqual(focus.map(function (c) { return c.args.panel; }), ['files', 'chat']);
  assert.ok(focus.every(function (c) { return !c.agents && path.basename(c.cwd) === 'beta'; }), 'UI tools run in the project on screen');
});

test('Viber via MCP: progetti con lo stato più urgente dei loro agenti, solo di questo PC', async function (t) {
  const f = await fakeViber(t, WORLD());
  const r = await f.svc.projects();
  assert.deepStrictEqual(r.projects.map(function (p) { return [p.name, p.state, p.active, p.title]; }), [['alpha', 'question', false, 'Due'], ['beta', 'working', true, 'Tre']]);
  assert.ok(f.calls().filter(function (c) { return c.tool === 'viber_agent_list'; }).every(function (c) { return c.agents && c.args.machine === 'pc'; }));
});

test('Viber via MCP: task del progetto mostrato, in corso per prime, con i passi', async function (t) {
  const f = await fakeViber(t, WORLD());
  const r = await f.svc.tasks();
  assert.strictEqual(r.project, 'beta');
  assert.deepStrictEqual(r.tasks.map(function (x) { return [x.text, x.status, x.branch, x.steps.length]; }), [['In corso', 'in_progress', 'feat/x', 1], ['Aperta', 'open', '', 0]]);
});

test('Pagina VIBER: pulsanti personalizzabili a sinistra e widget a destra, "hidden" nascosti', function () {
  const config = require('../server/config');
  const raw = { pages: [{ id: 'viber', columns: 1, rows: 1, buttonGrid: true, tiles: [
    { widget: 'viber' },
    { id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C', hidden: true }
  ] }] };
  const p = config.normalizeDock(raw, {}, 'windows').pages[0];
  assert.strictEqual(p.editable, true);
  assert.strictEqual(p.buttonGrid, true);
  assert.strictEqual(p.columns + 'x' + p.rows, '1x1');
  assert.deepStrictEqual(p.tiles.map(function (x) { return x.widget || x.id; }), ['viber', 'a', 'b']);
  const q = config.normalizeDock(raw, { tiles: { viber: { show: ['c', 'b'], hide: ['a'] } } }, 'windows').pages[0];
  assert.deepStrictEqual(q.tiles.map(function (x) { return x.widget || x.id; }), ['viber', 'c', 'b']);
  assert.strictEqual(q.columns + 'x' + q.rows, '1x1');
  const r = config.normalizeDock({ pages: [{ id: 'x', tiles: [{ widget: 'clock' }, { id: 'a' }] }] }, {}, 'windows').pages[0];
  assert.strictEqual(r.editable, false);
});

test('plugin Viber: l\'azione "viber" resta un tipo semplice, le rotte sono sotto /api/plugins/viber', function () {
  const actions = require('../server/actions');
  assert.strictEqual(typeof actions.HANDLERS.viber, 'function');
  assert.ok(!actions.HANDLERS['viber.viber']);
});
