const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-twitch-'));
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.LOG_LEVEL = 'error';

const { FakeTwitch } = require('./fake-twitch');
const { Twitch, uptime } = require('../official-plugins/twitch/lib/twitch');
const { parseLine } = require('../official-plugins/twitch/lib/chat');
const secrets = require('../server/secrets');

let fake;
function client(file) { return new Twitch({ secrets: secrets, file: path.join(tmp, file) }); }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function until(fn, ms) {
  const end = Date.now() + (ms || 3000);
  while (Date.now() < end) { if (await fn()) return true; await wait(30); }
  throw new Error('timeout');
}
async function linked(file) {
  const t = client(file);
  await t.login('abcdefghij0123456789');
  fake.approved = true;
  await t.pollOnce();
  return t;
}

test.before(async function () {
  fake = await new FakeTwitch().listen();
  process.env.TWITCH_IRC = fake.url('ws');
  process.env.TWITCH_API = fake.url('api');
  process.env.TWITCH_ID = fake.url('id');
});
test.after(function () { fake.close(); });

test('IRC lines with tags, prefix and trailing text', function () {
  const m = parseLine('@badges=moderator/1,subscriber/12;color=#00FF7F;display-name=Pippo\\sX :pippo!pippo@pippo.tmi.twitch.tv PRIVMSG #canale :ciao a tutti : bello');
  assert.strictEqual(m.command, 'PRIVMSG');
  assert.strictEqual(m.tags['display-name'], 'Pippo X');
  assert.deepStrictEqual(m.params, ['#canale', 'ciao a tutti : bello']);
  assert.strictEqual(parseLine('PING :tmi.twitch.tv').params[0], 'tmi.twitch.tv');
  assert.strictEqual(uptime(new Date(Date.now() - 3780000).toISOString()), '1:03');
});

test('nothing set: the tablet is sent to the panel', async function () {
  const t = client('none.json');
  const s = await t.state();
  assert.strictEqual(s.status, 'setup');
  assert.strictEqual(s.canControl, false);
  await assert.rejects(t.marker(), /pannello/);
  t.stop();
});

test('chat of any channel without login: messages, colours, badges, notices, moderation', async function () {
  const t = client('anon.json');
  try {
    assert.throws(function () { t.setChannel('no spaces!'); }, /non valido/);
    t.setChannel('https://www.twitch.tv/SomeStreamer');
    assert.strictEqual(t.settings().channel, 'somestreamer');
    await until(function () { return t.chat.status === 'ready'; });
    assert.ok(fake.lines.some(function (l) { return /^NICK justinfan\d+$/.test(l); }), 'anonymous login');
    assert.ok(fake.lines.indexOf('JOIN #somestreamer') >= 0);
    fake.say('Pippo', 'ciao!', { badges: 'moderator/1' });
    fake.say('Pluto', '<b>non è html</b>');
    fake.sub('Paperino', 7);
    await until(function () { return t.chat.messages.length === 3; });
    const r = t.messages(0);
    assert.strictEqual(r.last, 3);
    assert.deepStrictEqual(r.messages.map(function (m) { return [m.kind, m.user, m.text]; }), [['chat', 'Pippo', 'ciao!'], ['chat', 'Pluto', '<b>non è html</b>'], ['notice', 'Paperino', 'Paperino si è abbonato da 7 mesi.']]);
    assert.deepStrictEqual(r.messages[0].badges, ['moderator']);
    assert.strictEqual(r.messages[0].color, '#FF7F50');
    assert.strictEqual(t.messages(2).messages.length, 1, 'only the new ones');
    const s = await t.state();
    assert.strictEqual(s.status, 'chat');
    assert.strictEqual(s.canControl, false);
    assert.strictEqual(s.canSend, false);
    const epoch = r.epoch;
    fake.send(':tmi.twitch.tv CLEARCHAT #somestreamer :pippo');
    await until(function () { return t.chat.messages.length === 2; });
    assert.notStrictEqual(t.messages(0).epoch, epoch, 'the tablet knows it must reload the chat');
    await assert.rejects(t.say('ciao'), /tuo canale/);
  } finally { t.stop(); }
});

