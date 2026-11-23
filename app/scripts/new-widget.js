const fs = require('fs');
const path = require('path');
const plugins = require('../server/plugins');

function builtinWidgets() {
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'widgets.js'), 'utf8');
  const m = /var TYPES = \{([^}]*)\}/.exec(js);
  return m ? m[1].split(',').map(function (s) { return s.split(':')[0].trim(); }).filter(Boolean) : [];
}

function fill(text, name) {
  return text.replace(/__NOME__/g, name).replace(/__TITOLO__/g, name.toUpperCase());
}

const SERVER = `let tocchi = 0;

module.exports = {
  description: 'Widget di esempio: ora del PC e un contatore',

  actions: {
    saluta: async function (azione, ctx) {
      ctx.log.info('saluta premuto');
      return { message: 'Ciao' + (azione.nome ? ' ' + azione.nome : '') + ' da __NOME__!' };
    }
  },

  routes: function (router, ctx) {
    router.get('/dati', ctx.route(function () {
      return { ora: new Date().toLocaleTimeString('it-IT'), tocchi: tocchi };
    }));
    router.post('/tocca', ctx.route(function () {
      tocchi++;
      return { tocchi: tocchi };
    }));
  }
};
`;

const CLIENT = `(function () {
  'use strict';

  Icons.register('__NOME__', 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm1 5h-2v6l5 3 1-1.7-4-2.3V7z');

  Widgets.register('__NOME__', function (root, tile, app) {
    var H = Widgets.helpers;
    D.addClass(root, 'w-__NOME__');
    H.header(root, tile.title || '__TITOLO__', H.smallBtn('TOCCA', 'add', tocca));
    var ora = H.el('div', 'pl-__NOME__-ora', '…');
    var info = H.el('div', 'pl-__NOME__-info', '');
    root.appendChild(ora);
    root.appendChild(info);

    function load() {
      D.api.get('/api/plugins/__NOME__/dati', function (err, d) {
        if (err) { D.setText(info, err.message); return; }
        D.setText(ora, d.ora);
        D.setText(info, 'Tocchi: ' + d.tocchi);
      });
    }
    function tocca() {
      D.api.post('/api/plugins/__NOME__/tocca', {}, function (err, d) {
        if (err) return app.toast(err.message, 'err');
        app.toast('Tocchi: ' + d.tocchi, 'ok');
        load();
      });
    }

    load();
    var timer = D.every(5000, 30000, load);
    return {
      update: function (state) {},
      resize: function (w, h) { ora.style.fontSize = Math.round(Math.min(w / 6, h / 3)) + 'px'; },
      destroy: function () { D.stop(timer); }
    };
  });
})();
`;

const STYLE = `.w-__NOME__ .pl-__NOME__-ora { margin-top: 10px; text-align: center; font-weight: bold; font-size: 40px; }
.w-__NOME__ .pl-__NOME__-info { margin-top: 6px; text-align: center; color: #8b9bab; font-size: 15px; }
`;

const HOME = `{
  "__NOME__": {
    "label": "__TITOLO__",
    "icon": "__NOME__",
    "description": "Ora del PC e un contatore",
    "w": 2, "h": 2,
    "minW": 2, "minH": 1
  }
}
`;

const MANIFEST = `{
  "id": "__NOME__",
  "name": "__TITOLO__",
  "version": "1.0.0",
  "description": "Widget di esempio: ora del PC e un contatore",
  "type": "plugin",
  "platforms": ["windows", "linux"]
}
`;

const PAGE = `{
  "id": "__NOME__",
  "title": "__TITOLO__",
  "icon": "__NOME__",
  "description": "Pagina del plugin __NOME__",
  "columns": 4,
  "rows": 2,
  "tiles": [
    { "widget": "__NOME__", "w": 2, "h": 2 },
    { "id": "saluta", "label": "SALUTA", "icon": "__NOME__", "color": "#2f6b3a", "action": { "type": "__NOME__.saluta", "nome": "Vibe Deck" } },
    { "id": "home", "label": "HOME", "icon": "home", "action": { "type": "page", "page": "main" } }
  ]
}
`;

function main(argv) {
  const name = String(argv[0] || '').trim().toLowerCase();
  if (!plugins.NAME_RE.test(name)) {
    console.error('Uso: npm run new:widget -- <nome>\n  <nome>: lettere minuscole, numeri, - e _ (es. meteo)');
    return 1;
  }
  if (builtinWidgets().indexOf(name) >= 0) { console.error('"' + name + '" è già un widget di Vibe Deck: scegli un altro nome'); return 1; }
  const dir = path.join(plugins.baseDir(), name);
  if (fs.existsSync(dir)) { console.error('Esiste già: ' + path.relative(process.cwd(), dir)); return 1; }
  fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'pages'), { recursive: true });
  const files = [
    ['plugin.json', MANIFEST],
    ['index.js', SERVER],
    [path.join('public', name + '.js'), CLIENT],
    [path.join('public', name + '.css'), STYLE],
    [path.join('pages', name + '.json'), PAGE],
    ['home.json', HOME]
  ];
  files.forEach(function (f) { fs.writeFileSync(path.join(dir, f[0]), fill(f[1], name)); });
  console.log('Creato il plugin ' + path.relative(process.cwd(), dir) + ':');
  files.forEach(function (f) { console.log('  ' + f[0]); });
  console.log('\nRiavvia la dock, poi nel pannello di controllo aggiungi la pagina ' + name.toUpperCase() + ' alla barra,');
  console.log('oppure metti il widget nella HOME (pannello > HOME > catalogo, gruppo PLUGIN ' + name.toUpperCase() + ').');
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { main: main };
