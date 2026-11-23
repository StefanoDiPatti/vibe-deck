const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-mail-'));
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.DOCK_THUNDERBIRD_DIR = path.join(tmp, 'Thunderbird');
process.env.LOG_LEVEL = 'error';
fs.mkdirSync(process.env.DOCK_DATA_DIR, { recursive: true });

const tb = require('../server/services/thunderbird');
const mail = require('../server/services/mail');

const ROOT = process.env.DOCK_THUNDERBIRD_DIR;
const PROFILE = path.join(ROOT, 'Profiles', 'abcd.default-release');
const IMAP = path.join(PROFILE, 'ImapMail', 'imap.gmail.com');
const POP = path.join(PROFILE, 'Mail', 'pop.libero.it');

function msg(headers, body) {
  return 'From - Mon Nov 02 10:00:00 2026\r\n' + headers.join('\r\n') + '\r\n\r\n' + body + '\r\n\r\n';
}
const M1 = msg(['X-Mozilla-Status: 0001', 'From: Mario Rossi <mario@example.com>', 'To: io@gmail.com', 'Subject: =?UTF-8?Q?Ciao_=C3=A8_pronto?=',
  'Date: Mon, 2 Nov 2026 10:00:00 +0000', 'Content-Type: text/plain; charset=utf-8'], 'Prima riga\r\n>From casa\r\nSeconda riga');
const M2 = msg(['X-Mozilla-Status: 0000', 'From: GitHub <noreply@github.com>', 'To: io@gmail.com', 'Subject: CI fallita',
  'Date: Tue, 3 Nov 2026 10:00:00 +0000', 'Content-Type: text/html; charset=utf-8'], '<p>La build <b>main</b> &amp; test</p><br>falliti');
const M3 = msg(['X-Mozilla-Status: 0008', 'From: x@example.com', 'Subject: cancellato', 'Date: Wed, 4 Nov 2026 10:00:00 +0000'], 'via');
const OFF2 = Buffer.byteLength(M1), OFF3 = OFF2 + Buffer.byteLength(M2);

function hexSec(s) { return Math.floor(Date.parse(s) / 1000).toString(16).toUpperCase(); }

const MSF = [
  '// <!-- <mdb:mork:z v="1.4"/> -->',
  '< <(a=c)> // (f=iso-8859-1)',
  '  (80=ns:msg:db:row:scope:dbfolderinfo:all)(81=subject)(82=sender)',
  '  (83=message-id)(86=date)(88=flags)(99=msgOffset)(9A=offlineMsgSize)',
  '  (9B=ns:msg:db:row:scope:msgs:all)(9C=ns:msg:db:table:kind:msgs)',
  '  (9D=storeToken)(BF=ns:msg:db:table:kind:dbfolderinfo)>',
  '<(A1=CI fallita)(A2=GitHub <noreply@github.com>)>',
  '{1:^80 {(k^BF:c)(s=9u)} [1:^80(^81=info)]}',
  '{1:^9B {(k^9C:c)(s=9u)}',
  '  [5(^83=a@x)(^86=' + hexSec('2026-11-02T10:00:00Z') + ')(^88=81)(^81=Ciao $C3$A8 pronto)',
  '    (^82=Mario Rossi <mario@example.com>)(^99=0)(^9D=0)(^9A=' + Buffer.byteLength(M1).toString(16) + ')]',
  '  [6(^83=b@x)(^86=' + hexSec('2026-11-03T10:00:00Z') + ')(^88=80)(^81^A1)(^82^A2)(^9D=' + OFF2 + ')]',
  '  [7(^83=c@x)(^86=' + hexSec('2026-11-04T10:00:00Z') + ')(^88=80)(^81=cancellato \\) ok)(^82=x@example.com)(^9D=' + OFF3 + ')]}',
  '@$${1{@{1:^9B [7(^88=88)] [5(^88=85)]}@$$}1}@',
  '@$${2{@{1:^9B [6(^88=81)]}@$$}~abort~2}@',
  ''
].join('\n');

