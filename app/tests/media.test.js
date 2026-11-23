const test = require('node:test');
const assert = require('node:assert');
const media = require('../server/services/media');
const bridge = require('../server/services/bridge');
const claudecode = require('../server/services/claudecode');

const M = media._internals;

test('le app non musicali vengono escluse, quelle musicali accettate', function () {
  const s = M.settings();
  assert.ok(M.matchAny(s.block, 'com.riotgames.RiotGames.RiotClient'), 'Riot deve essere bloccato');
  assert.ok(!M.matchAny(s.block, 'Spotify.exe'));
  assert.ok(M.matchAny(s.allow, 'Spotify.exe'));
  assert.ok(M.matchAny(s.allow, 'AppleInc.AppleMusicWin_nzyj5cx40ttqa!App'));
  assert.ok(!M.matchAny(s.allow, 'com.riotgames.RiotGames.RiotClient'));
});

test('cambio brano con timeline vecchia: la posizione riparte da zero', function () {
  const t0 = 1000000;
  const id = 'test-app-1';
  let e = M.estimate({ id: id, title: 'A', artist: 'X', album: '', status: 'playing', position: 30, duration: 200, updatedAt: t0 }, t0);
  assert.strictEqual(Math.round(e.position), 30);
  assert.strictEqual(e.duration, 200);
  const t1 = t0 + 600000;
  e = M.estimate({ id: id, title: 'B', artist: 'X', album: '', status: 'playing', position: 30, duration: 200, updatedAt: t0 }, t1);
  assert.strictEqual(Math.round(e.position), 0, 'non deve partire dal minuto 10');
  assert.strictEqual(e.duration, 0, 'durata sconosciuta finché l\'app non la comunica');
  e = M.estimate({ id: id, title: 'B', artist: 'X', album: '', status: 'playing', position: 30, duration: 200, updatedAt: t0 }, t1 + 5000);
  assert.strictEqual(Math.round(e.position), 5);
  e = M.estimate({ id: id, title: 'B', artist: 'X', album: '', status: 'playing', position: 6, duration: 180, updatedAt: t1 + 6000 }, t1 + 6000);
  assert.strictEqual(Math.round(e.position), 6);
  assert.strictEqual(e.duration, 180);
});

test('in pausa la posizione non avanza', function () {
  const t0 = 2000000;
  const id = 'test-app-2';
  M.estimate({ id: id, title: 'A', artist: '', album: '', status: 'playing', position: 10, duration: 100, updatedAt: t0 }, t0);
  let e = M.estimate({ id: id, title: 'A', artist: '', album: '', status: 'paused', position: 10, duration: 100, updatedAt: t0 }, t0 + 4000);
  assert.strictEqual(Math.round(e.position), 14);
  e = M.estimate({ id: id, title: 'A', artist: '', album: '', status: 'paused', position: 10, duration: 100, updatedAt: t0 }, t0 + 60000);
  assert.strictEqual(Math.round(e.position), 14);
});

test('scelta della sorgente: chi suona vince, poi resta quella scelta', function () {
  const a = { id: 'a', kind: 'system', status: 'paused', since: 1 };
  const b = { id: 'b', kind: 'bridge', status: 'playing', since: 2 };
  assert.strictEqual(M.pick([a, b]).id, 'b');
  b.status = 'paused';
  assert.strictEqual(M.pick([a, b]).id, 'b', 'resta su b anche in pausa');
  a.status = 'playing';
  assert.strictEqual(M.pick([a, b]).id, 'a');
});

test('bridge: stato ripulito e comandi consegnati una volta', function () {
  bridge._reset();
  let cmds = bridge.update('1:0', { site: 'apple', title: 'Song', artist: 'Art', duration: '200', position: 5, playing: true, volume: 7, artwork: 'javascript:alert(1)', queue: [{ title: 'Q', index: 3 }] });
  assert.deepStrictEqual(cmds, []);
  const p = bridge.players()[0];
  assert.strictEqual(p.state.duration, 200);
  assert.strictEqual(p.state.volume, 1, 'volume limitato a 0..1');
  assert.strictEqual(p.state.artwork, '', 'solo URL https');
  assert.strictEqual(p.state.queue[0].index, 3);
  bridge.send('1:0', { type: 'next' });
  cmds = bridge.update('1:0', { site: 'apple', title: 'Song', playing: true });
  assert.deepStrictEqual(cmds, [{ type: 'next' }]);
  assert.deepStrictEqual(bridge.update('1:0', { site: 'apple', title: 'Song', playing: true }), []);
  bridge.update('1:0', null);
  assert.strictEqual(bridge.players().length, 0);
});

test('Claude Code: promemoria di sistema e risultati degli strumenti non vengono mostrati', function () {
  const T = claudecode._internals;
  assert.strictEqual(T.messageText({ type: 'user', message: { content: '<system-reminder>segreto</system-reminder>Ciao' } }), 'Ciao');
  assert.strictEqual(T.messageText({ type: 'user', message: { content: [{ type: 'tool_result', content: 'x' }] } }), null);
  assert.strictEqual(T.messageText({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Fatto' }, { type: 'tool_use', name: 'Bash' }] } }), 'Fatto\n[ Bash ]');
});

test('app con apri/chiudi: processo ricavato dal percorso o dalla config', function () {
  const apps = require('../server/services/apps').trackedApps();
  if (process.platform === 'win32') {
    assert.deepStrictEqual(apps.vscode.processes, ['code']);
    assert.deepStrictEqual(apps.discord.processes, ['discord']);
    assert.strictEqual(apps.apple_music.bridge, 'apple');
  }
  assert.ok(!apps.powershell, 'PowerShell non va chiuso dal tablet');
  assert.ok(!apps.files, 'Esplora file non va chiuso dal tablet');
});
