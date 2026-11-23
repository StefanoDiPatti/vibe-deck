'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PORT = parseInt(process.env.DEMO_PORT, 10) || 8790;
const OUT = path.join(__dirname, '..', '..', 'docs', 'screenshots');

const SHOTS = [
  ['tablet-main.png', '/?shot=1&page=main', 1280, 800],
  ['tablet-apps.png', '/?shot=1&page=apps', 1280, 800],
  ['tablet-claude.png', '/?shot=1&page=claude', 1280, 800],
  ['tablet-audio-neon.png', '/?shot=1&page=audio&theme=neon', 1280, 800],
  ['tablet-github-brutal-en.png', '/?shot=1&page=github&theme=brutal&lang=en', 1280, 800],
  ['pannello-neon.png', '/control?shot=1&theme=neon', 1280, 1250],
  ['pannello-brutal.png', '/control?shot=1&theme=brutal', 1280, 1250],
  ['pannello-material.png', '/control?shot=1&theme=material', 1280, 1250]
];

function findBrowser() {
  if (process.env.BROWSER) return process.env.BROWSER;
  const list = process.platform === 'win32' ? [
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe')
  ] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  return list.filter(function (p) { return fs.existsSync(p); })[0];
}

const browser = findBrowser();
if (!browser) { console.error('Nessun browser trovato: installa Chrome o Edge, oppure BROWSER=percorso npm run screenshots'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
SHOTS.forEach(function (s) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-shot-'));
  const file = path.join(OUT, s[0]);
  try {
    execFileSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--user-data-dir=' + profile,
      '--window-size=' + s[2] + ',' + s[3], '--virtual-time-budget=8000', '--screenshot=' + file, 'http://127.0.0.1:' + PORT + s[1]],
      { stdio: 'ignore', timeout: 60000 });
    console.log('ok  ' + path.relative(process.cwd(), file));
  } catch (e) {
    console.error('NO  ' + s[0] + ': ' + e.message);
  } finally {
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { }
  }
});
