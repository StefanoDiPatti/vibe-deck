(function () {
  'use strict';
  I18n.add({
    'Giochi': 'Games',
    'I tuoi giochi, aggiunti dal pannello di controllo (pallino verde se aperti)': 'Your games, added from the control panel (green dot when open)',
    'Aggiungi i giochi dal pannello di controllo sul PC': 'Add your games from the control panel on the PC',
    'Aggiungi i giochi': 'Add your games'
  });
  var H = Widgets.helpers, el = H.el, header = H.header, setHtml = H.setHtml, smallBtn = H.smallBtn, level = H.level, dictation = H.dictation, guideHtml = H.guideHtml, setText = D.setText;

  Widgets.register('games', function (root, tile, app) {
    D.addClass(root, 'w-games');
    header(root, tile.title || 'GIOCHI');
    var list = el('div', 'gm-list scroll');
    root.appendChild(list);
    var games = [];
    function pageGames() {
      var pages = (app.cfg && app.cfg.pages) || [];
      for (var i = 0; i < pages.length; i++) if (pages[i].id === 'games') return pages[i].tiles || [];
      return [];
    }
    function render() {
      games = pageGames();
      var h = '';
      for (var i = 0; i < games.length; i++) {
        var g = games[i];
        var pic = g.image ? '<i class="gm-pic" style="background-image:url(\'' + D.esc(g.image).replace(/'/g, '%27') + '\')"></i>' : '<i class="gm-pic">' + Icons.html(g.icon || 'gamepad') + '</i>';
        h += '<div class="gm-item" data-i="' + i + '">' + pic + '<span>' + D.esc(g.label) + '</span></div>';
      }
      setHtml(list, h || '<div class="empty">Aggiungi i giochi dal pannello di controllo sul PC</div>');
    }
    D.bindTap(list, { scrollable: true, onTap: function (t) {
      var it = D.closestAttr(t, 'data-i', list);
      var g = it && games[+it.getAttribute('data-i')];
      if (!g || D.hasClass(it, 'busy')) return;
      if (g.action && g.action.type === 'page') { app.toast('Aggiungi i giochi dal pannello di controllo sul PC', 'info'); return; }
      D.addClass(it, 'busy');
      D.api.post('/api/press', { page: 'games', tile: g.id }, function (err, r) {
        D.removeClass(it, 'busy');
        if (err) return app.toast(err.message, 'err');
        if (r && r.message) app.toast(r.message, 'ok');
      }, 60000);
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
