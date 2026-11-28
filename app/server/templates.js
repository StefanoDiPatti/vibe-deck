const home = require('./home');
const customPages = require('./custom-pages');

const FORMAT = 'vibe-deck-page';

function bad(message) { return Object.assign(new Error(message), { code: 'BAD_REQUEST' }); }

function tile(id, x, y, w, h) { return { id: id, x: x, y: y, w: w, h: h }; }

const BUILTIN = [
  {
    id: 'monitor', title: 'MONITOR', icon: 'cpu', description: 'Stato del PC, orologio, musica e prossimo evento',
    columns: 6, rows: 4,
    tiles: [tile('system', 0, 0, 3, 2), tile('clock', 3, 0, 3, 1), tile('nowplaying', 3, 1, 3, 2), tile('calendar.next', 0, 2, 3, 1), tile('claudeusage', 0, 3, 2, 1)]
  },
  {
    id: 'developer', title: 'DEV', icon: 'code', description: 'Progetti, task, GitHub, consumi di Claude e TODO',
    columns: 6, rows: 4,
    tiles: [tile('viber-projects', 0, 0, 2, 2), tile('viber-tasks', 2, 0, 2, 2), tile('github', 0, 2, 3, 2), tile('claudeusage', 4, 0, 2, 2), tile('todo', 3, 2, 3, 2)]
  },
  {
    id: 'gaming', title: 'GAMING', icon: 'gamepad', description: 'Giochi, Discord, mixer audio e carico del PC',
    columns: 6, rows: 4,
    tiles: [tile('games', 0, 0, 4, 1), tile('discordmini', 4, 0, 2, 2), tile('audio', 0, 1, 3, 3), tile('pcinfo.cpu', 3, 1, 3, 1), tile('pcinfo.gpu', 3, 2, 3, 1), tile('clock', 3, 3, 3, 1)]
  },
  {
    id: 'streaming', title: 'STREAMING', icon: 'live', description: 'OBS, Twitch e microfono',
    columns: 6, rows: 4,
    tiles: [tile('obs', 0, 0, 4, 2), tile('audio.microfono', 4, 0, 2, 1), tile('discordmini', 4, 1, 2, 2), tile('twitch', 0, 2, 4, 2)]
  },
  {
    id: 'desk', title: 'SCRIVANIA', icon: 'desktop', description: 'Agenda, meteo, TODO e musica',
    columns: 6, rows: 4,
    tiles: [tile('calendar.agenda', 0, 0, 3, 2), tile('meteo.adesso', 3, 0, 3, 1), tile('nowplaying', 3, 1, 3, 2), tile('todo', 0, 2, 3, 2), tile('clock', 3, 3, 3, 1)]
  },
  {
    id: 'remote', title: 'CASA', icon: 'power', description: 'Accendi i dispositivi, volume e microfono',
    columns: 6, rows: 3,
    tiles: [tile('wol.wake', 0, 0, 3, 2), tile('audio.volume', 3, 0, 3, 1), tile('audio.microfono', 3, 1, 3, 1), tile('clock', 0, 2, 2, 1)]
  }
];

function knownIds() {
  const known = {};
  home.catalog().forEach(function (c) { known[c.id] = true; });
  return known;
}

function sanitize(template) {
  if (!template || typeof template !== 'object' || Array.isArray(template)) throw bad('Il modello non è valido');
  if (template.format !== undefined && template.format !== FORMAT) throw bad('Questo file non è un modello di pagina di Vibe Deck');
  const known = knownIds();
  const list = Array.isArray(template.tiles) ? template.tiles : [];
  const skipped = [];
  const tiles = [];
  list.forEach(function (t) {
    const id = t && typeof t.id === 'string' ? t.id : '';
    if (!id) return;
    if (known[id]) tiles.push({ id: id, x: t.x, y: t.y, w: t.w, h: t.h });
    else skipped.push(id);
  });
  if (!tiles.length) throw bad(skipped.length ? 'Nessun widget del modello è disponibile qui: servono ' + skipped.join(', ') : 'Il modello non ha widget');
  return {
    skipped: skipped,
    input: { title: template.title, icon: template.icon, description: template.description, columns: template.columns, rows: template.rows, tiles: tiles.slice(0, home.LIMITS.maxTiles) }
  };
}

function save(template, existingIds) {
  const clean = sanitize(template);
  let input = clean.input;
  let page;
  try { page = customPages.shared.save(input, existingIds); } catch (e) {
    if (e.code !== 'BAD_REQUEST' || !/spazio/.test(e.message)) throw e;
    input = Object.assign({}, input, { tiles: input.tiles.map(function (t) { return { id: t.id, w: t.w, h: t.h }; }) });
    page = customPages.shared.save(input, existingIds);
  }
  return { page: page, skipped: clean.skipped };
}

function list() {
  const known = knownIds();
  return BUILTIN.map(function (t) {
    const have = t.tiles.filter(function (x) { return known[x.id]; }).length;
    return { id: t.id, title: t.title, icon: t.icon, description: t.description, available: have, total: t.tiles.length };
  });
}

function apply(id, existingIds) {
  const t = BUILTIN.filter(function (x) { return x.id === id; })[0];
  if (!t) throw bad('Modello sconosciuto: ' + id);
  return save(t, existingIds);
}

function exportPage(id) {
  const page = customPages.shared.list().filter(function (p) { return p.id === id; })[0];
  if (!page) throw bad('Pagina non trovata: ' + id);
  return {
    format: FORMAT,
    version: 1,
    title: page.title,
    icon: page.icon,
    description: page.description || '',
    columns: page.columns,
    rows: page.rows,
    tiles: (page.tiles || []).map(function (t) { return { id: t.id, x: t.x, y: t.y, w: t.w, h: t.h }; })
  };
}


module.exports = { list: list, apply: apply, exportPage: exportPage, importPage: save, sanitize: sanitize, BUILTIN: BUILTIN, FORMAT: FORMAT };
