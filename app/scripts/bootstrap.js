'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const readline = require('readline');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const IS_WIN = process.platform === 'win32';
const ARGS = process.argv.slice(2);
const SETUP_FILE = path.join(ROOT, '.dock-setup.json');
const STAMP = path.join(ROOT, 'node_modules', '.dock-install-stamp');
const SERVICE = ARGS.indexOf('--service') >= 0;
const PREPARE = ARGS.indexOf('--prepare') >= 0 || ARGS.indexOf('--no-server') >= 0;
const HIDDEN_LAUNCHER = path.join(ROOT, 'scripts', 'windows', 'start-hidden.vbs');
const EXIT_PORT_IN_USE = 3;

function say(msg) { console.log('  ' + msg); }
function title(msg) { console.log('\n== ' + msg); }

function checkNode() {
  const major = parseInt(process.versions.node.split('.')[0], 10);
  if (major >= 18) return;
  console.error('\nServe Node.js 18 o più recente (trovato ' + process.version + ').');
  console.error(IS_WIN
    ? 'Aggiorna con:  winget install -e --id OpenJS.NodeJS.LTS'
    : 'Aggiorna con nvm (https://github.com/nvm-sh/nvm) oppure dal sito https://nodejs.org');
  process.exit(1);
}

function depsHash() {
  const h = crypto.createHash('sha1');
  ['package.json', 'package-lock.json'].forEach(function (f) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) h.update(fs.readFileSync(p));
  });
  return h.digest('hex');
}

function installDeps() {
  const want = depsHash();
  const have = fs.existsSync(STAMP) ? fs.readFileSync(STAMP, 'utf8').trim() : '';
  if (have === want && fs.existsSync(path.join(ROOT, 'node_modules', 'express'))) return;
  title('Installo le dipendenze (solo la prima volta o dopo un aggiornamento)');
  const hasLock = fs.existsSync(path.join(ROOT, 'package-lock.json'));
  const args = [hasLock ? 'ci' : 'install', '--omit=dev', '--no-audit', '--no-fund'];
  const r = IS_WIN
    ? spawnSync('npm ' + args.join(' '), { cwd: ROOT, stdio: 'inherit', shell: true })
    : spawnSync('npm', args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('\nInstallazione delle dipendenze non riuscita. Controlla la connessione e riprova.');
    process.exit(1);
  }
  fs.writeFileSync(STAMP, want);
}

function randomToken() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function ensureEnv() {
  const envFile = path.join(ROOT, '.env');
  if (fs.existsSync(envFile)) return false;
  const example = path.join(ROOT, '.env.example');
  let text = fs.existsSync(example) ? fs.readFileSync(example, 'utf8') : 'PORT=8787\nDOCK_TOKEN=\n';
  text = text.replace(/^DOCK_TOKEN=.*$/m, 'DOCK_TOKEN=' + randomToken());
  fs.writeFileSync(envFile, text);
  say('Creato .env con un nuovo codice di accesso');
  return true;
}

function ensureConfig() {
  const config = require(path.join(ROOT, 'server', 'config.js'));
  const copied = config.ensureUserConfig();
  if (copied.length) say('Configurazione creata in config/: ' + copied.join(', '));
  const updated = config.upgradeUserConfig();
  if (updated.length) say('Configurazione aggiornata alla nuova versione: ' + updated.join(', ') + ' (non erano stati modificati)');
  const dataDir = path.join(ROOT, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
}

function readEnvPort() {
  try {
    const m = /^PORT=(\d+)/m.exec(fs.readFileSync(path.join(ROOT, '.env'), 'utf8'));
    if (m) return parseInt(m[1], 10);
  } catch (e) { }
  return 8787;
}

function ask(rl, question, def) {
  return new Promise(function (resolve) {
    rl.question('  ' + question + (def ? ' [S/n] ' : ' [s/N] '), function (a) {
      a = String(a || '').trim().toLowerCase();
      if (!a) return resolve(def);
      resolve(a[0] === 's' || a[0] === 'y');
    });
  });
}

function ps(command) {
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], { encoding: 'utf8', windowsHide: true });
}

