(function () {
  'use strict';
  I18n.add({
    'Uscite e microfoni (predefinito, volume, mute) e volume di ogni app': 'Outputs and microphones (default, volume, mute) and per-app volume',
    'Ingresso': 'Input', 'Nessun dispositivo': 'No devices'
  });
  var H = Widgets.helpers, el = H.el, header = H.header, setHtml = H.setHtml, smallBtn = H.smallBtn, level = H.level, dictation = H.dictation, guideHtml = H.guideHtml, setText = D.setText;

  Widgets.register('audio', function (root, tile, app) {
    D.addClass(root, 'w-audio');
    root.innerHTML =
      '<div class="au-left">' +
        '<div class="au-h">' + Icons.html('volup') + 'USCITA</div><div class="au-list au-out scroll"></div>' +
        '<div class="au-h au-h2">' + Icons.html('mic') + 'INGRESSO</div><div class="au-list au-in scroll"></div>' +
      '</div>' +
      '<div class="au-right"><div class="au-h">' + Icons.html('apps') + 'APP</div><div class="au-list au-apps scroll"></div></div>';
    function q(c) { return root.querySelector('.' + c); }
    var outEl = q('au-out'), inEl = q('au-in'), appsEl = q('au-apps');
    var data = null, alive = true, last = '', busy = 0;

    function ctl(kind, it, mic) {
      var v = it.volume === null ? 0 : it.volume;
      var muteIcon = mic ? 'micoff' : 'mute';
      return '<div class="au-ctl' + (it.mute ? ' muted' : '') + '" data-kind="' + kind + '" data-id="' + D.esc(it.id) + '">' +
        '<span class="au-b au-mute" data-act="mute">' + Icons.html(muteIcon) + '</span>' +
        '<span class="au-b" data-act="down">' + Icons.html('voldown') + '</span>' +
        '<span class="au-bar" data-act="bar"><i style="width:' + v + '%"></i></span>' +
        '<span class="au-b" data-act="up">' + Icons.html('volup') + '</span>' +
        '<span class="au-pct">' + (it.volume === null ? '–' : v + '%') + '</span></div>';
    }
    function devices(flow) {
      var html = '';
      for (var i = 0; data && i < data.devices.length; i++) {
        var d = data.devices[i];
        if (d.flow !== flow) continue;
        html += '<div class="au-dev' + (d.default ? ' on' : '') + '">' +
          '<div class="au-name" data-def="' + D.esc(d.id) + '">' + (d.default ? Icons.html('check') : '<i class="au-radio"></i>') + '<span class="notr">' + D.esc(d.name) + '</span></div>' +
          (d.default ? ctl('device', d, flow === 'in') : '') + '</div>';
      }
      return html || '<div class="empty">Nessun dispositivo</div>';
    }
    function render() {
      if (!data) return;
      var key = JSON.stringify(data);
      if (key === last) return;
      last = key;
      outEl.innerHTML = devices('out');
      inEl.innerHTML = devices('in');
      var html = '';
      for (var i = 0; i < data.apps.length; i++) {
        var a = data.apps[i];
        html += '<div class="au-app' + (a.active ? ' active' : '') + '"><div class="au-name">' + (a.active ? '<i class="au-live"></i>' : '') + D.esc(a.name) +
          '<span class="au-sub">' + D.esc(a.device) + '</span></div>' + ctl('app', a, false) + '</div>';
      }
      appsEl.innerHTML = html || '<div class="empty">Nessuna app sta usando l\'audio</div>';
    }
    function load() {
      if (busy) return;
      D.api.get('/api/plugins/audio', function (err, d) {
        if (!alive || busy) return;
        if (err) { appsEl.innerHTML = '<div class="empty err">' + D.esc(err.message) + '</div>'; return; }
        data = d;
        render();
      });
    }
    function post(url, body) {
      busy++;
      D.api.post(url, body, function (err, d) {
        busy--;
        if (err) return app.toast(err.message, 'err');
        data = d;
        render();
      });
    }

    function onTap(target, x, list) {
      var def = D.closestAttr(target, 'data-def', list);
      if (def) {
        var row = def.parentNode;
        if (D.hasClass(row, 'on')) return;
        D.addClass(row, 'pressed');
        return post('/api/plugins/audio/default', { id: def.getAttribute('data-def') });
      }
      var act = D.closestAttr(target, 'data-act', list);
      var box = D.closestAttr(target, 'data-id', list);
      if (!act || !box) return;
      var url = box.getAttribute('data-kind') === 'app' ? '/api/plugins/audio/app' : '/api/plugins/audio/device';
      var id = box.getAttribute('data-id'), a = act.getAttribute('data-act');
      if (a === 'mute') return post(url, { id: id, mute: 'toggle' });
      if (a === 'up' || a === 'down') return post(url, { id: id, delta: a === 'up' ? 5 : -5 });
      var r = act.getBoundingClientRect();
      var v = Math.round(Math.max(0, Math.min(1, (x - r.left) / (r.right - r.left))) * 100);
      var fill = act.firstChild;
      if (fill) fill.style.width = v + '%';
      post(url, { id: id, volume: v });
    }
    D.bindTap(outEl, { scrollable: true, onTap: function (t, x) { onTap(t, x, outEl); } });
    D.bindTap(inEl, { scrollable: true, onTap: function (t, x) { onTap(t, x, inEl); } });
    D.bindTap(appsEl, { scrollable: true, onTap: function (t, x) { onTap(t, x, appsEl); } });

    load();
    var timer = D.every(2000, 10000, load);
    return {
      update: function () {},
      resize: function () {},
      destroy: function () { alive = false; D.stop(timer); }
    };
  });
})();
