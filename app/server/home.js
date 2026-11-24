const HOME_ID = 'main';

const CATALOG = [
  { id: 'nowplaying', widget: 'nowplaying', label: 'Musica', icon: 'music', page: 'MUSICA', description: 'Brano in riproduzione, copertina e comandi', w: 3, h: 2, minW: 2, minH: 2 },
  { id: 'system', widget: 'system', label: 'Diagnostica', icon: 'cpu', page: 'HOME', description: 'CPU, GPU e RAM con le temperature', w: 3, h: 2, minW: 2, minH: 2 },
  { id: 'clock', widget: 'clock', label: 'Orologio', icon: 'target', page: 'HOME', description: 'Ora e data grandi, nel font del tema', w: 2, h: 1, minW: 1, minH: 1 },
];

const LIMITS = { minCols: 3, maxCols: 8, minRows: 2, maxRows: 6, maxTiles: 16 };

function clamp(v, min, max, def) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function catalog() {
  const out = CATALOG.map(function (c) { return Object.assign({ plugin: '', props: null }, c); });
  let fromPlugins = [];
  try { fromPlugins = require('./plugins').homeWidgets(); } catch (e) { fromPlugins = []; }
  fromPlugins.forEach(function (c) {
    if (!out.some(function (o) { return o.id === c.id; })) out.push(c);
  });
  return out;
}

function pack(tiles, cols, rows) {
  const grid = [];
  for (let r = 0; r < rows; r++) { grid[r] = []; for (let c = 0; c < cols; c++) grid[r][c] = false; }
  const placed = [], left = [];
  function fits(x, y, w, h) {
    if (x < 0 || y < 0 || x + w > cols || y + h > rows) return false;
    for (let i = y; i < y + h; i++) for (let j = x; j < x + w; j++) if (grid[i][j]) return false;
    return true;
  }
  function take(k, x, y, w, h) {
    for (let i = y; i < y + h; i++) for (let j = x; j < x + w; j++) grid[i][j] = true;
    placed.push({ index: k, x: x, y: y, w: w, h: h });
  }
  const free = [];
  tiles.forEach(function (t, k) {
    const w = Math.min(t.w || 1, cols), h = Math.min(t.h || 1, rows);
    if (typeof t.x === 'number' && typeof t.y === 'number' && fits(t.x, t.y, w, h)) take(k, t.x, t.y, w, h);
    else free.push(k);
  });
  free.forEach(function (k) {
    const t = tiles[k];
    const w = Math.min(t.w || 1, cols), h = Math.min(t.h || 1, rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (fits(c, r, w, h)) { take(k, c, r, w, h); return; }
      }
    }
    left.push(k);
  });
  placed.sort(function (a, b) { return a.index - b.index; });
  return { placed: placed, left: left };
}

function clean(input) {
  const bad = function (m) { return Object.assign(new Error(m), { code: 'BAD_REQUEST' }); };
  input = input || {};
  const columns = clamp(input.columns, LIMITS.minCols, LIMITS.maxCols, 6);
  const rows = clamp(input.rows, LIMITS.minRows, LIMITS.maxRows, 4);
  const known = {};
  catalog().forEach(function (c) { known[c.id] = c; });
  const list = Array.isArray(input.tiles) ? input.tiles : [];
  if (!list.length) throw bad('La HOME deve avere almeno un widget');
  if (list.length > LIMITS.maxTiles) throw bad('Al massimo ' + LIMITS.maxTiles + ' widget nella HOME');
  const tiles = list.map(function (t) {
    const c = known[t && (t.id || t.widget)];
    if (!c) throw bad('Widget non disponibile per la HOME: ' + (t && (t.id || t.widget)));
    if (c.minW > columns || c.minH > rows) throw bad(c.label + ' ha bisogno di almeno ' + c.minW + ' colonne e ' + c.minH + ' righe');
    const out = {
      id: c.id,
      w: clamp(t.w, c.minW, columns, Math.min(c.w, columns)),
      h: clamp(t.h, c.minH, rows, Math.min(c.h, rows))
    };
    if (t.x !== undefined && t.y !== undefined && t.x !== null && t.y !== null) {
      out.x = clamp(t.x, 0, columns - out.w, 0);
      out.y = clamp(t.y, 0, rows - out.h, 0);
    }
    return out;
  });
  const p = pack(tiles, columns, rows);
  if (p.left.length) {
    const names = p.left.map(function (i) { return known[tiles[i].id].label; });
    throw bad('Non c\'è spazio per: ' + names.join(', ') + '. Rimpicciolisci qualche widget o aggiungi righe o colonne.');
  }
  p.placed.forEach(function (x) { tiles[x.index].x = x.x; tiles[x.index].y = x.y; });
  return { columns: columns, rows: rows, tiles: tiles };
}

function fromLayout(layout) {
  const h = layout && layout.homePage;
  if (!h || !Array.isArray(h.tiles) || !h.tiles.length) return null;
  const known = {};
  catalog().forEach(function (c) { known[c.id] = true; });
  const tiles = h.tiles.filter(function (t) { return t && known[t.id || t.widget]; });
  try { return clean(Object.assign({}, h, { tiles: tiles })); } catch (e) { return null; }
}

function apply(page, layout) {
  const h = fromLayout(layout);
  if (!h || !page || page.id !== HOME_ID) return page;
  const known = {};
  catalog().forEach(function (c) { known[c.id] = c; });
  return Object.assign({}, page, {
    columns: h.columns,
    rows: h.rows,
    autoGrid: false,
    tiles: h.tiles.map(function (t, i) {
      const c = known[t.id];
      return Object.assign({}, c.props || {}, { id: 'home-' + (i + 1) + '-' + t.id, widget: c.widget, x: t.x, y: t.y, w: t.w, h: t.h });
    })
  });
}

function catalogId(tile) {
  const hit = catalog().filter(function (c) {
    const props = c.props || {};
    return c.widget === tile.widget && Object.keys(props).every(function (k) { return tile[k] === props[k]; });
  })[0];
  return hit ? hit.id : null;
}

module.exports = { HOME_ID: HOME_ID, CATALOG: CATALOG, LIMITS: LIMITS, catalog: catalog, pack: pack, clean: clean, fromLayout: fromLayout, apply: apply, catalogId: catalogId };
