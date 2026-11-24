const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(lang) {
  const store = { 'dock:lang': JSON.stringify(lang) };
  const ctx = { window: { localStorage: { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = v; } } } };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  ['i18n.js', 'lang-en.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8') + '\nwindow.I18n = I18n;', ctx, { filename: f });
  });
  require('./i18n-audit').pluginDictionaries(path.join(__dirname, '..')).forEach(function (code) { vm.runInContext(code, ctx); });
  return ctx.window.I18n;
}

test('italiano: i testi restano come sono', function () {
  const I = load('it');
  assert.strictEqual(I.lang(), 'it');
  assert.strictEqual(I.t('SALVA'), 'SALVA');
});

test('inglese: parole, maiuscole, pezzi separati da " · " e testi con numeri', function () {
  const I = load('en');
  assert.strictEqual(I.lang(), 'en');
  assert.strictEqual(I.t('SALVA'), 'SAVE');
  assert.strictEqual(I.t('Salva'), 'Save');
  assert.strictEqual(I.t('  MUSICA '), '  MUSIC ', 'spazi intorno conservati');
  assert.strictEqual(I.t('RIPETI'), 'REDO', 'nelle scorciatoie è Redo (la Musica usa il suo testo)');
  assert.strictEqual(I.t('TASK · vibe-deck'), 'TASKS · vibe-deck');
  assert.strictEqual(I.t('3 finestre'), '3 windows');
  assert.strictEqual(I.t('si azzera dom 12:37'), 'resets Sun 12:37');
  assert.strictEqual(I.t('si azzera alle 03:07'), 'resets at 03:07');
  assert.strictEqual(I.t('PR aperte 2 · Issue 0 · CI falliti 1'), 'Open PRs 2 · Issue 0 · Failed CI 1');
  assert.strictEqual(I.t('Niente in riproduzione'), 'Nothing playing');
  assert.strictEqual(I.t('Neon Skyline'), 'Neon Skyline', 'testo sconosciuto: invariato');
  I.add({ 'Meteo di casa': 'Home weather' });
  assert.strictEqual(I.t('METEO DI CASA'), 'HOME WEATHER');
});

test('dizionario: niente traduzioni vuote; titoli delle pagine predefinite e dei plugin ufficiali tradotti', function () {
  const I = load('en');
  const config = require('../server/config');
  const missing = [];
  require('./i18n-audit').pageFiles(path.join(__dirname, '..')).forEach(function (file) {
    const f = path.basename(file);
    const p = config.parseJson(fs.readFileSync(file, 'utf8'));
    const title = p.title || p.id.toUpperCase();
    if (/[ÀÈÉÌÒÙ]|MUSICA|SCHERMI|GIOCHI|DESKTOP VIRTUALI/.test(title) && I.t(title) === title) missing.push(title);
    if (p.description && I.t(p.description) === p.description) missing.push(f + ': ' + p.description);
  });
  assert.deepStrictEqual(missing, []);
});

test('ogni testo italiano del tablet ha la traduzione inglese (codice, index.html, pagine predefinite e dei plugin ufficiali)', function () {
  const out = require('./i18n-audit')(path.join(__dirname, '..'));
  const PEZZI = ['Aggiungi a', 'Ancorata nella zona', 'CONNESSIONE PERSA · nuovo tentativo tra', 'English · tocca per l\'italiano',
    'IN CODA ·', 'Le app dal tablet si aprono sul monitor', 'Non disponibile per', 'Nuovo tentativo automatico tra', 'PR aperte',
    'Passa a un altro branch (uguale a git checkout', 'Sincronizzazione:', 'Spostata su', 'giovedì', 'lunedì', 'martedì', 'mercoledì',
    'venerdì', '· CANALI VOCALI', 'È già su'];
  const missing = Object.keys(out).filter(function (k) { return PEZZI.indexOf(k) < 0 && !/^</.test(k); });
  assert.deepStrictEqual(missing, [], 'aggiungi a public/js/lang-en.js le traduzioni di: ' + missing.join(' | '));
});

test('messaggi composti del PC: regole', function () {
  const I = load('en');
  assert.strictEqual(I.t('Logcat svuotato: fatto'), 'Logcat cleared: done');
  assert.strictEqual(I.t('Apple Music avviata'), 'Apple Music started');
  assert.strictEqual(I.t('3 giorni fa'), '3 days ago');
  assert.strictEqual(I.t('ieri'), 'yesterday');
  assert.strictEqual(I.t('tocca una zona del monitor 1'), 'tap a zone of monitor 1');
  assert.strictEqual(I.t('APRI LE APP SU'), 'OPEN APPS ON');
  assert.strictEqual(I.t('USCITA'), 'OUTPUT');
  assert.strictEqual(I.t('IN CODA · APPLE MUSIC'), 'UP NEXT · APPLE MUSIC');
});

test('puntino davanti: "· 11 h fa" -> "· 11 h ago"', function () {
  const I = load('en');
  assert.strictEqual(I.t('· 11 h fa'), '· 11 h ago');
  assert.strictEqual(I.t('· ieri'), '· yesterday');
});

test('separatori " · " con più spazi (riepilogo di GitHub)', function () {
  const I = load('en');
  assert.strictEqual(I.t('PR aperte 3   ·   Issue 4   ·   CI falliti 1'), 'Open PRs 3   ·   Issue 4   ·   Failed CI 1');
  assert.strictEqual(I.t('pronto'), 'done');
});
