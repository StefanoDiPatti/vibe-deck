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
      resize: function () {},
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
      resize: function () {},
      destroy: function () {}
    };
  });
})();