test('Device Code login: the code for the panel, waiting, account saved encrypted', async function () {
  fake.approved = false;
  const t = client('login.json');
  try {
    await assert.rejects(t.login('not valid'), /Client ID/);
    const r = await t.login('abcdefghij0123456789');
    assert.deepStrictEqual(r, { code: 'ABCD1234', url: 'https://www.twitch.tv/activate?device-code=ABCD1234' });
    assert.strictEqual(t.panelInfo().pending.code, 'ABCD1234');
    await t.pollOnce();
    assert.ok(t.pending, 'still waiting for the confirmation');
    assert.strictEqual(t.pending.error, '');
    fake.approved = true;
    await t.pollOnce();
    assert.strictEqual(t.pending, null);
    const info = t.panelInfo();
    assert.strictEqual(info.status, 'ready');
    assert.deepStrictEqual(info.user, { login: 'stefano', name: 'Stefano', avatar: '' });
    assert.strictEqual(info.channel, 'stefano');
    const raw = fs.readFileSync(path.join(tmp, 'login.json'), 'utf8');
    assert.ok(!/tok\d|ref\d/.test(raw), 'tokens not in clear text');
    await until(function () { return t.chat.status === 'ready'; });
    assert.ok(fake.lines.some(function (l) { return /^PASS oauth:tok\d+$/.test(l); }) && fake.lines.indexOf('NICK stefano') >= 0, 'own channel: chat with the account');
    t.logout();
    assert.strictEqual(t.panelInfo().status, 'chat');
    assert.strictEqual(t.panelInfo().user, null);
  } finally { t.stop(); }
});

test('stream controls: live state, title, category, marker, clip, ads, chat modes, write in chat', async function () {
  const t = await linked('live.json');
  try {
    let s = await t.state();
    assert.strictEqual(s.status, 'ready');
    assert.strictEqual(s.canControl, true);
    assert.strictEqual(s.canSend, true);
    assert.deepStrictEqual(s.live, { active: true, viewers: 128, uptime: '1:03', title: 'Ranked fino a Diamante', game: 'League of Legends', gameId: '21779', followers: 1500 });
    assert.strictEqual((await t.marker()).message, 'Marker aggiunto');
    assert.strictEqual((await t.clip()).url, 'https://clips.twitch.tv/c1/edit');
    assert.strictEqual((await t.ad(60)).message, 'Pubblicità di 60 s avviata (la prossima tra 8 min)');
    await assert.rejects(t.ad(45), /non valida/);
    await assert.rejects(t.title(''), /140/);
    assert.strictEqual((await t.title('Nuovo titolo')).message, 'Titolo aggiornato');
    assert.deepStrictEqual(await t.searchCategories('just'), [{ id: '509658', name: 'Just Chatting' }]);
    assert.deepStrictEqual(await t.searchCategories('j'), [], 'at least 2 letters');
    await t.category('509658', 'Just Chatting');
    s = await t.state();
    assert.strictEqual(s.live.title, 'Nuovo titolo');
    assert.strictEqual(s.live.game, 'Just Chatting');
    await until(function () { return t.chat.status === 'ready'; });
    assert.strictEqual((await t.mode('emote')).on, true, 'toggles from the current Twitch setting');
    await t.mode('slow', true);
    await until(function () { return t.chat.modes().slow === 10; });
    assert.deepStrictEqual(t.chat.modes(), { slow: 10, emoteOnly: true, subsOnly: false, followersOnly: false });
    await t.mode('emote', false);
    assert.strictEqual(fake.chat.emote_mode, false);
    await assert.rejects(t.mode('nope'), /non valida/);
    const before = t.chat.seq;
    await t.say('ciao chat');
    await until(function () { return t.chat.seq > before; });
    const mine = t.messages(before).messages[0];
    assert.strictEqual(mine.text, 'ciao chat');
    assert.deepStrictEqual(mine.badges, ['broadcaster']);
    const marker = fake.calls.filter(function (c) { return c.path === '/helix/streams/markers'; })[0];
    assert.strictEqual(marker.client, 'abcdefghij0123456789');
  } finally { t.stop(); }
});

test('offline: no ads; expired token is refreshed once, then the panel asks to reconnect', async function () {
  const t = await linked('exp.json');
  try {
    fake.live = false;
    await assert.rejects(t.ad(30), /streaming live/);
    t.live.at = 0;
    assert.strictEqual((await t.state()).live.active, false);
    fake.expired = true;
    t.live.at = 0;
    const s = await t.state();
    assert.strictEqual(s.live.active, false, 'refreshed and retried');
    assert.ok(fake.calls.some(function (c) { return c.path === '/oauth2/token' && /grant_type=refresh_token/.test(c.body); }));
    fake.expired = true;
    const real = fake.http.bind(fake);
    fake.http = function (req, res) {
      if (req.url.indexOf('/oauth2/token') === 0) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"message":"Invalid refresh token"}'); return; }
      real(req, res);
    };
    fake.server.removeAllListeners('request');
    fake.server.on('request', function (req, res) { fake.http(req, res); });
    await assert.rejects(t.marker(), /ricollega Twitch/);
    assert.strictEqual(t.panelInfo().status, 'chat', 'account forgotten, chat still works');
    assert.strictEqual(t.panelInfo().user, null);
    await until(function () { return t.chat.status === 'ready' && !t.chat.auth; });
  } finally {
    fake.live = true; fake.expired = false;
    t.stop();
  }
});
