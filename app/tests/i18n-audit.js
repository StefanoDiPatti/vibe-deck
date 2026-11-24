const fs = require('fs'), path = require('path'), vm = require('vm');
module.exports = function audit(APP) {
const acorn = require('acorn');
const store = { 'dock:lang': '"en"' };
const ctx = { window: { localStorage: { getItem: function (k) { return store[k] || null; }, setItem: function () {} } } };
ctx.window.window = ctx.window;
vm.createContext(ctx);
['i18n.js', 'lang-en.js'].forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(APP, 'public', 'js', f), 'utf8') + '\nwindow.I18n = I18n;', ctx); });
pluginDictionaries(APP).forEach(function (code) { vm.runInContext(code, ctx); });
const I = ctx.window.I18n;

const IT = /[àèéìòù]|\b(il|lo|la|gli|le|di|da|del|della|dei|delle|al|alla|sul|sulla|nel|nella|per|non|che|una|uno|sei|tocca|tieni|apri|chiudi|nessun[ao]?|niente|carico|scegli|scrivi|premi|aggiungi|torna|passa|mostra|uscita|ingresso|microfono|predefinit[oa]|finestr[ae]|stanza|canali|aperte?|collega\w*|sincronizz\w*|dettatura|modello|sessione|guida|zona|divisione|attiv[ao]|schermo|nuov[ao]|giorni|settimana|consumi|completat\w+|riproduzione|coda|brano|indietro|avanti|cartella|flusso|modifica|inizio|fine|tutt[eio]|metà|terzi|quarti|griglia|ricarica|errori|sistema|suoni|volume|esci|entra|ieri|ora|fa|libero|vuot[ao]|caric\w+|riprova|salva\w*|annulla|sposta\w*|chiud\w+|invia\w*|scarica|cerca|nascost\w+|mostrat\w+|disponibil\w+|selezion\w+|monitor del|su|in corso|vicino|ancora|sempre|prima|dopo|subito|solo|anche|oppure|questo|questa|quello|quella|tuo|tua|tuoi)\b/i;
const SKIP = /^[a-z0-9_.:\/#-]+$|^[A-Z][A-Za-z]+$|^\/api|^[.#][a-z]|^(data|aria)-|^https?:|^[a-z-]+( [a-z-]+)*$/;
const out = {};
function check(s, where) {
  s = String(s).replace(/\s+/g, ' ').trim();
  if (s.length < 2 || !/[A-Za-zÀ-ú]{2}/.test(s) || !IT.test(s)) return;
  if (I.t(s) !== s) return;
  (out[s] = out[s] || []).push(where);
}
['app.js', 'widgets.js', 'shapes.js', 'core.js'].map(function (f) { return path.join(APP, 'public', 'js', f); }).concat(pluginScripts(APP)).forEach(function (file) {
  const f = path.basename(file);
  const src = fs.readFileSync(file, 'utf8');
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.name === 'I18n') return;
    if (n.type === 'Literal' && typeof n.value === 'string' && !SKIP.test(n.value.trim())) {
      n.value.split(/<[^>]*>/).forEach(function (part) { check(part, f); });
    }
    for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
  })(acorn.parse(src, { ecmaVersion: 5 }));
});
fs.readFileSync(path.join(APP, 'public', 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').split(/<[^>]*>/).forEach(function (t) { check(t, 'index.html'); });
const parse = require(path.join(APP, 'server', 'config.js')).parseJson;
pageFiles(APP).forEach(function (file) {
  const f = path.basename(file);
  const p = parse(fs.readFileSync(file, 'utf8'));
  [p.title, p.description].forEach(function (x) { if (x) check(x, f); });
  (p.tiles || []).forEach(function (t) { [t.label, t.sub, t.linux && t.linux.label, t.linux && t.linux.sub].forEach(function (x) { if (x) check(x, f); }); });
});
widgetFiles(APP).forEach(function (file) {
  const f = path.basename(path.dirname(path.dirname(file))) + '/widgets/' + path.basename(file);
  shownTexts(parse(fs.readFileSync(file, 'utf8'))).forEach(function (x) { check(x, f); });
});
return out;
};
function jsonIn(dir) {
  try { return fs.readdirSync(dir).filter(function (f) { return /\.json$/i.test(f); }).map(function (f) { return path.join(dir, f); }); } catch (e) { return []; }
}
function pageFiles(APP) {
  const official = path.join(APP, 'official-plugins');
  const lists = fs.readdirSync(official).map(function (n) { return jsonIn(path.join(official, n, 'pages')); });
  return [].concat.apply(jsonIn(path.join(APP, 'config', 'defaults', 'pages')), lists);
}
function pluginScripts(APP) {
  const official = path.join(APP, 'official-plugins');
  const lists = fs.readdirSync(official).map(function (n) {
    const dir = path.join(official, n, 'public');
    try { return fs.readdirSync(dir).filter(function (f) { return /\.js$/i.test(f); }).map(function (f) { return path.join(dir, f); }); } catch (e) { return []; }
  });
  return [].concat.apply([], lists);
}
function widgetFiles(APP) {
  const official = path.join(APP, 'official-plugins');
  return [].concat.apply([], fs.readdirSync(official).map(function (n) { return jsonIn(path.join(official, n, 'widgets')); }));
}
function shownTexts(def) {
  const show = def.show || {};
  const voice = def.voice || {};
  const out = [show.label, show.unit, show.sub, show.text, show.onText, show.offText, voice.placeholder, voice.reply];
  (show.rows || []).forEach(function (r) { out.push(r.label, r.value); });
  (def.buttons || []).forEach(function (b) { out.push(b.label, b.sub); });
  (voice.commands || []).forEach(function (c) { out.push(c.reply); });
  return out.filter(function (x) { return typeof x === 'string' && x && x.indexOf('{{') < 0; });
}
function pluginDictionaries(APP) {
  const acorn = require('acorn');
  const out = [];
  const official = path.join(APP, 'official-plugins');
  fs.readdirSync(official).forEach(function (n) {
    const file = path.join(official, n, 'lang', 'en.json');
    if (fs.existsSync(file)) out.push('I18n.add(' + fs.readFileSync(file, 'utf8') + ');');
  });
  pluginScripts(APP).forEach(function (file) {
    const src = fs.readFileSync(file, 'utf8');
    (function walk(n) {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.name === 'I18n') { out.push('I18n.' + n.callee.property.name + '(' + src.slice(n.arguments[0].start, n.arguments[0].end) + ');'); return; }
      for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
    })(acorn.parse(src, { ecmaVersion: 5 }));
  });
  return out;
}
module.exports.pageFiles = pageFiles;
module.exports.pluginDictionaries = pluginDictionaries;
