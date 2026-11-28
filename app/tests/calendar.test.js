const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ics = require('../official-plugins/calendar/lib/ics');
const calendar = require('../official-plugins/calendar/lib/calendar');

const FILE = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'SUMMARY:Riunione\\, team',
  'DTSTART:20261130T090000',
  'DTEND:20261130T100000',
  'LOCATION:Sala 3',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:Yoga',
  'DTSTART:20261123T180000',
  'DTEND:20261123T190000',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,TH',
  'EXDATE:20261203T180000',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:Compleanno',
  'DTSTART;VALUE=DATE:20261129',
  'RRULE:FREQ=YEARLY',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:Annullato',
  'DTSTART:20261201T100000',
  'STATUS:CANCELLED',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:Lungo titolo che va ',
  ' a capo',
  'DTSTART:20261201T203000Z',
  'DURATION:PT1H30M',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:Tre volte',
  'DTSTART:20261128T080000',
  'DTEND:20261128T083000',
  'RRULE:FREQ=DAILY;COUNT=3',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n');

const NOW = new Date(2026, 10, 28, 7, 0, 0).getTime();

test('parse: testo con virgola, righe spezzate, annullati scartati, durata', function () {
  const ev = ics.parse(FILE);
  assert.strictEqual(ev.length, 5);
  assert.strictEqual(ev[0].title, 'Riunione, team');
  assert.strictEqual(ev[0].location, 'Sala 3');
  assert.strictEqual(ev[3].title, 'Lungo titolo che va a capo');
  assert.strictEqual(ev[3].span, 90 * 60000);
  assert.strictEqual(ev[2].allDay, true);
});

test('ricorrenze: settimanale con giorni e EXDATE, COUNT, annuale', function () {
  const ev = ics.parse(FILE);
  const from = new Date(2026, 10, 28).getTime(), to = new Date(2026, 11, 11).getTime();
  const out = ics.expand(ev, from, to);
  const yoga = out.filter(function (o) { return o.title === 'Yoga'; }).map(function (o) { return new Date(o.start).getDate(); });
  assert.deepStrictEqual(yoga, [30, 7, 10]);
  assert.strictEqual(out.filter(function (o) { return o.title === 'Tre volte'; }).length, 3);
  assert.strictEqual(out.filter(function (o) { return o.title === 'Compleanno'; }).length, 1);
  assert.ok(out.every(function (o, i) { return i === 0 || out[i - 1].start <= o.start; }));
});

test('lettura: prossimo evento, oggi, etichette del giorno', async function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-cal-'));
  const ctx = { dataDir: dir, ensureDataDir: function () { return dir; } };
  const empty = await calendar.read(ctx, NOW);
  assert.strictEqual(empty.configured, false);
  assert.strictEqual(empty.hasNext, false);
  fs.writeFileSync(path.join(dir, 'agenda.ics'), FILE);
  calendar.configure(ctx, { file: path.join(dir, 'agenda.ics') });
  const out = await calendar.read(ctx, NOW);
  assert.strictEqual(out.error, '');
  assert.strictEqual(out.next.title, 'Tre volte');
  assert.strictEqual(out.next.day, 'Oggi');
  assert.strictEqual(out.next.time, '08:00');
  assert.strictEqual(out.today, 1);
  const tomorrow = out.events.filter(function (e) { return e.title === 'Compleanno'; })[0];
  assert.strictEqual(tomorrow.day, 'Domani');
  assert.strictEqual(tomorrow.time, 'Tutto il giorno');
});

test('collegamento: indirizzi non validi rifiutati, link scaricato con la funzione data, errore chiaro', async function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-cal-'));
  const ctx = { dataDir: dir, ensureDataDir: function () { return dir; } };
  assert.throws(function () { calendar.configure(ctx, { url: 'ftp://x' }); }, /https/);
  assert.throws(function () { calendar.configure(ctx, { file: 'relativo.ics' }); }, /completo/);
  calendar.configure(ctx, { url: 'webcal://esempio.it/a.ics' });
  assert.strictEqual(calendar.settings(ctx).url, 'https://esempio.it/a.ics');
  const ok = await calendar.read(ctx, NOW, async function () { return FILE; });
  assert.strictEqual(ok.error, '');
  assert.ok(ok.count > 0);
  calendar.configure(ctx, { url: 'https://altro.it/b.ics' });
  const ko = await calendar.read(ctx, NOW, async function () { throw new Error('Il calendario non risponde'); });
  assert.strictEqual(ko.error, 'Il calendario non risponde');
  assert.strictEqual(ko.count, 0);
});
