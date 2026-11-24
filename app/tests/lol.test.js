const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-lol-'));
let hits = {};
let online = true;
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHAMPS = {
  data: {
    Ahri: { id: 'Ahri', name: 'Ahri', title: 'la volpe a nove code', tags: ['Mage'] },
    MonkeyKing: { id: 'MonkeyKing', name: 'Wukong', title: 'il re scimmia', tags: ['Fighter'] },
    Akali: { id: 'Akali', name: 'Akali', title: 'l\'assassina ribelle', tags: ['Assassin'] }
  }
};
const DETAIL = {
  data: {
    Ahri: {
      blurb: 'Una <b>volpe</b>.', passive: { name: 'Furto di essenza', description: 'Cura <br>Ahri.', image: { full: 'Ahri_P.png' } },
      spells: ['Q', 'W', 'E', 'R'].map(function (k) { return { name: 'Colpo ' + k, description: 'Danno {{ e1 }} magico.', image: { full: 'Ahri' + k + '.png' }, cooldownBurn: '7' }; })
    }
  }
};
const server = http.createServer(function (req, res) {
  hits[req.url] = (hits[req.url] || 0) + 1;
  if (!online) { res.statusCode = 503; res.end(); return; }
  if (req.url === '/api/versions.json') return res.end(JSON.stringify(['16.23.1', '16.22.1']));
  if (req.url === '/cdn/16.23.1/data/it_IT/champion.json') return res.end(JSON.stringify(CHAMPS));
  if (req.url === '/cdn/16.23.1/data/it_IT/champion/Ahri.json') return res.end(JSON.stringify(DETAIL));
  if (req.url === '/meraki.json') return res.end(JSON.stringify({ Ahri: { positions: ['MIDDLE'] }, MonkeyKing: { positions: ['JUNGLE', 'TOP'] }, Akali: { positions: ['MIDDLE', 'TOP', 'UTILITY'] } }));
  if (/^\/cdn\/16\.23\.1\/img\/(champion|spell|passive)\/[A-Za-z_]+\.png$/.test(req.url)) return res.end(PNG);
  res.statusCode = 404;
  res.end();
});
const ready = new Promise(function (r) {
  server.listen(0, '127.0.0.1', function () {
    process.env.LOL_DDRAGON = 'http://127.0.0.1:' + server.address().port;
    process.env.LOL_MERAKI = 'http://127.0.0.1:' + server.address().port + '/meraki.json';
    r();
  });
});
test.after(function () { server.close(); });

function lib() { return require('../official-plugins/lol/lib/data'); }

test('champions: Italian names sorted, roles from Meraki, cached on disk', async function () {
  await ready;
  const { LolData } = lib();
  const d = new LolData(path.join(tmp, 'a'));
  const list = await d.champions();
  assert.strictEqual(list.version, '16.23.1');
  assert.deepStrictEqual(list.champions.map(function (c) { return c.name; }), ['Ahri', 'Akali', 'Wukong']);
  assert.deepStrictEqual(list.champions.filter(function (c) { return c.id === 'MonkeyKing'; })[0].roles, ['jungle', 'top']);
  assert.deepStrictEqual(list.champions.filter(function (c) { return c.id === 'Akali'; })[0].roles, ['mid', 'top'], 'unknown positions are dropped');
  assert.ok(fs.existsSync(path.join(tmp, 'a', 'champions.json')));
  assert.ok(fs.existsSync(path.join(tmp, 'a', 'roles.json')));
  await d.champions();
  assert.strictEqual(hits['/cdn/16.23.1/data/it_IT/champion.json'], 1, 'one download per version');
});

test('champion detail: passive and Q W E R without HTML, builds per role on u.gg', async function () {
  const { LolData } = lib();
  const d = new LolData(path.join(tmp, 'a'));
  const c = await d.champion('Ahri');
  assert.deepStrictEqual(c.abilities.map(function (a) { return a.key; }), ['P', 'Q', 'W', 'E', 'R']);
  assert.strictEqual(c.abilities[0].text, 'Cura Ahri.');
  assert.strictEqual(c.abilities[1].text, 'Danno … magico.');
  assert.strictEqual(c.abilities[1].image, 'spell/AhriQ.png');
  assert.strictEqual(c.lore, 'Una volpe.');
  assert.deepStrictEqual(c.builds, [{ role: 'mid', url: 'https://u.gg/lol/champions/ahri/build?role=mid' }]);
  await assert.rejects(d.champion('../x'), function (e) { return e.code === 'BAD_REQUEST'; });
  await assert.rejects(d.champion('Nessuno'), function (e) { return e.code === 'NOT_FOUND'; });
});

test('u.gg links: Wukong and roles', function () {
  const { uggUrl, stripHtml } = lib();
  assert.strictEqual(uggUrl('MonkeyKing', 'jungle'), 'https://u.gg/lol/champions/wukong/build?role=jungle');
  assert.strictEqual(uggUrl('KSante', ''), 'https://u.gg/lol/champions/ksante/build');
  assert.strictEqual(uggUrl('Ahri', 'bot'), 'https://u.gg/lol/champions/ahri/build', 'unknown roles are left out');
  assert.strictEqual(stripHtml('a<br/>b <i>c</i>'), 'a b c');
});

test('images: only champion, spell and passive pngs, cached after the first download', async function () {
  const { LolData } = lib();
  const d = new LolData(path.join(tmp, 'a'));
  const buf = await d.image('champion', 'Ahri.png');
  assert.deepStrictEqual(buf, PNG);
  await d.image('champion', 'Ahri.png');
  assert.strictEqual(hits['/cdn/16.23.1/img/champion/Ahri.png'], 1);
  await assert.rejects(d.image('profileicon', 'x.png'), function (e) { return e.code === 'BAD_REQUEST'; });
  await assert.rejects(d.image('champion', '../../secret.png'), function (e) { return e.code === 'BAD_REQUEST'; });
});

test('offline: the cached list is used', async function () {
  const { LolData } = lib();
  online = false;
  const d = new LolData(path.join(tmp, 'a'));
  const list = await d.champions();
  assert.strictEqual(list.champions.length, 3);
  await assert.rejects(new LolData(path.join(tmp, 'vuota')).champions(), /non risponde|raggiungibili/);
  online = true;
});
