(function () {
  'use strict';
  I18n.add({
    'Giochi': 'Games',
    'I tuoi giochi, aggiunti dal pannello di controllo (pallino verde se aperti)': 'Your games, added from the control panel (green dot when open)',
    'Aggiungi i giochi dal pannello di controllo sul PC': 'Add your games from the control panel on the PC',
    'Aggiungi i giochi': 'Add your games',
    'Gioco non trovato: aggiungilo dal pannello di controllo': 'Game not found: add it from the control panel'
  });
  var H = Widgets.helpers, el = H.el, header = H.header, setHtml = H.setHtml, smallBtn = H.smallBtn, level = H.level, dictation = H.dictation, guideHtml = H.guideHtml, setText = D.setText;

  function pageGames(app) {
    var pages = (app.cfg && app.cfg.dock && app.cfg.dock.pages) || [];
    for (var i = 0; i < pages.length; i++) if (pages[i].id === 'games') return pages[i].tiles || [];
    return [];
  }

  function picHtml(g) {
    return g.image ? '<i class="gm-pic" style="background-image:url(\'' + D.esc(g.image).replace(/'/g, '%27') + '\')"></i>' : '<i class="gm-pic">' + Icons.html(g.icon || 'gamepad') + '</i>';
  }

  function launch(app, g, node) {
    if (!g || D.hasClass(node, 'busy')) return;
    if (g.action && g.action.type === 'page') { app.toast('Aggiungi i giochi dal pannello di controllo sul PC', 'info'); return; }
    D.addClass(node, 'busy');
    D.api.post('/api/press', { page: 'games', tile: g.id }, function (err, r) {
      D.removeClass(node, 'busy');
      if (err) return app.toast(err.message, 'err');
      if (r && r.message) app.toast(r.message, 'ok');
    }, 60000);
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function px(n) { return Math.round(n) + 'px'; }
  function setStyle(node, css) { for (var k in css) if (css.hasOwnProperty(k)) node.style[k] = css[k]; }

  var ONE_LAYOUTS = {
    tall: {
      fits: function (w, h) { return h >= 90 && w <= h * 1.6; },
      apply: function (box, pic, txt) {
        setStyle(pic, { left: '', top: '', bottom: '', right: '', width: '', height: '' });
        setStyle(txt, { left: '', right: '', top: '', bottom: '', height: '', lineHeight: '', marginTop: '', fontSize: '', textAlign: '' });
      }
    },
    wide: {
      fits: function () { return true; },
      apply: function (box, pic, txt, w, h) {
        var pad = clamp(h * 0.08, 4, 10), side = h - pad * 2;
        var font = clamp(h * 0.24, 11, 22), line = Math.round(font * 1.3);
        setStyle(pic, { left: px(pad), top: px(pad), bottom: 'auto', right: 'auto', width: px(side), height: px(side) });
        setStyle(txt, { left: px(side + pad * 2.5), right: px(pad), top: '50%', bottom: 'auto', height: px(line), lineHeight: px(line), marginTop: px(-line / 2), fontSize: px(font), textAlign: 'left' });
      }
    }
  };

  function pickLayout(layouts, order, w, h) {
    for (var i = 0; i < order.length; i++) if (layouts[order[i]].fits(w, h)) return order[i];
    return order[order.length - 1];
  }

  var LIST_LAYOUTS = {
    normal: {
      fits: function (w, h) { return h >= 100; },
      item: function () { return { w: 88, h: 96, pic: 56, label: true, row: false }; }
    },
    compact: {
      fits: function (w, h) { return h >= 58; },
      item: function (h) { var pic = clamp(h - 30, 24, 56); return { w: Math.max(64, pic + 28), h: h - 2, pic: pic, label: true, row: false }; }
    },
    row: {
      fits: function () { return true; },
      item: function (h) { var hh = clamp(h - 2, 26, 56); return { w: 150, h: hh, pic: hh - 8, label: true, row: true }; }
    }
  };

  Widgets.register('game', function (root, tile, app) {
    D.addClass(root, 'w-game');
    var box = el('div', 'gm-one');
    root.appendChild(box);
    var game = null;
    function render() {
      var list = pageGames(app);
      game = null;
      for (var i = 0; i < list.length; i++) if (list[i].id === 'game_' + tile.game) game = list[i];
      setHtml(box, game ? picHtml(game) + '<span>' + D.esc(game.label) + '</span>' : '<div class="empty">Gioco non trovato: aggiungilo dal pannello di controllo</div>');
      layout();
    }
    function layout() {
      var pic = box.querySelector('.gm-pic'), txt = box.querySelector('span');
      var w = box.offsetWidth, h = box.offsetHeight;
      if (!pic || !txt || !w || !h) return;
      var name = pickLayout(ONE_LAYOUTS, ['tall', 'wide'], w, h);
      D.toggleClass(box, 'gm-wide', name === 'wide');
      ONE_LAYOUTS[name].apply(box, pic, txt, w, h);
    }
    D.bindTap(box, { onTap: function () {
      if (!game) { app.toast('Gioco non trovato: aggiungilo dal pannello di controllo', 'info'); return; }
      launch(app, game, box);
    } });
    render();
    return {
      update: function (s) {
        if (!s || !s.apps) return;
        D.toggleClass(box, 'running', !!(game && game.showRunning && s.apps[game.showRunning]));
      },
      resize: layout,
      destroy: function () {}
    };
  });

  Widgets.register('games', function (root, tile, app) {
    D.addClass(root, 'w-games');
    header(root, tile.title || 'GIOCHI');
    var list = el('div', 'gm-list scroll');
    root.appendChild(list);
    var games = [];
    function render() {
      games = pageGames(app);
      var h = '';
      for (var i = 0; i < games.length; i++) {
        var g = games[i];
        h += '<div class="gm-item" data-i="' + i + '">' + picHtml(g) + '<span>' + D.esc(g.label) + '</span></div>';
      }
      setHtml(list, h || '<div class="empty">Aggiungi i giochi dal pannello di controllo sul PC</div>');
      layout();
    }
    function layout() {
      if (!root.offsetHeight) return;
      D.toggleClass(root, 'gm-short', root.offsetHeight < 140);
      var avail = list.clientHeight;
      if (!avail) return;
      var name = pickLayout(LIST_LAYOUTS, ['normal', 'compact', 'row'], list.clientWidth, avail);
      var s = LIST_LAYOUTS[name].item(avail);
      D.toggleClass(list, 'gm-rows', s.row);
      var items = list.querySelectorAll('.gm-item');
      for (var i = 0; i < items.length; i++) {
        var it = items[i], pic = it.querySelector('.gm-pic'), txt = it.querySelector('span');
        var normal = name === 'normal';
        setStyle(it, { width: normal ? '' : px(s.w), height: normal ? '' : px(s.h), paddingTop: normal ? '' : (s.row ? '0' : '4px') });
        setStyle(pic, { width: normal ? '' : px(s.pic), height: normal ? '' : px(s.pic), marginTop: s.row ? px((s.h - s.pic) / 2) : '' });
        setStyle(txt, { lineHeight: s.row ? px(s.h) : '', marginTop: s.row || normal ? '' : '3px' });
      }
    }
    D.bindTap(list, { scrollable: true, onTap: function (t) {
      var it = D.closestAttr(t, 'data-i', list);
      if (it) launch(app, games[+it.getAttribute('data-i')], it);
    } });
    render();
    return {
      update: function (s) {
        if (!s || !s.apps) return;
        var items = list.querySelectorAll('.gm-item');
        for (var i = 0; i < items.length; i++) {
          var g = games[+items[i].getAttribute('data-i')];
          D.toggleClass(items[i], 'running', !!(g && g.showRunning && s.apps[g.showRunning]));
        }
      },
      resize: layout,
      destroy: function () {}
    };
  });
})();