function psQuote(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

const windowsSetup = {
  networkIsPublic: function () {
    const r = ps('(Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -ne "Disconnected" } | Select-Object -ExpandProperty NetworkCategory) -join ","');
    return /Public/.test(r.stdout || '');
  },
  firewallExists: function () {
    return ['Vibe Deck', 'Command Dock'].some(function (name) {
      const r = spawnSync('netsh', ['advfirewall', 'firewall', 'show', 'rule', 'name=' + name], { encoding: 'utf8', windowsHide: true });
      return r.status === 0;
    });
  },
  addFirewall: function (port) {
    say('Windows chiederà i permessi di amministratore...');
    const inner = 'New-NetFirewallRule -DisplayName "Vibe Deck" -Direction Inbound -Protocol TCP -LocalPort ' + parseInt(port, 10) + ' -Action Allow -Profile Private';
    const encoded = Buffer.from(inner, 'utf16le').toString('base64');
    const r = ps('Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList "-NoProfile","-EncodedCommand","' + encoded + '"');
    return r.status === 0 && windowsSetup.firewallExists();
  },
  shortcut: function (dir, name, minimized, panel) {
    const lnk = path.join(dir, name + '.lnk');
    const cmd = [
      '$s = (New-Object -ComObject WScript.Shell).CreateShortcut(' + psQuote(lnk) + ')',
      '$s.TargetPath = ' + psQuote(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe')),
      '$s.Arguments = ' + psQuote('"' + HIDDEN_LAUNCHER + '"' + (panel ? ' /panel' : '')),
      '$s.WorkingDirectory = ' + psQuote(ROOT),
      '$s.IconLocation = ' + psQuote(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'shell32.dll') + ',15'),
      '$s.Description = "Vibe Deck"',
      '$s.WindowStyle = ' + (minimized ? 7 : 1),
      '$s.Save()'
    ].join('; ');
    return ps(cmd).status === 0 ? lnk : null;
  },
  desktopDir: function () {
    const r = ps('[Environment]::GetFolderPath("Desktop")');
    return (r.stdout || '').trim() || path.join(os.homedir(), 'Desktop');
  },
  startupDir: function () {
    return path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  }
};

const linuxSetup = {
  install: function (what) {
    const r = spawnSync('bash', [path.join(ROOT, 'scripts', 'linux', 'vibe-deck.sh'), 'install'].concat(what), { stdio: 'inherit' });
    return r.status === 0;
  },
  missingTools: function () {
    const tools = ['playerctl', 'xdotool', 'wtype', 'wpctl', 'pactl'];
    return tools.filter(function (t) { return spawnSync('sh', ['-c', 'command -v ' + t], { stdio: 'ignore' }).status !== 0; });
  }
};

async function firstRunSetup(force) {
  const done = fs.existsSync(SETUP_FILE);
  if (done && !force) return;
  if (SERVICE) return;
  if (!process.stdin.isTTY) {
    say('Avvio non interattivo: salto le domande del primo avvio (rilancia con --setup).');
    return;
  }
  const port = readEnvPort();
  const answers = {};
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  title('Configurazione del primo avvio');
  try {
    if (IS_WIN) {
      if (windowsSetup.networkIsPublic()) {
        say('ATTENZIONE: la tua rete Wi-Fi/Ethernet è impostata come "Pubblica".');
        say('Il tablet non potrà collegarsi finché non la imposti come "Privata"');
        say('(Impostazioni > Rete e Internet > proprietà della rete > Rete privata).');
      }
      if (windowsSetup.firewallExists()) say('Regola firewall già presente.');
      else if (await ask(rl, 'Apro la porta ' + port + ' nel firewall di Windows (solo reti private)?', true)) {
        answers.firewall = windowsSetup.addFirewall(port);
        say(answers.firewall ? 'Regola firewall creata.' : 'Regola non creata: potrai consentire l\'accesso quando Windows lo chiede.');
      }
      if (await ask(rl, 'Creo il collegamento "Vibe Deck" sul desktop?', true)) {
        answers.desktop = windowsSetup.shortcut(windowsSetup.desktopDir(), 'Vibe Deck', false, true);
        say(answers.desktop ? 'Collegamento creato.' : 'Collegamento non creato.');
      }
      if (await ask(rl, 'Avvio la dock in automatico quando accedi a Windows?', false)) {
        answers.autostart = windowsSetup.shortcut(windowsSetup.startupDir(), 'Vibe Deck', true);
        say(answers.autostart ? 'Avvio automatico attivo (in background, icona vicino all\'orologio).' : 'Avvio automatico non configurato.');
      }
    } else {
      const missing = linuxSetup.missingTools();
      if (missing.length) {
        say('Strumenti opzionali mancanti: ' + missing.join(', '));
        say('Su Debian/Ubuntu:  sudo apt install playerctl xdotool wtype pulseaudio-utils');
        say('(playerctl = musica/now playing, xdotool/wtype = scorciatoie da tastiera)');
      }
      say('Se usi un firewall:  sudo ufw allow ' + port + '/tcp');
      if (await ask(rl, 'Creo l\'icona "Vibe Deck" sul desktop e nel menu delle app? (avvia la dock in background e apre il pannello)', true)) {
        answers.desktop = linuxSetup.install(['desktop', 'menu']);
        say(answers.desktop ? 'Icona creata: doppio clic per avviare, tasto destro per fermare o aprire il log.' : 'Icona non creata.');
      }
      if (await ask(rl, 'Avvio la dock in automatico (in background) quando accedi?', false)) {
        answers.autostart = linuxSetup.install(['autostart']);
        say(answers.autostart ? 'Avvio automatico attivo.' : 'Avvio automatico non configurato.');
      }
      try { fs.chmodSync(path.join(ROOT, 'start.sh'), 0o755); } catch (e) { }
    }
  } finally {
    rl.close();
  }
  fs.writeFileSync(SETUP_FILE, JSON.stringify(Object.assign({ at: new Date().toISOString(), platform: process.platform }, answers), null, 2));
}

function runServer() {
  let restarts = [];
  let stopping = false;
  let child = null;

  function start() {
    const env = Object.assign({}, process.env, SERVICE ? { DOCK_SERVICE: '1' } : {});
    child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], { cwd: ROOT, stdio: 'inherit', env: env });
    child.on('exit', function (code, signal) {
      if (stopping || signal === 'SIGINT' || code === 0 || code === 130) process.exit(code || 0);
      if (code === EXIT_PORT_IN_USE) process.exit(EXIT_PORT_IN_USE);
      const now = Date.now();
      restarts = restarts.filter(function (t) { return now - t < 60000; });
      restarts.push(now);
      if (restarts.length > 4) {
        console.error('\nIl server si è fermato troppe volte in un minuto. Controlla gli errori qui sopra.');
        process.exit(1);
      }
      console.error('\nIl server si è fermato (codice ' + code + '). Riavvio tra 2 secondi...');
      setTimeout(start, 2000);
    });
  }
  function stop() {
    stopping = true;
    if (child) { try { child.kill('SIGINT'); } catch (e) { } }
    setTimeout(function () { process.exit(0); }, 1500);
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  start();
}

async function main() {
  process.chdir(ROOT);
  checkNode();
  installDeps();
  const fresh = ensureEnv();
  ensureConfig();
  await firstRunSetup(ARGS.indexOf('--setup') >= 0 || (fresh && !fs.existsSync(SETUP_FILE)));
  if (PREPARE) { say('Pronto.'); return; }
  runServer();
}

main().catch(function (e) {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
