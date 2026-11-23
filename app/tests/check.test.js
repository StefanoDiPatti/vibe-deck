const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-check-'));
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.LOG_LEVEL = 'error';
fs.mkdirSync(path.join(process.env.DOCK_CONFIG_DIR, 'pages'), { recursive: true });

const check = require('../server/check');

test('configurazione predefinita: nessun errore', function () {
  const errs = check.run().filter(function (x) { return x.level === 'error'; });
  assert.deepStrictEqual(errs, []);
});

test('pulsanti che non possono funzionare: spiegati uno per uno', function () {
  fs.writeFileSync(path.join(process.env.DOCK_CONFIG_DIR, 'pages', 'prova.json'), JSON.stringify({
    id: 'prova', title: 'PROVA', tiles: [
      { id: 'a', label: 'APP', action: { type: 'launch', app: 'non_esiste' } },
      { id: 'b', label: 'CMD', action: { type: 'command', id: 'rm_rf' } },
      { id: 'c', label: 'PAG', action: { type: 'page', page: 'boh' } },
      { id: 'd', label: 'TIPO', action: { type: 'volare' } },
      { id: 'e', label: 'ICONA', icon: 'unicorno', action: { type: 'key', key: 'F1' } },
      { id: 'f', label: 'MACRO', action: { type: 'macro', steps: [{ type: 'wait', ms: 10 }, { type: 'launch', app: 'neanche' }] } },
      { widget: 'meteo' }
    ]
  }));
  const r = check.run();
  const text = r.map(function (x) { return x.where + ': ' + x.message; }).join('\n');
  assert.match(text, /pulsante APP: l'app "non_esiste" non esiste/);
  assert.match(text, /pulsante CMD: il comando "rm_rf" non è tra quelli consentiti/);
  assert.match(text, /pulsante PAG: la pagina "boh" non esiste/);
  assert.match(text, /pulsante TIPO: tipo di azione sconosciuto "volare"/);
  assert.match(text, /pulsante ICONA: icona sconosciuta "unicorno"/);
  assert.match(text, /pulsante MACRO › passo 2: l'app "neanche" non esiste/);
  assert.match(text, /widget meteo: widget sconosciuto/);
});

test('i widget conosciuti dal controllo sono quelli che il tablet sa disegnare', function () {
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'widgets.js'), 'utf8');
  const m = /var TYPES = \{([^}]*)\}/.exec(js);
  const types = m[1].split(',').map(function (s) { return s.split(':')[0].trim(); }).filter(Boolean).sort();
  assert.deepStrictEqual(check.WIDGETS.slice().sort(), types);
  assert.ok(types.indexOf('claudeusage') >= 0 && types.length >= 15, 'letti da widgets.js');
  assert.ok(check.iconNames().gamepad, 'icone lette da icons.js');
});

test('lo schema delle pagine conosce tutti i widget del tablet (suggerimenti in VS Code)', function () {
  const S = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schema', 'page.schema.json'), 'utf8'));
  const known = S.definitions.tile.properties.widget.anyOf[0].enum;
  const missing = check.WIDGETS.filter(function (w) { return known.indexOf(w) < 0; });
  assert.deepStrictEqual(missing, [], 'aggiungi a schema/page.schema.json (tile > widget) i widget: ' + missing.join(', '));
});

test('lo schema delle pagine conosce tutti i campi usati dalle pagine predefinite', function () {
  const config = require('../server/config');
  const dir = path.join(__dirname, '..', 'config', 'defaults', 'pages');
  const S = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schema', 'page.schema.json'), 'utf8'));
  const pageKeys = Object.keys(S.properties);
  const tileKeys = Object.keys(S.definitions.tile.properties);
  const actKeys = Object.keys(S.definitions.action.properties);
  const types = S.definitions.action.properties.type.anyOf[0].enum;
  const bad = [];
  function act(a, where) {
    if (!a) return;
    Object.keys(a).forEach(function (k) { if (actKeys.indexOf(k) < 0) bad.push(where + ': campo azione ' + k); });
    if (types.indexOf(a.type) < 0) bad.push(where + ': tipo ' + a.type);
    (a.steps || []).forEach(function (s) { act(s, where); });
  }
  fs.readdirSync(dir).forEach(function (f) {
    const p = config.parseJson(fs.readFileSync(path.join(dir, f), 'utf8'));
    Object.keys(p).forEach(function (k) { if (pageKeys.indexOf(k) < 0) bad.push(f + ': campo pagina ' + k); });
    (p.tiles || []).forEach(function (t) {
      Object.keys(t).forEach(function (k) { if (tileKeys.indexOf(k) < 0) bad.push(f + ': campo pulsante ' + k); });
      act(t.action, f);
      ['windows', 'linux'].forEach(function (o) { if (t[o]) act(t[o].action, f + ' ' + o); });
    });
  });
  const handlers = require('../server/actions').BUILTIN.concat(['page']).filter(function (t) { return t !== 'shell'; }).sort();
  assert.deepStrictEqual(types.slice().sort(), handlers);
  assert.deepStrictEqual(bad, []);
});
