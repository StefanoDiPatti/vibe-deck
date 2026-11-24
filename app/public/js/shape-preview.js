(function () {
  'use strict';

  var THEMES = { classic: true, material: true, neon: true, brutal: true };
  var tile = document.getElementById('sp-tile');
  var shown = null, shape = '', theme = 'classic';

  function setTheme(id) {
    if (!THEMES[id] || id === theme) return;
    D.removeClass(document.body, 'th-' + theme);
    theme = id;
    D.addClass(document.body, 'th-' + id);
    document.getElementById('theme-css').href = id === 'classic' ? 'data:text/css,' : 'css/themes/' + id + '.css';
  }

  function render(msg) {
    var v = msg.view;
    if (!v) return;
    if (msg.theme) setTheme(msg.theme);
    var w = Math.max(60, Math.round(msg.w || 300)), h = Math.max(50, Math.round(msg.h || 140));
    tile.style.width = w + 'px';
    tile.style.height = h + 'px';
    D.toggleClass(tile, 'short', h < 95);
    if (!shown || v.shape !== shape) {
      if (shown) shown.destroy();
      tile.innerHTML = '';
      tile.className = 'tile widget';
      shown = Shapes.show(tile, v);
      shape = v.shape;
    } else {
      shown.update(v);
    }
    shown.resize(w, h);
  }

  D.addClass(document.body, 'th-classic');
  window.addEventListener('message', function (e) {
    if (e.origin !== window.location.origin || !e.data || e.data.type !== 'shape-preview') return;
    render(e.data);
  }, false);
  if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'shape-preview-ready' }, window.location.origin);
})();
