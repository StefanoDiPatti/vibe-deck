'use strict';
const test = require('node:test');
const assert = require('node:assert');
const viber = require('../server/services/viber');

test('Viber: pannello attivo e pannelli aperti dal layout (nomi interni tradotti)', function () {
  const s = viber._summarize({
    layout: { leaves: [{ panels: ['terminal', 'git-diff', 'chat', 'browser:abc', 'todos'], activePanel: 'git-diff' }] },
    worktree: { path: '/home/io/Progetti/StreamDeck-web/' }
  });
  assert.strictEqual(s.active, 'git');
  assert.strictEqual(s.name, 'StreamDeck-web');
  assert.deepStrictEqual(s.open.sort(), ['browser', 'chat', 'git', 'tasks', 'terminal']);
});

test('Viber: senza layout niente pannello attivo', function () {
  const s = viber._summarize({});
  assert.strictEqual(s.active, '');
  assert.deepStrictEqual(s.open, []);
});

test('Viber: pannello non valido rifiutato prima di chiamare Viber', async function () {
  await assert.rejects(viber.focusPanel('impostazioni'), /Pannello non valido/);
});

function fakeViber(t, handler) {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const http = require('http');
  const server = http.createServer(function (req, res) {
    let b = '';
    req.on('data', function (c) { b += c; });
    req.on('end', function () { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(handler(req.url, b ? JSON.parse(b) : null))); });
  });
  return new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', function () {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'viber-'));
      const file = path.join(dir, 'browser-mcp.json');
      fs.writeFileSync(file, JSON.stringify({ port: server.address().port, token: 'x' }));
      const prev = process.env.VIBER_MCP_ENDPOINT;
      process.env.VIBER_MCP_ENDPOINT = file;
      t.after(function () {
        if (prev === undefined) delete process.env.VIBER_MCP_ENDPOINT; else process.env.VIBER_MCP_ENDPOINT = prev;
        server.close();
        fs.rmSync(dir, { recursive: true, force: true });
      });
      resolve();
    });
  });
}

test('Viber: errore dentro una risposta 200 diventa un errore leggibile', async function (t) {
  await fakeViber(t, function (url) {
    if (url === '/viber/focus-panel') return { error: 'Panel files is not open in this layout (it may be turned off for this project)' };
    return { layout: { leaves: [{ panels: ['terminal', 'chat'], activePanel: 'chat' }] }, worktree: { path: '/p/vibe-deck' } };
  });
  await assert.rejects(viber.focusPanel('files'), /non è tra le schede aperte in Viber/);
  const st = await viber.state();
  assert.strictEqual(st.online, true);
  assert.deepStrictEqual(st.open.sort(), ['chat', 'terminal']);
});

test('Viber: vista non valida rifiutata, viste con le scorciatoie Ctrl+Alt+1/2/3', async function () {
  await assert.rejects(viber.view('barra'), /Vista non valida/);
  assert.deepStrictEqual(viber.VIEWS, { tabs: '1', agents: '2', focus: '3' });
});

test('Viber: scorciatoie di Viber tradotte in tasti della dock', function () {
  assert.deepStrictEqual(viber._comboOf({ key: ']', ctrl: true, meta: false }), ['CTRL', 'RBRACKET']);
  assert.deepStrictEqual(viber._comboOf({ key: 'PageDown', ctrl: true }), ['CTRL', 'PAGEDOWN']);
  assert.deepStrictEqual(viber._comboOf({ key: '2', ctrl: true, alt: true }), ['CTRL', 'ALT', '2']);
  assert.strictEqual(viber._comboOf({ key: '§', ctrl: true }), null);
});

test('Viber: progetto di una cartella (anche worktree accanto), vince il nome più lungo', function () {
  const list = ['C:/P/Naruto Android Game', 'C:/P/vibe', 'C:/P/vibe-deck'];
  assert.strictEqual(viber._projectOf('C:/P/Naruto Android Game-feature-start', list), list[0]);
  assert.strictEqual(viber._projectOf('C:/P/vibe-deck/', list), list[2]);
  assert.strictEqual(viber._projectOf('C:/Altro', list), null);
});

test('Viber: progetti con lo stato più urgente dei loro agenti', async function (t) {
  await fakeViber(t, function (url) {
    if (url === '/agents/projects') return { projects: ['/p/a', '/p/b'] };
    if (url === '/agents/list') return [{ agent: '/p/a', title: 'Uno', state: 'idle' }, { agent: '/p/a-wt', title: 'Due', state: 'question' }, { agent: '/p/b', title: 'Tre', state: 'working' }];
    return { layout: { leaves: [] }, worktree: { path: '/p/b' } };
  });
  const r = await viber.projects();
  assert.deepStrictEqual(r.projects.map(function (p) { return [p.name, p.state, p.active, p.title]; }), [['a', 'question', false, 'Due'], ['b', 'working', true, 'Tre']]);
});

test('Viber: azione di un pulsante senza campi validi rifiutata', async function () {
  await assert.rejects(viber.action({ type: 'viber' }), /senza "panel"/);
  await assert.rejects(viber.action({ type: 'viber', layout: 'griglia' }), /Disposizione non valida/);
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
