const { spawn } = require('child_process');
const os = require('os');
const config = require('../config');
const paths = require('../paths');
const platform = require('../platform');
const keys = require('../platform/keys');
const common = require('../platform/common');
const media = require('../services/media');
const appsState = require('../services/apps');
const fs = require('fs');
const log = require('../log');

const MAX_MACRO_STEPS = 50;
const MAX_WAIT_MS = 10000;

function fail(message, code) {
  const e = new Error(message);
  e.code = code || 'ACTION_FAILED';
  return e;
}

function appLabel(id, app) { return (app && app.label) || id; }

const forPlatform = common.forPlatform;

async function runningGame() {
  if (typeof platform.windowList !== 'function') return null;
  const all = config.apps();
  const games = Object.keys(all).map(function (id) { return { id: id, app: forPlatform(all[id]) }; })
    .filter(function (g) { return g.app && g.app.game; });
  if (!games.length) return null;
  const wins = await platform.windowList().catch(function () { return []; });
  wins.sort(function (x, y) { return (y.active ? 1 : 0) - (x.active ? 1 : 0); });
  for (let i = 0; i < wins.length; i++) {
    if (wins[i].state === 'min') continue;
    for (let j = 0; j < games.length; j++) {
      if (appsState.processNames(games[j].app).indexOf(wins[i].process) >= 0) return { pid: wins[i].pid, label: appLabel(games[j].id, games[j].app) };
    }
  }
  return null;
}

function pickPath(p) {
  if (!Array.isArray(p)) return p;
  for (let i = 0; i < p.length; i++) if (common.available(String(p[i]))) return p[i];
  return p[0];
}

function normalizeArgs(args) {
  if (Array.isArray(args)) return args.map(String);
  if (typeof args === 'string' && args.trim()) return args.trim().split(/\s+/);
  return [];
}

function runCommand(id) {
  const all = config.commands();
  const def = forPlatform(all[id]);
  if (!all[id]) return Promise.reject(fail('Comando "' + id + '" non definito in commands.json', 'NOT_FOUND'));
  if (!def || !def.cmd) return Promise.reject(fail('Comando "' + id + '" non disponibile su questo sistema', 'UNSUPPORTED'));
  const args = normalizeArgs(def.args).map(function (a) { return common.expandPath(a.split('{root}').join(paths.ROOT)); });
  const cmd = common.expandPath(def.cmd);
  const timeout = Math.min(def.timeoutMs || 20000, 120000);
  return new Promise(function (resolve, reject) {
    let proc;
    if (process.platform === 'win32') {
      const line = [common.quoteWinArg(cmd)].concat(args.map(common.quoteWinArg)).join(' ');
      proc = spawn(line, { shell: true, cwd: def.cwd ? common.expandPath(def.cwd) : os.homedir(), windowsHide: true });
    } else {
      proc = spawn(cmd, args, { cwd: def.cwd ? common.expandPath(def.cwd) : os.homedir() });
    }
    let out = '';
    const append = function (d) { if (out.length < 8000) out += d; };
    proc.stdout.on('data', append);
    proc.stderr.on('data', append);
    const timer = setTimeout(function () { proc.kill(); }, timeout);
    proc.on('error', function (e) { clearTimeout(timer); reject(fail('Impossibile eseguire ' + cmd + ': ' + e.message)); });
    proc.on('close', function (code) {
      clearTimeout(timer);
      const text = common.stripAnsi(out).trim();
      if (code !== 0) return reject(fail((def.label || id) + ' fallito (codice ' + code + ')' + (text ? ': ' + text.split('\n').slice(-1)[0] : '')));
      resolve({ message: (def.label || id) + ': fatto', output: def.showOutput ? text.slice(0, 4000) : undefined });
    });
  });
}

async function focusBefore(name) {
  if (!name) return;
  try {
    await platform.focus(name);
  } catch (e) {
    if (e.code !== 'UNSUPPORTED') throw e;
  }
}

