const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const config = require('./config');
const common = require('./platform/common');
const plugins = require('./plugins');

function readWidgetTypes() {
  try {
    const js = fs.readFileSync(path.join(paths.PUBLIC_DIR, 'js', 'widgets.js'), 'utf8');
    const m = /var TYPES = \{([^}]*)\}/.exec(js);
    return m ? m[1].split(',').map(function (s) { return s.split(':')[0].trim(); }).filter(Boolean) : [];
  } catch (e) { return []; }
}
const WIDGETS = readWidgetTypes();

let iconCache = { mtime: 0, names: null };
function iconNames() {
  const file = path.join(paths.PUBLIC_DIR, 'js', 'icons.js');
  try {
    const mtime = fs.statSync(file).mtimeMs;
    if (iconCache.mtime !== mtime) {
      const text = fs.readFileSync(file, 'utf8');
      const start = text.indexOf('var P = {');
      const end = text.indexOf('};', start);
      const names = {};
      const re = /^\s*([a-z_][a-z0-9_]*)\s*:/gim;
      let m;
      const body = text.slice(start, end);
      while ((m = re.exec(body))) names[m[1]] = true;
      const alias = /^\s*P\.([a-z_][a-z0-9_]*)\s*=/gim;
      while ((m = alias.exec(text))) names[m[1]] = true;
      iconCache = { mtime: mtime, names: names };
    }
  } catch (e) { return null; }
  return Object.assign({}, iconCache.names, plugins.icons());
}

function widgetNames() { return WIDGETS.concat(Object.keys(plugins.widgets())); }

function actionTypes() {
  const types = Object.keys(require('./actions').HANDLERS);
  types.push('page');
  return types;
}

function checkAction(a, where, ctx, out) {
  if (!a || typeof a !== 'object') { out.push({ where: where, message: 'azione mancante o non valida' }); return; }
  if (ctx.types.indexOf(a.type) < 0) {
    out.push({ where: where, message: 'tipo di azione sconosciuto "' + a.type + '" (validi: ' + ctx.types.join(', ') + ')' });
    return;
  }
  if (a.type === 'launch') {
    const app = ctx.apps[a.app];
    if (!a.app || !app) out.push({ where: where, message: 'l\'app "' + (a.app || '') + '" non esiste: aggiungila in config/apps.json o config/apps/' + (a.app || '<id>') + '.json' });
    else if (!common.forPlatform(app)) out.push({ where: where, message: 'l\'app "' + a.app + '" non ha un percorso per ' + ctx.osName + ' ("' + ctx.os + '" in apps.json)', level: 'info' });
  } else if (a.type === 'command') {
    const cmd = ctx.commands[a.id];
    if (!a.id || !cmd) out.push({ where: where, message: 'il comando "' + (a.id || '') + '" non è tra quelli consentiti: aggiungilo in config/commands.json o config/commands/' + (a.id || '<id>') + '.json' });
    else if (!common.forPlatform(cmd)) out.push({ where: where, message: 'il comando "' + a.id + '" non ha una variante per ' + ctx.osName, level: 'info' });
  } else if (a.type === 'page') {
    const target = a.page || a.pageId;
    if (!target || !ctx.pages[target]) out.push({ where: where, message: 'la pagina "' + (target || '') + '" non esiste' });
  } else if (a.type === 'hotkey') {
    if (!Array.isArray(a.keys) || !a.keys.length) out.push({ where: where, message: 'scorciatoia senza tasti ("keys": ["CTRL", "S"])' });
  } else if (a.type === 'macro') {
    if (!Array.isArray(a.steps) || !a.steps.length) out.push({ where: where, message: 'macro senza passi ("steps")' });
    else a.steps.forEach(function (s, i) { if (!s || s.type !== 'wait') checkAction(s, where + ' › passo ' + (i + 1), ctx, out); });
  }
}

function run() {
  const d = config.dock();
  const os = config.currentOs();
  const ctx = {
    apps: config.apps(),
    commands: config.commands(),
    pages: {},
    types: actionTypes(),
    os: os,
    osName: os === 'windows' ? 'Windows' : os === 'linux' ? 'Linux' : os
  };
  d.pages.forEach(function (p) { ctx.pages[p.id] = true; });
  const icons = iconNames();
  const widgets = widgetNames();
  const out = [];
  plugins.info().forEach(function (p) {
    if (p.error) out.push({ where: 'plugin ' + p.name, message: p.error });
  });
  config.missingPages().forEach(function (id) {
    out.push({ where: 'dock.json', message: 'la pagina "' + id + '" è elencata ma non c\'è il file config/pages/' + id + '.json' });
  });
  d.pages.forEach(function (p) {
    const pageWhere = 'pagina ' + p.title;
    if (p.icon && icons && !icons[p.icon]) out.push({ where: pageWhere, message: 'icona sconosciuta "' + p.icon + '"', level: 'info' });
    const seen = {};
    (p.allTiles || p.tiles).forEach(function (t) {
      const where = pageWhere + ' › ' + (t.widget ? 'widget ' + t.widget : 'pulsante ' + (t.label || t.id));
      if (t.widget) {
        if (widgets.indexOf(t.widget) < 0) out.push({ where: where, message: 'widget sconosciuto (validi: ' + widgets.join(', ') + ')' });
        return;
      }
      if (/_+$/.test(t.id) && seen[t.id.replace(/_+$/, '')]) out.push({ where: where, message: 'id "' + t.id.replace(/_+$/, '') + '" ripetuto nella pagina: dai a ogni pulsante un id diverso', level: 'info' });
      seen[t.id] = true;
      if (t.icon && icons && !icons[t.icon]) out.push({ where: where, message: 'icona sconosciuta "' + t.icon + '" (l\'elenco è nel README)', level: 'info' });
      if (t.showRunning && !ctx.apps[t.showRunning]) out.push({ where: where, message: '"showRunning": l\'app "' + t.showRunning + '" non esiste' });
      if (t.action) checkAction(t.action, where, ctx, out);
    });
  });
  out.forEach(function (x) { if (!x.level) x.level = 'error'; });
  return out;
}

module.exports = { run: run, WIDGETS: WIDGETS, iconNames: iconNames, widgetNames: widgetNames };