function write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }

test.before(function () {
  write(path.join(ROOT, 'profiles.ini'), '[Profile0]\r\nName=default-release\r\nIsRelative=1\r\nPath=Profiles/abcd.default-release\r\nDefault=1\r\n\r\n[General]\r\nStartWithLastProfile=1\r\n');
  write(path.join(PROFILE, 'prefs.js'), [
    '// Mozilla User Preferences',
    'user_pref("mail.accountmanager.accounts", "account1,account2,account3");',
    'user_pref("mail.account.account1.identities", "id1");',
    'user_pref("mail.account.account1.server", "server1");',
    'user_pref("mail.account.account2.server", "server2");',
    'user_pref("mail.account.account3.identities", "id3");',
    'user_pref("mail.account.account3.server", "server3");',
    'user_pref("mail.identity.id1.useremail", "io@gmail.com");',
    'user_pref("mail.identity.id3.useremail", "io@libero.it");',
    'user_pref("mail.server.server1.directory-rel", "[ProfD]ImapMail/imap.gmail.com");',
    'user_pref("mail.server.server1.hostname", "imap.gmail.com");',
    'user_pref("mail.server.server1.name", "io@gmail.com");',
    'user_pref("mail.server.server1.type", "imap");',
    'user_pref("mail.server.server2.type", "none");',
    'user_pref("mail.server.server2.name", "Cartelle locali");',
    'user_pref("mail.server.server3.directory-rel", "[ProfD]Mail/pop.libero.it");',
    'user_pref("mail.server.server3.hostname", "pop.libero.it");',
    'user_pref("mail.server.server3.name", "Libero");',
    'user_pref("mail.server.server3.type", "pop3");',
    ''
  ].join('\n'));
  write(path.join(IMAP, 'INBOX'), M1 + M2 + M3);
  write(path.join(IMAP, 'INBOX.msf'), MSF);
  write(path.join(POP, 'Inbox'), M1 + M2 + M3);
  mail._reset();
});

test('profilo e account: solo IMAP e POP, con indirizzo e cartella', function () {
  const p = tb.findProfile();
  assert.strictEqual(p.dir, PROFILE);
  const acc = tb.accounts(p.dir);
  assert.deepStrictEqual(acc.map(function (a) { return a.key; }), ['server1', 'server3']);
  assert.strictEqual(acc[0].email, 'io@gmail.com');
  assert.strictEqual(acc[0].dir, IMAP);
  assert.strictEqual(tb.inboxPath(acc[1]), path.join(POP, 'Inbox'));
});

test('Mork: valori con $XX e \\), riferimenti, gruppi confermati e annullati', function () {
  const list = tb.messagesFromMork(tb.parseMork(MSF));
  const by = {};
  list.forEach(function (m) { by[m.key] = m; });
  assert.deepStrictEqual(Object.keys(by).sort(), ['5', '6']);
  assert.strictEqual(by['5'].subject, 'Ciao è pronto');
  assert.strictEqual(by['5'].seen, true);
  assert.strictEqual(by['5'].flagged, true);
  assert.strictEqual(by['6'].seen, false);
  assert.strictEqual(by['6'].subject, 'CI fallita');
  assert.deepStrictEqual(by['6'].from, { name: 'GitHub', address: 'noreply@github.com' });
  assert.strictEqual(by['6'].date.toISOString(), '2026-11-03T10:00:00.000Z');
  assert.strictEqual(by['6'].token, String(OFF2));
});

test('elenco per il tablet: più recenti prima, non lette e totale', async function () {
  const st = mail.state();
  assert.deepStrictEqual(st.accounts.map(function (a) { return a.id; }), ['server1', 'server3']);
  const l = await mail.list('server1');
  assert.strictEqual(l.total, 2);
  assert.strictEqual(l.unread, 1);
  assert.strictEqual(l.messages[0].subject, 'CI fallita');
  assert.strictEqual(l.messages[0].seen, false);
  assert.strictEqual(l.messages[1].from.name, 'Mario Rossi');
});

