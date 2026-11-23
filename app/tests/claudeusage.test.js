'use strict';
const test = require('node:test');
const assert = require('node:assert');
const u = require('../official-plugins/claude/lib/claudeusage');

test('consumi: sessione, settimana e limiti per modello (chiavi vecchie e array limits)', function () {
  const r = u._normalize({
    five_hour: { utilization: 64.4, resets_at: '2026-11-19T01:30:00Z' },
    seven_day: { utilization: 34, resets_at: '2026-11-20T21:00:00Z' },
    seven_day_opus: { utilization: 120 },
    seven_day_sonnet: null,
    limits: [
      { kind: 'weekly_scoped', percent: 12, resets_at: 'x', scope: { model: { display_name: 'Fable' } } },
      { kind: 'weekly_scoped', percent: 50, scope: { model: { display_name: 'Opus' } } },
      { kind: 'weekly', percent: 34 }
    ]
  });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.fiveHour, { percent: 64, resetsAt: '2026-11-19T01:30:00Z' });
  assert.strictEqual(r.sevenDay.percent, 34);
  assert.deepStrictEqual(r.models.map(function (m) { return m.name + ' ' + m.percent; }), ['Opus 100', 'Fable 12']);
});

test('consumi: risposta vuota senza errori', function () {
  const r = u._normalize({});
  assert.strictEqual(r.fiveHour, null);
  assert.deepStrictEqual(r.models, []);
});
