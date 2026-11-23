const fs = require('fs');
const path = require('path');
const paths = require('../server/paths');

function main(argv) {
  const id = String(argv[0] || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) {
    console.error('Uso: npm run new:page -- <id> ["TITOLO"]\n  <id>: lettere minuscole, numeri, - e _ (es. stream)');
    return 1;
  }
  const title = String(argv[1] || id).trim().toUpperCase();
  const dir = path.join(paths.CONFIG_DIR, 'pages');
  const file = path.join(dir, id + '.json');
  if (fs.existsSync(file)) { console.error('Esiste già: ' + path.relative(process.cwd(), file)); return 1; }
  if (fs.existsSync(path.join(paths.DEFAULTS_DIR, 'pages', id + '.json'))) {
    console.error('"' + id + '" è una pagina predefinita: per cambiarla copia config/defaults/pages/' + id + '.json in config/pages/');
    return 1;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, [
    '{',
    '  "id": "' + id + '",',
    '  "title": ' + JSON.stringify(title) + ',',
    '  "icon": "apps",',
    '  "description": "",',
    '  "autoGrid": true,',
    '  "tiles": [',
    '    { "id": "play", "label": "PLAY", "icon": "play", "action": { "type": "media", "command": "play_pause" } },',
    '    { "id": "github", "label": "GITHUB", "icon": "github", "color": "#24292f", "action": { "type": "open_url", "url": "https://github.com" } },',
    '    { "id": "home", "label": "HOME", "icon": "home", "action": { "type": "page", "page": "main" } },',
    '    { "widget": "clock", "w": 2, "h": 1 }',
    '  ]',
    '}',
    ''
  ].join('\n'));
  console.log('Creata ' + path.relative(process.cwd(), file));
  console.log('Aprila nell\'editor e cambia i pulsanti: il tablet si aggiorna quando salvi.');
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { main: main };