test('messaggio: testo dal mbox alla posizione indicata, HTML convertito', async function () {
  const m1 = await mail.message('server1', '5');
  assert.strictEqual(m1.subject, 'Ciao è pronto');
  assert.strictEqual(m1.text, 'Prima riga\nFrom casa\nSeconda riga');
  const m2 = await mail.message('server1', '6');
  assert.match(m2.text, /La build main & test\s+falliti/);
  await assert.rejects(mail.message('server1', '99'), /non trovato/);
  await assert.rejects(mail.message('server1', '../x'), /non valido/);
});

test('senza .msf: elenco letto dal mbox, cancellati esclusi', async function () {
  const l = await mail.list('server3');
  assert.strictEqual(l.total, 2);
  assert.strictEqual(l.unread, 1);
  assert.strictEqual(l.messages[0].subject, 'CI fallita');
  const m = await mail.message('server3', l.messages[1].uid);
  assert.strictEqual(m.subject, 'Ciao è pronto');
});

test('pannello: account nascosti non arrivano al tablet, file vecchi ripuliti', async function () {
  fs.writeFileSync(path.join(process.env.DOCK_DATA_DIR, 'mail.json'), JSON.stringify({ accounts: [{ id: 'x', pass: 'segreta' }] }));
  mail._reset();
  await mail.check();
  const info = mail.panelInfo();
  assert.strictEqual(info.source, 'thunderbird');
  assert.strictEqual(info.profile, true);
  assert.strictEqual(info.accounts.length, 2);
  assert.strictEqual(info.accounts[0].unread, 1);
  mail.setShown('server3', false);
  assert.deepStrictEqual(mail.state().accounts.map(function (a) { return a.id; }), ['server1']);
  assert.ok(!/segreta/.test(fs.readFileSync(path.join(process.env.DOCK_DATA_DIR, 'mail.json'), 'utf8')));
  mail.setShown('server3', true);
  assert.strictEqual(mail.state().accounts.length, 2);
  assert.throws(function () { mail.setShown('server9', true); }, /non trovato/);
});

test('Mork come lo scrive Thunderbird: a capo tra id e valore, flag come riferimento, righe fuori tabella', function () {
  const text = [
    '// <!-- <mdb:mork:z v="1.4"/> -->',
    '< <(a=c)> (81=subject)(82=sender)(86=date)(88=flags)(9D=storeToken)(80=ns:msg:db:row:scope:msgs:all)(96=ns:msg:db:table:kind:msgs)>',
    '<(98E1=Mario <m@x.it>)(98E3=81)(98E5',
    '    =Avviso di sicurezza)>',
    '{1:^80 {(k^96:c)(s=9u)}',
    '  [-2511(^88^98E3)(^82^98E1)(^81^98E5)(^86=6aff381f)(^9D=10)]}',
    '[2512:^80(^88=0)(^81',
    '    =Seconda)(^86=6aff3820)(^9D=20)]',
    '{1:^80 2512 }',
    ''
  ].join('\r\n');
  const list = tb.messagesFromMork(tb.parseMork(text));
  const by = {};
  list.forEach(function (m) { by[m.key] = m; });
  assert.strictEqual(by['2511'].subject, 'Avviso di sicurezza');
  assert.strictEqual(by['2511'].seen, true);
  assert.strictEqual(by['2511'].from.name, 'Mario');
  assert.strictEqual(by['2512'].subject, 'Seconda');
  assert.strictEqual(by['2512'].seen, false);
});

test('htmlToText: tag tolti, entità e a capo', function () {
  assert.strictEqual(mail.htmlToText('<style>x{}</style><p>Ciao&nbsp;<b>a</b></p><br>b &amp; c'), 'Ciao a\n\nb & c');
});
