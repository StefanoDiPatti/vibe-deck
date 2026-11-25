(function () {
  'use strict';

  var TOP_H = 44;
  var TABS_H = 58;
  var BACKOFF = [2000, 4000, 8000, 15000];

  var app = {
    cfg: null,
    version: null,
    page: null,
    tiles: [],
    state: null,
    failures: 0,
    pollTimer: null,
    online: false,
    inflight: {}
  };

  var stage = D.$('stage'), tabs = D.$('tabs'), banner = D.$('banner');

  var buildMeta = document.querySelector('meta[name="dock-build"]');
  var BUILD = buildMeta ? buildMeta.getAttribute('content') : '';
  function reloadPage() {
    var last = D.store.get('reloadAt', 0);
    if (new Date().getTime() - last < 60000) return;
    D.store.set('reloadAt', new Date().getTime());
    window.location.reload(true);
  }

  var toastTimer = null;
  app.toast = function (msg, kind) {
    if (!msg) return;
    var t = D.$('toast');
    D.setText(t, msg);
    t.className = 'show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, kind === 'err' ? 4000 : 2200);
  };

  function showModal(title, body) {
    var m = D.$('modal');
    D.setText(m.querySelector('.modal-title'), title);
    D.setText(m.querySelector('.modal-body'), body || '(nessun output)');
    D.removeClass(m, 'hidden');
  }
  D.bindTap(D.$('modal-close'), { onTap: function () { D.addClass(D.$('modal'), 'hidden'); } });

  function screenSize() {
    return { w: window.innerWidth || document.documentElement.clientWidth, h: window.innerHeight || document.documentElement.clientHeight };
  }
  function viewport() {
    var s = screenSize();
    return app.rotated ? { w: s.h, h: s.w } : s;
  }

  function rotate(focused) {
    var s = screenSize();
    var phone = Math.min(s.w, s.h) < 600;
    var want = phone && s.h > s.w;
    if (focused && app.rotated !== undefined) want = app.rotated;
    app.rotated = want;
    var b = document.body;
    D.toggleClass(b, 'rot', want);
    b.style.width = want ? s.h + 'px' : '';
    b.style.height = want ? s.w + 'px' : '';
    D.toggleClass(b, 'phone', phone);
  }

  function pack(tiles, cols, rows) {
    var grid = [], out = [], rest = [], r, c, k, t, w, h;
    for (r = 0; r < rows; r++) { grid[r] = []; for (c = 0; c < cols; c++) grid[r][c] = false; }
    function fits(x, y, w, h) {
      if (x < 0 || y < 0 || x + w > cols || y + h > rows) return false;
      for (var i = y; i < y + h; i++) for (var j = x; j < x + w; j++) if (grid[i][j]) return false;
      return true;
    }
    function take(t, x, y, w, h) {
      for (var i = y; i < y + h; i++) for (var j = x; j < x + w; j++) grid[i][j] = true;
      out.push({ tile: t, x: x, y: y, w: w, h: h });
    }
    for (k = 0; k < tiles.length; k++) {
      t = tiles[k]; w = Math.min(t.w || 1, cols); h = Math.min(t.h || 1, rows);
      if (typeof t.x === 'number' && typeof t.y === 'number' && fits(t.x, t.y, w, h)) take(t, t.x, t.y, w, h);
      else rest.push(t);
    }
    for (k = 0; k < rest.length; k++) {
      t = rest[k]; w = Math.min(t.w || 1, cols); h = Math.min(t.h || 1, rows);
      var placed = false;
      for (r = 0; r < rows && !placed; r++) {
        for (c = 0; c < cols && !placed; c++) {
          if (fits(c, r, w, h)) { take(t, c, r, w, h); placed = true; }
        }
      }
      if (!placed && window.console) console.warn('Tile senza spazio:', t.label || t.widget);
    }
    return out;
  }

  function layout() {
    var focused = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    rotate(focused);
    var v = viewport();
    var kb = focused && v.h < 380;
    D.toggleClass(document.body, 'kb-open', kb);
    if (!app.page) return;
    var cols = app.page.columns, rows = app.page.rows;
    var gap = v.w < 900 ? 6 : 8;
    var sw = stage.clientWidth || v.w;
    var sh = Math.max(100, stage.clientHeight || (v.h - (kb ? 0 : TOP_H + TABS_H)));
    app.lastSize = sw + 'x' + sh;
    var btns = [], gx = 0, gsw = sw, font = 0, i;
    for (i = 0; i < app.tiles.length; i++) if (app.tiles[i].side && !app.tiles[i].off) btns.push(app.tiles[i]);
    if (btns.length) {
      var area = Math.round(sw * (1 - (app.page.widgetWidth || 0.5)));
      var n = btns.length, bc = 1, best = 1e9;
      for (var c = 1; c <= n; c++) {
        var r = Math.ceil(n / c);
        var cwc = (area - gap * (c + 1)) / c, chc = (sh - gap * (r + 1)) / r;
        var score = Math.abs(Math.log((cwc / chc) / 1.25)) + 0.35 * (c * r - n);
        if (score < best) { best = score; bc = c; }
      }
      var br = Math.ceil(n / bc);
      var bcw = (area - gap * (bc + 1)) / bc, bch = (sh - gap * (br + 1)) / br;
      var last = n - (br - 1) * bc;
      var lcw = (area - gap * (last + 1)) / last;
      for (i = 0; i < n; i++) {
        var b = btns[i].el, inLast = Math.floor(i / bc) === br - 1, wcell = inLast ? lcw : bcw;
        b.style.left = Math.round(gap + (i % bc) * (wcell + gap)) + 'px';
        b.style.top = Math.round(gap + Math.floor(i / bc) * (bch + gap)) + 'px';
        b.style.width = Math.round(wcell) + 'px';
        b.style.height = Math.round(bch) + 'px';
        D.toggleClass(b, 'short', bch < 95);
      }
      font = Math.min(bcw * 0.12, bch * 0.15);
      gx = area - gap;
      gsw = sw - gx;
    }
    var cw = (gsw - gap * (cols + 1)) / cols;
    var ch = (sh - gap * (rows + 1)) / rows;
    stage.style.fontSize = Math.round(Math.max(12, Math.min(19, font || Math.min(cw * 0.12, ch * 0.15)))) + 'px';
    for (i = 0; i < app.tiles.length; i++) {
      var p = app.tiles[i];
      p.el.style.display = p.off ? 'none' : '';
      if (p.side) continue;
      var left = Math.round(gx + gap + p.x * (cw + gap));
      var topPx = Math.round(gap + p.y * (ch + gap));
      var w = Math.round(p.w * cw + (p.w - 1) * gap);
      var h = Math.round(p.h * ch + (p.h - 1) * gap);
      p.el.style.left = left + 'px';
      p.el.style.top = topPx + 'px';
      p.el.style.width = w + 'px';
      p.el.style.height = h + 'px';
      D.toggleClass(p.el, 'short', h < 95);
      if (p.widget) p.widget.resize(w, h);
    }
  }

  app.setOff = function (p, off) {
    off = !!off;
    if (!!p.off === off) return;
    p.off = off;
    layout();
  };

  function findPage(id) {
    var pages = app.cfg.dock.pages;
    for (var i = 0; i < pages.length; i++) if (pages[i].id === id) return pages[i];
    return null;
  }

  function buildTabs() {
    tabs.innerHTML = '';
    var pages = app.cfg.dock.pages, list = [];
    for (var i = 0; i < pages.length; i++) if (pages[i].tab) list.push(pages[i]);
    for (var j = 0; j < list.length; j++) (function (p) {
      var t = D.el('div', 'tab');
      t.setAttribute('data-page', p.id);
      t.style.width = (100 / list.length) + '%';
      t.innerHTML = Icons.html(p.icon) + '<span>' + D.esc(p.title) + '</span>';
      D.bindTap(t, { onTap: function () { showPage(p.id); } });
      tabs.appendChild(t);
    })(list[j]);
    D.toggleClass(document.body, 'no-tabs', !list.length);
  }

  function tabPages() {
    var pages = app.cfg ? app.cfg.dock.pages : [], list = [];
    for (var i = 0; i < pages.length; i++) if (pages[i].tab) list.push(pages[i].id);
    return list;
  }

  app.swipeGuards = [
    function (t) { return !!D.closestAttr(t, 'data-noswipe', stage); },
    function (t) { return !!D.closestClass(t, 'sh-track', stage); },
    function (t) { return !!D.closestAttr(t, 'data-win', stage); },
    function (t) { return /INPUT|TEXTAREA|SELECT/.test(t.tagName || ''); },
    function (t) {
      for (var n = t; n && n !== stage && n.nodeType === 1; n = n.parentNode) {
        if (n.scrollWidth > n.clientWidth + 4 && D.hasClass(n, 'scroll')) return true;
      }
      return false;
    }
  ];
  function swipeVetoed(t) {
    for (var i = 0; i < app.swipeGuards.length; i++) {
      try { if (app.swipeGuards[i](t)) return true; } catch (e) { }
    }
    return false;
  }
  function animateStage(cls) {
    D.removeClass(stage, 'sw-next'); D.removeClass(stage, 'sw-prev');
    D.removeClass(stage, 'sw-end-l'); D.removeClass(stage, 'sw-end-r');
    void stage.offsetWidth;
    D.addClass(stage, cls);
    clearTimeout(app.swipeAnim);
    app.swipeAnim = setTimeout(function () { D.removeClass(stage, cls); }, 400);
  }
  app.swipePage = function (dir) {
    var list = tabPages(), i = app.page ? list.indexOf(app.page.id) : -1;
    if (i < 0) return false;
    var j = i + dir;
    if (j < 0 || j >= list.length) { animateStage(dir > 0 ? 'sw-end-l' : 'sw-end-r'); return false; }
    showPage(list[j]);
    animateStage(dir > 0 ? 'sw-next' : 'sw-prev');
    return true;
  };
  (function () {
    var sw = null;
    function pt(e) {
      var t = e.changedTouches ? e.changedTouches[0] : e;
      return app.rotated ? { x: t.clientY, y: -t.clientX } : { x: t.clientX, y: t.clientY };
    }
    stage.addEventListener('touchstart', function (e) {
      sw = null;
      if (e.touches.length !== 1 || swipeVetoed(e.target)) return;
      var p = pt(e);
      sw = { x: p.x, y: p.y, t: new Date().getTime() };
    }, false);
    stage.addEventListener('touchmove', function (e) {
      if (!sw) return;
      if (e.touches.length > 1) { sw = null; return; }
      var p = pt(e.touches[0] ? { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY } : e);
      if (Math.abs(p.x - sw.x) > 10 && Math.abs(p.x - sw.x) > Math.abs(p.y - sw.y)) e.preventDefault();
    }, false);
    stage.addEventListener('touchcancel', function () { sw = null; }, false);
    stage.addEventListener('touchend', function (e) {
      if (!sw) return;
      var p = pt(e), dx = p.x - sw.x, dy = p.y - sw.y, dt = new Date().getTime() - sw.t;
      sw = null;
      var min = Math.max(60, Math.min(140, stage.clientWidth * 0.12));
      if (dt > 900 || Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.8) return;
      app.swipePage(dx < 0 ? 1 : -1);
    }, false);
  })();

  function markTab() {
    var all = tabs.childNodes;
    for (var i = 0; i < all.length; i++) D.toggleClass(all[i], 'active', all[i].getAttribute('data-page') === app.page.id);
  }

  function destroyTiles() {
    for (var i = 0; i < app.tiles.length; i++) if (app.tiles[i].widget) app.tiles[i].widget.destroy();
    app.tiles = [];
    stage.innerHTML = '';
  }

  function showPage(id) {
    var page = findPage(id) || findPage(app.cfg.dock.home) || app.cfg.dock.pages[0];
    destroyTiles();
    app.page = page;
    D.store.set('page', page.id);
    D.setText(D.$('page-title'), page.title);
    var gridTiles = page.tiles, sideTiles = [], i;
    if (page.buttonGrid) {
      gridTiles = [];
      for (i = 0; i < page.tiles.length; i++) (page.tiles[i].widget ? gridTiles : sideTiles).push(page.tiles[i]);
    }
    var placed = pack(gridTiles, page.columns, page.rows);
    for (i = 0; i < sideTiles.length; i++) placed.push({ tile: sideTiles[i], side: true });
    for (i = 0; i < placed.length; i++) {
      var p = placed[i];
      p.el = p.tile.widget ? makeWidget(p) : makeButton(p.tile);
      stage.appendChild(p.el);
      app.tiles.push(p);
    }
    if (!placed.length) stage.appendChild(D.el('div', 'empty', 'Pagina vuota: aggiungi tile in config/dock.json'));
    markTab();
    layout();
    if (app.state) paintTiles(app.state);
  }

  function paintTiles(s) {
    for (var i = 0; i < app.tiles.length; i++) {
      var t = app.tiles[i];
      if (t.widget) t.widget.update(s);
      else if (s.apps) {
        var appId = t.tile.showRunning || (t.tile.action && t.tile.action.type === 'launch' ? t.tile.action.app : null);
        if (appId) D.toggleClass(t.el, 'running', !!s.apps[appId]);
      }
    }
  }

  function makeWidget(p) {
    if (!Widgets.types[p.tile.widget]) reloadPage();
    var root = D.el('div', 'tile widget');
    p.widget = Widgets.create(p.tile.widget, root, p.tile, app);
    return root;
  }

  function makeButton(tile) {
    var b = D.el('div', 'tile btn' + (tile.confirm ? ' confirm' : ''));
    var icon = Icons.html(tile.icon);
    if (!icon && !tile.image) D.addClass(b, 'no-icon');
    var pic = tile.image ? '<div class="t-icon t-img" style="background-image:url(\'' + D.esc(tile.image).replace(/'/g, '%27') + '\')"></div>' : '';
    if (tile.image) D.addClass(b, 'has-img');
    b.innerHTML = (pic || (icon ? '<div class="t-icon">' + icon + '</div>' : '')) +
      '<div class="t-label">' + D.esc(tile.label || '') + '</div>' +
      (tile.sub ? '<div class="t-sub">' + D.esc(tile.sub) + '</div>' : '') +
      (tile.confirm ? '<div class="t-hold"><i></i></div>' : '');
    if (tile.color) tint(b, tile.color);
    D.bindTap(b, {
      hold: tile.confirm ? 900 : 0,
      repeat: !!tile.repeat,
      onTap: function () { press(tile, b); }
    });
    return b;
  }

  function flash(node, cls) {
    D.removeClass(node, 'ok'); D.removeClass(node, 'err');
    D.addClass(node, cls);
    setTimeout(function () { D.removeClass(node, cls); }, 450);
  }

  function press(tile, node) {
    var a = tile.action || {};
    if (a.type === 'page') { showPage(a.page || a.pageId); return; }
    if (app.inflight[tile.id]) return;
    app.inflight[tile.id] = true;
    D.addClass(node, 'busy');
    D.api.post('/api/press', { page: app.page.id, tile: tile.id, version: app.version }, function (err, r) {
      app.inflight[tile.id] = false;
      D.removeClass(node, 'busy');
      if (err) {
        flash(node, 'err');
        if (err.code === 'CONFIG_CHANGED') { app.toast('Configurazione aggiornata', 'info'); loadConfig(); return; }
        app.toast(err.message, 'err');
        return;
      }
      flash(node, 'ok');
      if (a.type === 'launch') { clearTimeout(app.pollTimer); app.pollTimer = setTimeout(poll, 1800); }
      if (r && r.event) for (var i = 0; i < app.tiles.length; i++) if (app.tiles[i].widget && app.tiles[i].widget.event) app.tiles[i].widget.event(r.event.name, r.event.data);
      if (r && r.output !== undefined) showModal(tile.label || 'Output', r.output);
      else if (r && r.message) app.toast(r.message, 'ok');
    }, 125000);
  }

  function speed(kbps) {
    if (kbps === null || kbps === undefined) return '…';
    return kbps < 1000 ? kbps + ' kbit/s' : (Math.round(kbps / 100) / 10) + ' Mbit/s';
  }

  function fmtTop(s) {
    var sys = s.system;
    if (!sys) return '';
    var parts = [];
    var n = sys.net;
    if (n) {
      var name = n.type === 'wifi' ? 'Wi-Fi ' + (n.name || '') + (n.signal !== null && n.signal !== undefined ? ' ' + n.signal + '%' : '')
        : (n.name || 'Rete');
      parts.push(name + (n.downKbps !== null && n.downKbps !== undefined ? '   ↓ ' + speed(n.downKbps) + '   ↑ ' + speed(n.upKbps) : ''));
    }
    return parts.join('    ');
  }

  function setOnline(on, retryMs) {
    app.online = on;
    D.toggleClass(D.$('status-dot'), 'on', on);
    D.setText(D.$('host'), on ? (app.cfg ? app.cfg.hostname : 'PC') : 'OFFLINE');
    if (on) { D.addClass(banner, 'hidden'); showOffline(false); return; }
    D.removeClass(banner, 'hidden');
    D.setText(banner, 'CONNESSIONE PERSA  ·  nuovo tentativo tra ' + Math.round(retryMs / 1000) + 's');
  }

  var offlineRetry = null;
  function showOffline(on, retryMs, retry) {
    var el = D.$('offline');
    if (!on) { offlineRetry = null; D.addClass(el, 'hidden'); return; }
    offlineRetry = retry;
    D.setText(D.$('offline-host'), window.location.host || 'il PC');
    D.setText(D.$('offline-wait'), 'Nuovo tentativo automatico tra ' + Math.round(retryMs / 1000) + ' s');
    D.removeClass(el, 'hidden');
  }
  D.bindTap(D.$('offline-go'), { onTap: function () {
    var f = offlineRetry;
    if (!f) return;
    D.setText(D.$('offline-wait'), 'Provo a collegarmi…');
    f();
  } });

  function poll() {
    clearTimeout(app.pollTimer);
    D.api.get('/api/state', function (err, s) {
      if (err) {
        if (err.status === 401) return;
        var wait = BACKOFF[Math.min(app.failures, BACKOFF.length - 1)];
        app.failures++;
        if (app.failures >= 2) setOnline(false, wait);
        if (app.failures >= 3) showOffline(true, wait, function () { app.failures = 2; poll(); });
        app.pollTimer = setTimeout(poll, wait);
        return;
      }
      app.failures = 0;
      app.state = s;
      setOnline(true);
      D.setText(D.$('mini'), fmtTop(s));
      if (s.build && BUILD && s.build !== BUILD) { reloadPage(); return; }
      if (s.version !== app.version || (s.themesV && app.cfg && s.themesV !== app.cfg.themesV)) { loadConfig(); return; }
      if (app.page && stage.clientWidth + 'x' + stage.clientHeight !== app.lastSize) layout();
      paintTiles(s);
      schedulePoll();
    }, 6000);
  }

  function powerCfg() {
    return (app.cfg && app.cfg.power) || { idleAfterSec: 60, pollSec: 3, idlePollSec: 15, sleepAfterMin: 10 };
  }
  function schedulePoll() {
    clearTimeout(app.pollTimer);
    var st = D.power.state();
    if (st === 'asleep' || D.power.isHidden()) return;
    var p = powerCfg();
    app.pollTimer = setTimeout(poll, (st === 'active' ? p.pollSec : p.idlePollSec) * 1000);
  }
  D.power.onWake(function () { if (app.cfg && app.online !== false) { clearTimeout(app.pollTimer); poll(); } });

  var saver = D.el('div', 'saver hidden');
  saver.innerHTML = '<div class="saver-clock"></div><div class="saver-hint">tocca per riattivare</div>';
  document.body.appendChild(saver);
  var saverClock = saver.firstChild;
  function paintSaver() {
    var n = new Date();
    D.setText(saverClock, D.pad(n.getHours()) + ':' + D.pad(n.getMinutes()));
    var v = viewport();
    var cw = saverClock.offsetWidth || 300, ch = saverClock.offsetHeight || 110;
    saverClock.style.left = Math.round(Math.random() * Math.max(0, v.w - cw - 10)) + 'px';
    saverClock.style.top = Math.round(Math.random() * Math.max(0, v.h - ch - 40)) + 'px';
  }
  function sleepNow() {
    if (D.power.state() === 'asleep') return;
    D.power.sleep();
    clearTimeout(app.pollTimer);
    D.removeClass(saver, 'hidden');
    paintSaver();
  }
  function wakeUp(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (D.power.state() !== 'asleep') return;
    D.addClass(saver, 'waking');
    D.power.wake();
    setTimeout(function () { D.addClass(saver, 'hidden'); D.removeClass(saver, 'waking'); }, 700);
  }
  saver.addEventListener('touchstart', wakeUp, false);
  saver.addEventListener('mousedown', wakeUp, false);
  saver.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); }, false);
  setInterval(function () {
    var mins = powerCfg().sleepAfterMin;
    if (D.power.state() === 'asleep') { paintSaver(); return; }
    if (mins > 0 && !D.store.get('awake', false) && app.cfg && !D.$('pair').offsetParent && new Date().getTime() - D.power.lastInput() > mins * 60000) sleepNow();
  }, 30000);

  function loadConfig() {
    D.api.get('/api/config', function (err, cfg) {
      D.addClass(D.$('boot'), 'hidden');
      if (err) {
        if (err.status === 401) return;
        setOnline(false, 4000);
        showOffline(true, 4000, loadConfig);
        clearTimeout(app.cfgTimer);
        app.cfgTimer = setTimeout(loadConfig, 4000);
        return;
      }
      var first = !app.cfg;
      app.cfg = cfg;
      D.power.configure(cfg.power);
      app.version = cfg.version;
      document.title = cfg.dock.title;
      syncTheme();
      buildTabs();
      var fromHash = window.location.hash ? window.location.hash.replace(/^#\/?/, '') : '';
      showPage(app.page ? app.page.id : (fromHash && findPage(fromHash) ? fromHash : D.store.get('page', cfg.dock.home)));
      setOnline(true);
      if (cfg.errors && cfg.errors.length) app.toast(cfg.errors[0], 'err');
      if (first) poll(); else { clearTimeout(app.pollTimer); app.pollTimer = setTimeout(poll, 500); }
    }, 10000);
  }

  function showPair(msg) {
    clearTimeout(app.pollTimer);
    D.addClass(D.$('boot'), 'hidden');
    D.removeClass(D.$('pair'), 'hidden');
    if (msg) D.setText(D.$('pair-msg'), msg);
  }
  var MAX_CODES = 6;
  var autoPairing = false;

  function knownCodes() {
    var list = D.store.get('tokens', []);
    if (!(list instanceof Array)) list = [];
    var cur = D.store.get('token', '');
    if (cur && list.indexOf(cur) < 0) list.unshift(cur);
    return list;
  }
  function rememberCode(code) {
    var list = knownCodes(), out = [code], i;
    for (i = 0; i < list.length && out.length < MAX_CODES; i++) if (list[i] !== code) out.push(list[i]);
    D.store.set('tokens', out);
    D.store.set('token', code);
  }

  function tryKnownCodes(done) {
    var list = knownCodes(), i = 0;
    if (autoPairing) return;
    autoPairing = true;
    function next() {
      if (i >= list.length) { autoPairing = false; done(false); return; }
      var code = list[i++];
      D.api.post('/api/pair', { token: code }, function (err) {
        if (!err) { autoPairing = false; rememberCode(code); done(true); return; }
        if (err.status === 401) { next(); return; }
        autoPairing = false; done(false);
      });
    }
    next();
  }

  D.setUnauthorizedHandler(function () {
    if (autoPairing) return;
    clearTimeout(app.pollTimer);
    tryKnownCodes(function (ok) {
      if (ok) window.location.reload();
      else showPair('Codice non più valido: inseriscilo di nuovo');
    });
  });

  function codeFromHash() {
    var m = /^#codice=([^&]+)/.exec(window.location.hash || '');
    if (!m) return;
    try { rememberCode(decodeURIComponent(m[1])); } catch (e) { }
    if (window.history && window.history.replaceState) window.history.replaceState(null, '', window.location.pathname);
    else window.location.hash = '';
  }

  function submitPair() {
    var input = D.$('pair-code');
    var code = input.value.replace(/\s+/g, '').toUpperCase();
    if (!code) return;
    autoPairing = true;
    D.api.post('/api/pair', { token: code }, function (err) {
      autoPairing = false;
      if (err) { D.setText(D.$('pair-msg'), err.message); return; }
      rememberCode(code);
      window.location.reload();
    });
  }
  D.bindTap(D.$('pair-go'), { onTap: submitPair });
  D.$('pair-code').addEventListener('keydown', function (e) { if (e.keyCode === 13) submitPair(); }, false);

  var BUILTIN = [
    { id: 'classic', name: 'Classico', style: 'classic', v: '', sw: ['#0b0f14', '#18212c', '#3d8bfd'] },
    { id: 'material', name: 'Material', style: 'material', v: '', sw: ['#111318', '#272a2f', '#a8c7fa'] },
    { id: 'neon', name: 'Neon Elgato', style: 'neon', v: '', sw: ['#050505', '#41d1ff', '#ff5c7a'] },
    { id: 'brutal', name: 'Neo-brutalista', style: 'brutal', v: '', sw: ['#f4efe3', '#ffd23f', '#111111'] }
  ];
  var STYLES = { classic: 1, material: 1, neon: 1, brutal: 1 };
  function themeList() { return app.cfg && app.cfg.themes && app.cfg.themes.length ? app.cfg.themes : BUILTIN; }
  function findTheme(id) {
    var list = themeList();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  app.theme = D.store.get('theme', 'classic');
  app.style = D.store.get('themeStyle', app.theme);
  app.themeV = D.store.get('themeV', '');
  if (!STYLES[app.style]) { app.theme = 'classic'; app.style = 'classic'; app.themeV = ''; }
  document.body.className += ' th-' + app.style;

  function mixHex(a, b, t) {
    function ch(h, i) { return parseInt(h.substr(1 + i * 2, 2), 16); }
    if (!/^#[0-9a-fA-F]{6}$/.test(a)) return a;
    var out = '#';
    for (var i = 0; i < 3; i++) {
      var v = Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16);
      out += v.length < 2 ? '0' + v : v;
    }
    return out;
  }
  function tint(b, color) {
    if (app.style === 'neon') {
      var light = mixHex(color, '#ffffff', 0.45);
      var svg = b.querySelector && b.querySelector('.t-icon svg');
      b.setAttribute('data-tint', light);
      if (svg) { svg.style.fill = light; svg.style.color = light; }
    } else if (app.style === 'brutal') {
      b.style.backgroundColor = mixHex(color, '#ffffff', 0.55);
    } else {
      b.style.backgroundColor = color;
    }
  }

  function themeLink(linkId, href) {
    var link = D.$(linkId), head = document.getElementsByTagName('head')[0];
    if (!href) { if (link) link.parentNode.removeChild(link); return; }
    if (!link) {
      link = document.createElement('link');
      link.id = linkId; link.rel = 'stylesheet';
    }
    if (link.getAttribute('href') !== href) link.href = href;
    head.appendChild(link);
  }
  function applyStyle(style) {
    themeLink('plugin-theme-css', style === 'classic' ? '' : 'plugins-theme/' + style + '.css');
    themeLink('theme-css', style === 'classic' ? '' : 'css/themes/' + style + '.css');
    if (style !== app.style) {
      D.removeClass(document.body, 'th-' + app.style);
      D.addClass(document.body, 'th-' + style);
      app.style = style;
    }
  }
  function applyTheme(t) {
    applyStyle(t.style);
    themeLink('custom-theme-css', t.v ? 'theme-css/' + t.id + '.css?v=' + t.v : '');
    var draft = D.$('theme-draft');
    if (draft) draft.parentNode.removeChild(draft);
    var changed = app.theme !== t.id || app.themeV !== (t.v || '');
    app.theme = t.id;
    app.themeV = t.v || '';
    D.store.set('theme', t.id);
    D.store.set('themeStyle', t.style);
    D.store.set('themeV', app.themeV);
    return changed;
  }
  function setTheme(id) {
    var t = findTheme(id);
    if (!t || (id === app.theme && (t.v || '') === app.themeV)) return;
    applyTheme(t);
    if (app.cfg && app.page) showPage(app.page.id);
  }
  function syncTheme() {
    if (app.previewing) return;
    var t = findTheme(app.theme) || findTheme(STYLES[app.style] ? app.style : 'classic') || BUILTIN[0];
    var before = app.style;
    if (applyTheme(t) && before !== app.style && app.cfg && app.page) showPage(app.page.id);
  }
  window.VibeTheme = {
    preview: function (style, css) {
      if (!STYLES[style]) return false;
      app.previewing = true;
      var before = app.style;
      applyStyle(style);
      themeLink('custom-theme-css', '');
      var el = D.$('theme-draft');
      if (!el) { el = document.createElement('style'); el.id = 'theme-draft'; }
      document.getElementsByTagName('head')[0].appendChild(el);
      if (el.styleSheet) el.styleSheet.cssText = css || ''; else el.textContent = css || '';
      if (before !== style && app.cfg && app.page) showPage(app.page.id);
      return true;
    }
  };

  var FLAGS = {
    it: '<svg class="flag" viewBox="0 0 3 2" width="30" height="20"><rect width="1" height="2" fill="#009246"/><rect x="1" width="1" height="2" fill="#fff"/><rect x="2" width="1" height="2" fill="#ce2b37"/></svg>',
    en: '<svg class="flag" viewBox="0 0 60 40" width="30" height="20"><rect width="60" height="40" fill="#012169"/>' +
      '<path d="M0,0 L60,40 M60,0 L0,40" stroke="#fff" stroke-width="8"/><path d="M0,0 L60,40 M60,0 L0,40" stroke="#c8102e" stroke-width="3"/>' +
      '<path d="M30,0 V40 M0,20 H60" stroke="#fff" stroke-width="12"/><path d="M30,0 V40 M0,20 H60" stroke="#c8102e" stroke-width="7"/></svg>'
  };
  var LANGS = [{ code: 'it', name: 'Italiano' }, { code: 'en', name: 'English' }];
  var refreshBtn = D.$('refresh-btn');
  refreshBtn.innerHTML = Icons.html('refresh');
  refreshBtn.setAttribute('title', 'Aggiorna');
  D.bindTap(refreshBtn, { onTap: function () {
    D.addClass(refreshBtn, 'spin');
    setTimeout(function () { window.location.reload(true); }, 150);
  } });

  var setBtn = D.$('settings-btn');
  setBtn.innerHTML = Icons.html('settings');
  setBtn.setAttribute('title', 'Impostazioni');
  var setMenu = null;
  function closeSettings() { if (setMenu) { setMenu.parentNode.removeChild(setMenu); setMenu = null; } }
  function openSettings() {
    closeSettings();
    setMenu = D.el('div', 'theme-layer');
    var i, html = '<div class="theme-menu set-menu"><div class="set-col"><div class="theme-h">TEMA</div><div class="set-themes scroll">';
    var tl = themeList();
    for (i = 0; i < tl.length; i++) {
      var t = tl[i], sw = '';
      for (var k = 0; k < t.sw.length; k++) sw += '<i style="background:' + t.sw[k] + '"></i>';
      html += '<div class="theme-opt' + (t.custom ? ' notr' : '') + (t.id === app.theme ? ' on' : '') + '" data-theme="' + t.id + '"><span class="theme-sw">' + sw + '</span>' + D.esc(t.name) + '</div>';
    }
    html += '</div></div><div class="set-col set-col2"><div class="theme-h">LINGUA</div>';
    var now = I18n.lang() === 'en' ? 'en' : 'it';
    for (i = 0; i < LANGS.length; i++) {
      var l = LANGS[i];
      var flag = Icons.has('home') ? FLAGS[l.code] : '<b class="set-code">' + l.code.toUpperCase() + '</b>';
      html += '<div class="theme-opt notr' + (l.code === now ? ' on' : '') + '" data-lang="' + l.code + '"><span class="set-flag">' + flag + '</span>' + l.name + '</div>';
    }
    html += '<div class="theme-h set-h2">SCHERMO</div>' +
      '<div class="theme-opt set-awake' + (D.store.get('awake', false) ? ' on' : '') + '" data-awake="1">' + 'Sempre attivo' + '<span class="set-tog"><i></i></span></div>' +
      '<div class="set-desc">Niente schermata con l\'ora per il risparmio energetico.</div>';
    setMenu.innerHTML = html + '</div></div>';
    document.body.appendChild(setMenu);
    var lst = setMenu.querySelector('.set-themes');
    if (lst) lst.style.maxHeight = Math.max(120, Math.min(344, viewport().h - setMenu.firstChild.offsetTop - lst.offsetTop - 24)) + 'px';
    D.bindTap(setMenu, {
      scrollable: true,
      onTap: function (t) {
        var aw = D.closestAttr(t, 'data-awake', setMenu);
        if (aw) {
          var on = !D.store.get('awake', false);
          D.store.set('awake', on);
          if (on) D.addClass(aw, 'on'); else D.removeClass(aw, 'on');
          return;
        }
        var th = D.closestAttr(t, 'data-theme', setMenu);
        var lg = D.closestAttr(t, 'data-lang', setMenu);
        closeSettings();
        if (th) setTheme(th.getAttribute('data-theme'));
        if (lg && lg.getAttribute('data-lang') !== now) I18n.set(lg.getAttribute('data-lang'));
      }
    });
  }
  D.bindTap(setBtn, { onTap: function () { if (setMenu) closeSettings(); else openSettings(); } });
  I18n.watch();

  function clock() {
    var n = new Date();
    D.setText(D.$('clock'), D.pad(n.getHours()) + ':' + D.pad(n.getMinutes()));
  }
  setInterval(clock, 10000);
  clock();

  D.bindTap(D.$('clock'), {
    onTap: function () {
      var de = document.documentElement;
      var req = de.requestFullscreen || de.webkitRequestFullscreen || de.webkitRequestFullScreen;
      if (req) req.call(de);
      else window.scrollTo(0, 1);
    }
  });
  D.bindTap(D.$('home-btn'), { onTap: function () { if (app.cfg) showPage(app.cfg.dock.home); } });

  document.addEventListener('touchmove', function (e) {
    if (!D.closestClass(e.target, 'scroll') && !/TEXTAREA|SELECT|INPUT/.test(e.target.tagName)) e.preventDefault();
  }, false);

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    layout();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 150);
  }, false);
  window.addEventListener('orientationchange', function () { setTimeout(layout, 300); }, false);
  document.addEventListener('focusin', function () { setTimeout(layout, 350); }, false);
  document.addEventListener('focusout', function () { setTimeout(layout, 350); }, false);

  function onVisibility() {
    if (!D.power.isHidden() && app.cfg && D.power.state() !== 'asleep') { app.failures = 0; poll(); }
  }
  document.addEventListener('visibilitychange', onVisibility, false);
  document.addEventListener('webkitvisibilitychange', onVisibility, false);

  var bootFails = 0, bootTimer = null;
  function boot() {
    clearTimeout(bootTimer);
    layout();
    D.api.get('/api/health', function (err, h) {
      if (err) {
        bootFails++;
        D.setText(D.$('boot-msg'), 'Il PC non risponde. Nuovo tentativo…');
        if (bootFails >= 2) showOffline(true, 3000, boot);
        bootTimer = setTimeout(boot, 3000);
        return;
      }
      showOffline(false);
      if (!h.paired) { showPair(); return; }
      loadConfig();
    }, 6000);
  }
  boot();
})();
