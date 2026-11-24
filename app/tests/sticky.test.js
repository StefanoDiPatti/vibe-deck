const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sticky = require('../official-plugins/todo/lib/sticky');

const P = sticky._parse;
const NOTE = '113b8a75-7487-40b2-8e7b-c0458428426d';
const L = ['6c47cbdc-c83d-4c7d-bdb3-5765f69614e8', '6b457fe8-d163-4215-b96e-e65346b3b3a1', '9ca8dafb-537b-405f-8882-e3c1fc0515dc'];
const TEXT = '\\id=' + L[0] + '\\b\\i PROGETTI\\b0\\i0 \n' +
  '\\id=' + L[1] + ' - \\b\\ul StreamDeck\\b0\\ul0 :  Integrazione "Viber".\n' +
  '\\id=' + L[2] + ' \\strike - Apple Music: playlist\\strike0';

let sqlite = null;
try { sqlite = require('node:sqlite'); } catch (e) { sqlite = null; }

test('righe: titolo in grassetto, etichetta, barrato = fatto', function () {
  const n = P.describeNote({ Id: NOTE, Text: TEXT, u: '1' });
  assert.strictEqual(n.title, 'PROGETTI');
  assert.strictEqual(n.items.length, 2);
  assert.strictEqual(n.items[0].text, 'StreamDeck: Integrazione "Viber".');
  assert.strictEqual(n.items[0].label, 'StreamDeck');
  assert.strictEqual(n.items[0].done, false);
  assert.strictEqual(n.items[1].text, 'Apple Music: playlist');
  assert.strictEqual(n.items[1].done, true);
  assert.strictEqual(n.items[1].id, NOTE + ':' + L[2]);
});

test('una memo di una sola riga non perde la riga come titolo', function () {
  const n = P.describeNote({ Id: NOTE, Text: '\\id=' + L[0] + ' \\b solo\\b0', u: '1' });
  assert.strictEqual(n.title, '');
  assert.strictEqual(n.items.length, 1);
});

test('[x] conta come fatto, backslash letterale conservato', function () {
  assert.strictEqual(P.describeLine('[x] comprare latte').done, true);
  assert.strictEqual(P.describeLine('[ ] comprare latte').done, false);
  assert.strictEqual(P.describeLine('C:\\\\temp').text, 'C:\\temp');
});

test('aggiunta, spunta, rimozione su database finto', { skip: !sqlite && 'node:sqlite non disponibile' }, async function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-memo-'));
  const file = path.join(dir, 'plum.sqlite');
  const db = new sqlite.DatabaseSync(file);
  db.exec('create table Note (Text varchar, IsFutureNote integer, Id varchar primary key not null, ParentId varchar, CreatedAt bigint, DeletedAt bigint, UpdatedAt bigint)');
  db.exec('create table SyncState (OutboundQueueJson varchar, Id varchar primary key not null)');
  db.prepare('insert into Note (Text, IsFutureNote, Id, UpdatedAt) values (?, 0, ?, 1)').run(TEXT, NOTE);
  db.prepare("insert into SyncState values ('[]', '00000000-0000-0000-0000-000000000000')").run();
  db.close();
  sticky._useTestDb(file);
  try {
    assert.ok(sticky.available());
    assert.strictEqual(sticky.list().length, 2);

    const added = await sticky.add('nuova\\cosa\ndettata');
    assert.strictEqual(added.text, 'nuova/cosa dettata');
    let items = sticky.list();
    assert.strictEqual(items.length, 3);
    assert.strictEqual(items[2].text, 'nuova/cosa dettata');

    await sticky.toggle(items[2].id);
    assert.strictEqual(sticky.list()[2].done, true);
    await sticky.toggle(items[2].id);
    assert.strictEqual(sticky.list()[2].done, false);

    assert.strictEqual(await sticky.clearDone(), 1);
    items = sticky.list();
    assert.strictEqual(items.length, 2);
    await sticky.remove(items[1].id);
    assert.strictEqual(sticky.list().length, 1);

    const check = new sqlite.DatabaseSync(file, { readOnly: true });
    const row = check.prepare('select Text from Note where Id = ?').get(NOTE);
    const q = JSON.parse(check.prepare('select OutboundQueueJson as q from SyncState').get().q);
    check.close();
    assert.ok(row.Text.indexOf(TEXT.split('\n')[0] + '\n') === 0);
    assert.ok(row.Text.indexOf('\\b\\ul StreamDeck\\b0\\ul0') > 0);
    assert.deepStrictEqual(q, [{ type: 'update', localNoteId: NOTE }]);
  } finally {
    sticky._useTestDb(null);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { }
  }
});
