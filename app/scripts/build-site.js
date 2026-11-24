'use strict';
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..');
const OUT = path.resolve(process.argv[2] || path.join(REPO, '_site'));
const SHOTS = ['tablet-main.png', 'tablet-audio-neon.png', 'tablet-github-brutal-en.png', 'tablet-claude.png', 'pannello-neon.png'];

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.readdirSync(path.join(REPO, 'site')).forEach(function (f) { copy(path.join(REPO, 'site', f), path.join(OUT, f)); });
copy(path.join(REPO, 'app', 'public', 'js', 'icons.js'), path.join(OUT, 'js', 'icons.js'));
SHOTS.forEach(function (f) { copy(path.join(REPO, 'docs', 'screenshots', f), path.join(OUT, 'screenshots', f)); });
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log('Sito pronto in ' + OUT);