const HANDLERS = {
  launch: async function (a) {
    const id = a.app || a.target;
    const apps = config.apps();
    const app = forPlatform(apps[id]);
    if (!apps[id]) throw fail('App "' + id + '" non definita in apps.json', 'NOT_FOUND');
    if (!app || !app.path) throw fail(appLabel(id, apps[id]) + ' non configurata per questo sistema', 'UNSUPPORTED');
    if (app.toggle && await appsState.closeIfRunning(id)) {
      return { message: appLabel(id, app) + ': chiusura in corso' };
    }
    if (app.whenRunning === 'focus' && await appsState.focusIfRunning(id).catch(function () { return false; })) {
      return { message: appLabel(id, app) + ' in primo piano' };
    }
    appsState.invalidate();
    const follow = require('../plugins').hook('launch', { app: id, processes: appsState.processNames(app) }).filter(function (f) { return typeof f === 'function'; });
    try {
      await platform.launch({ path: pickPath(app.path), args: normalizeArgs(app.args), cwd: app.cwd });
    } catch (e) {
      throw fail(appLabel(id, app) + ': ' + e.message, 'NOT_FOUND');
    }
    follow.forEach(function (f) { f(); });
    return { message: appLabel(id, app) + ' avviata' };
  },

  media: async function (a) {
    const cmd = String(a.command || '');
    if (cmd === 'volume_up' || cmd === 'volume_down' || cmd === 'mute') {
      await platform.media(cmd);
      return { message: null };
    }
    const appCmd = { app_volume_up: 'volume_up', app_volume_down: 'volume_down', app_mute: 'mute' }[cmd] || cmd;
    const r = await media.command(appCmd);
    return { message: r && typeof r.volume === 'number' ? 'Volume ' + Math.round(r.volume * 100) + '%' : null };
  },

  hotkey: async function (a) {
    const combo = keys.parseCombo(a.keys);
    await focusBefore(a.focus);
    await platform.sendKeys(combo);
    return { message: null };
  },

  key: async function (a) {
    const combo = keys.parseCombo([a.key]);
    await focusBefore(a.focus);
    const times = Math.max(1, Math.min(parseInt(a.repeat, 10) || 1, 50));
    for (let i = 0; i < times; i++) await platform.sendKeys(combo);
    return { message: null };
  },

  text: async function (a) {
    if (typeof a.value !== 'string' || !a.value) throw fail('Testo mancante', 'BAD_CONFIG');
    await focusBefore(a.focus);
    await platform.typeText(a.value);
    return { message: null };
  },

  focus: async function (a) {
    await platform.focus(a.app || a.process);
    return { message: null };
  },

  open_url: async function (a) {
    if (!/^(https?|mailto|steam|spotify|vscode|obsidian|discord):/i.test(String(a.url || ''))) {
      throw fail('URL non valido o protocollo non consentito: ' + a.url, 'BAD_CONFIG');
    }
    await platform.open(a.url);
    return { message: 'Aperto sul PC' };
  },

  open_path: async function (a) {
    if (!a.path) throw fail('Percorso mancante', 'BAD_CONFIG');
    await platform.open(common.expandPath(a.path));
    return { message: 'Aperto sul PC' };
  },

  command: async function (a) {
    return runCommand(a.id || a.commandId);
  },

  discord: async function (a) {
    const discord = require('../services/discord');
    const what = String(a.command || '');
    if (['mute', 'deaf', 'video', 'stream'].indexOf(what) < 0) throw fail('Comando Discord sconosciuto: ' + what, 'BAD_CONFIG');
    await discord.ensure();
    if (discord.state().status !== 'ready') {
      if (what === 'video' || what === 'stream') throw fail('Per webcam e Go Live collega Discord dal pannello di controllo sul PC', 'UNAVAILABLE');
      await HANDLERS.hotkey({ keys: ['CTRL', 'SHIFT', what === 'mute' ? 'M' : 'D'], focus: 'discord' });
      return Object.assign(discord.state(), { message: (what === 'mute' ? 'Mute' : 'Silenzia') + ' inviato a Discord (scorciatoia)' });
    }
    if (what === 'mute' || what === 'deaf') return Object.assign(await discord.toggle(what), { message: null });
    const was = discord.state().voice[what];
    const game = what === 'stream' && !was ? await runningGame() : null;
    const st = await discord.toggleMedia(what, game ? game.pid : null);
    const message = what === 'video' ? (was ? 'Webcam spenta' : 'Webcam accesa') :
      was ? 'Condivisione fermata' : 'Go Live' + (game ? ': ' + game.label : ' avviato');
    return Object.assign(st, { message: message });
  },


  wait: async function (a) {
    const ms = Math.max(0, Math.min(parseInt(a.ms, 10) || 0, MAX_WAIT_MS));
    await new Promise(function (r) { setTimeout(r, ms); });
    return { message: null };
  },

  macro: async function (a) {
    const steps = Array.isArray(a.steps) ? a.steps : [];
    if (!steps.length) throw fail('Macro senza passi', 'BAD_CONFIG');
    if (steps.length > MAX_MACRO_STEPS) throw fail('Macro troppo lunga (max ' + MAX_MACRO_STEPS + ' passi)', 'BAD_CONFIG');
    let last = { message: null };
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i] || steps[i].type === 'macro') throw fail('Passo ' + (i + 1) + ' non valido', 'BAD_CONFIG');
      try {
        last = await execute(steps[i]);
      } catch (e) {
        throw fail('Macro interrotta al passo ' + (i + 1) + ': ' + e.message, e.code);
      }
    }
    return { message: a.doneMessage || last.message || 'Macro completata', output: last.output };
  }
};

HANDLERS.shell = HANDLERS.command;

const BUILTIN = Object.keys(HANDLERS);
require('../plugins').registerActions(HANDLERS);

async function execute(action) {
  if (!action || typeof action !== 'object') throw fail('Azione mancante', 'BAD_CONFIG');
  const handler = HANDLERS[action.type];
  if (!handler) throw fail('Tipo di azione sconosciuto: ' + action.type, 'UNKNOWN_ACTION');
  return handler(action);
}

async function press(pageId, tileId) {
  const tile = config.findTile(pageId, tileId);
  if (!tile) throw fail('Pulsante non trovato (configurazione cambiata?)', 'CONFIG_CHANGED');
  if (!tile.action) throw fail('Questo pulsante non ha un\'azione', 'BAD_CONFIG');
  if (tile.action.type === 'page') return { message: null };
  const started = Date.now();
  const result = await execute(tile.action);
  log.info('action', (tile.label || tile.id) + ' -> ok (' + (Date.now() - started) + 'ms)');
  return result;
}

module.exports = { execute: execute, press: press, HANDLERS: HANDLERS, BUILTIN: BUILTIN, forPlatform: forPlatform };
