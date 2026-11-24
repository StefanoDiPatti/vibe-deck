var Shapes = (function () {
  'use strict';

  var el = D.el, setText = D.setText;
  var MIN_EVERY_MS = 2000;
  var RETRY_MS = 10000;
  var COMPACT_BELOW = 80;
  var renderers = {};

  function register(name, factory) { renderers[name] = factory; }

  function clampNum(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function setClass(node, cls) { if (node.__cls !== cls) { node.className = cls; node.__cls = cls; } }

  function setBar(fill, bar, pct, lvl, base) {
    var w = (pct === null || pct === undefined ? 0 : clampNum(pct, 2, 100)) + '%';
    if (fill.__w !== w) { fill.style.width = w; fill.__w = w; }
    setClass(bar, (base || 'bar') + ' ' + (lvl || ''));
  }

  function flash(node, ok) {
    if (!node) return;
    D.addClass(node, ok ? 'ok' : 'err');
    setTimeout(function () { D.removeClass(node, 'ok'); D.removeClass(node, 'err'); }, 700);
  }

  function header(root, label) { return Widgets.helpers.header(root, label || ''); }

  register('value', function (ctx) {
    var title = header(ctx.root, '');
    var big = el('div', 'sh-big');
    var num = el('span', 'sh-num');
    var unit = el('span', 'sh-unit');
    big.appendChild(num); big.appendChild(unit);
    var sub = el('div', 'sh-sub');
    var bar = el('div', 'bar sh-bar');
    var fill = el('i', '');
    bar.appendChild(fill);
    ctx.root.appendChild(big); ctx.root.appendChild(sub); ctx.root.appendChild(bar);
    return {
      paint: function (v) {
        setText(title, v.label);
        setText(num, v.value === '' ? '—' : v.value);
        setText(unit, v.value === '' ? '' : v.unit);
        setText(sub, v.sub);
        bar.style.display = v.bar === null ? 'none' : '';
        if (v.bar !== null) setBar(fill, bar, v.bar, v.level, 'bar sh-bar');
        setClass(big, 'sh-big ' + (v.level || ''));
      },
      resize: function (w, h) {
        var room = h - 34 - (h > 120 ? 26 : 8);
        big.style.fontSize = clampNum(Math.round(room * 0.62), 20, 84) + 'px';
        sub.style.display = h > 120 ? '' : 'none';
      }
    };
  });

  register('bars', function (ctx) {
    var title = header(ctx.root, '');
    var list = el('div', 'm-list');
    ctx.root.appendChild(list);
    var rows = [], lastH = 0;
    function ensure(n) {
      while (rows.length < n) {
        var r = el('div', 'metric');
        var l = el('span', 'm-label');
        var b = el('div', 'bar');
        var f = el('i', '');
        b.appendChild(f);
        var val = el('span', 'm-val');
        r.appendChild(l); r.appendChild(b); r.appendChild(val);
        list.appendChild(r);
        rows.push({ row: r, label: l, bar: b, fill: f, val: val });
      }
      for (var i = 0; i < rows.length; i++) rows[i].row.style.display = i < n ? '' : 'none';
    }
    function layout() {
      var n = 0;
      for (var i = 0; i < rows.length; i++) if (rows[i].row.style.display !== 'none') n++;
      if (!n || !lastH) return;
      var rh = clampNum(Math.floor((lastH - 46) / n), 22, 56);
      list.style.fontSize = clampNum(Math.round(rh * 0.5), 12, 18) + 'px';
      for (var j = 0; j < n; j++) rows[j].row.style.height = rows[j].row.style.lineHeight = rh + 'px';
    }
    return {
      paint: function (v) {
        setText(title, v.label);
        ensure(v.rows.length);
        for (var i = 0; i < v.rows.length; i++) {
          var r = rows[i], d = v.rows[i];
          setText(r.label, d.label);
          setText(r.val, d.value);
          setClass(r.row, 'metric' + (d.bar === null ? ' m-nobar' : ''));
          if (d.bar !== null) setBar(r.fill, r.bar, d.bar, d.level);
        }
        layout();
      },
      resize: function (w, h) { lastH = h; layout(); }
    };
  });

  register('status', function (ctx) {
    var title = header(ctx.root, '');
    var line = el('div', 'sh-status');
    var dot = el('span', 'sh-dot');
    var text = el('span', 'sh-stext');
    line.appendChild(dot); line.appendChild(text);
    var sub = el('div', 'sh-sub');
    ctx.root.appendChild(line); ctx.root.appendChild(sub);
    return {
      paint: function (v) {
        setText(title, v.label);
        setText(text, v.text);
        setText(sub, v.sub);
        setClass(dot, 'sh-dot ' + (v.on ? 'on' : 'off'));
      },
      resize: function (w, h) {
        line.style.fontSize = clampNum(Math.round((h - 34) * 0.32), 16, 40) + 'px';
        sub.style.display = h > 120 ? '' : 'none';
      }
    };
  });

  register('text', function (ctx) {
    var title = header(ctx.root, '');
    var text = el('div', 'sh-text');
    var sub = el('div', 'sh-sub');
    ctx.root.appendChild(text); ctx.root.appendChild(sub);
    var lastW = 0, lastH = 0;
    function fit() {
      var withSub = lastH > 150 && !!sub.__text;
      sub.style.display = withSub ? '' : 'none';
      var len = Math.max(4, (text.__text || '').length);
      var byWidth = (lastW - 24) / (len * 0.55);
      var byHeight = (lastH - 42 - (withSub ? 40 : 12)) * 0.85;
      text.style.fontSize = clampNum(Math.round(Math.min(byWidth, byHeight)), 14, 64) + 'px';
    }
    return {
      paint: function (v) {
        setText(title, v.label);
        setText(text, v.text);
        text.__text = v.text;
        setText(sub, v.sub);
        sub.__text = v.sub;
        fit();
      },
      resize: function (w, h) { lastW = w; lastH = h; fit(); }
    };
  });

  register('buttons', function (ctx) {
    var title = header(ctx.root, '');
    var grid = el('div', 'sh-grid');
    ctx.root.appendChild(grid);
    var cells = [], lastW = 0, lastH = 0;
    function layout() {
      var n = cells.length;
      if (!n || !lastW) return;
      var gw = lastW - 24, gh = lastH - 34 - 18;
      var best = 1, bestScore = -1;
      for (var cols = 1; cols <= n; cols++) {
        var rows = Math.ceil(n / cols);
        var cw = gw / cols, ch = gh / rows;
        var score = Math.min(cw, ch * 1.6);
        if (score > bestScore) { bestScore = score; best = cols; }
      }
      var rowsN = Math.ceil(n / best);
      var cwPx = Math.floor(gw / best), chPx = Math.floor(gh / rowsN);
      for (var i = 0; i < n; i++) {
        var s = cells[i].node.style;
        s.left = (i % best) * cwPx + 'px';
        s.top = Math.floor(i / best) * chPx + 'px';
        s.width = (cwPx - 6) + 'px';
        s.height = (chPx - 6) + 'px';
        var fs = clampNum(Math.round(Math.min(chPx * 0.2, cwPx * 0.11)), 10, 16);
        var labelH = Math.round(fs * 1.3);
        var inner = chPx - 6;
        var iconSize = clampNum(Math.min(inner - labelH - 14, cwPx * 0.4), 0, 40);
        var flat = iconSize < 16;
        cells[i].node.style.fontSize = fs + 'px';
        cells[i].node.className = 'sh-btn' + (flat ? ' flat' : '');
        cells[i].node.style.paddingTop = flat ? '' : Math.max(0, Math.round((inner - iconSize - labelH - 4) / 2)) + 'px';
        var svg = cells[i].node.getElementsByTagName('svg')[0];
        if (svg && !flat) { svg.style.width = svg.style.height = iconSize + 'px'; }
      }
    }
    function build(list) {
      grid.innerHTML = '';
      cells = [];
      for (var i = 0; i < list.length; i++) {
        (function (index, b) {
          var node = el('div', 'sh-btn');
          node.innerHTML = (b.icon ? Icons.html(b.icon) : '') + '<span class="sh-blabel">' + D.esc(b.label) + '</span>';
          if (b.color) node.style.backgroundColor = b.color;
          D.bindTap(node, { onTap: function () { ctx.tap(index, node); } });
          grid.appendChild(node);
          cells.push({ node: node, sig: b.label + '|' + b.icon + '|' + b.color });
        })(i, list[i]);
      }
      layout();
    }
    return {
      paint: function (v) {
        setText(title, v.label);
        var sig = '';
        for (var i = 0; i < v.buttons.length; i++) sig += v.buttons[i].label + '|' + v.buttons[i].icon + '|' + v.buttons[i].color + ';';
        if (grid.__sig !== sig) { grid.__sig = sig; build(v.buttons); }
      },
      resize: function (w, h) { lastW = w; lastH = h; layout(); }
    };
  });

  register('list', function (ctx) {
    var title = header(ctx.root, '');
    var list = el('div', 'w-list sh-list scroll');
    ctx.root.appendChild(list);
    var view = null;
    function row(item, index, tap) {
      var icon = item.icon && Icons.has(item.icon) ? Icons.html(item.icon) : '';
      var r = el('div', 'sh-row' + (tap ? ' tap' : '') + (icon ? ' has-icon' : ''));
      r.innerHTML = (icon ? '<div class="sh-ricon">' + icon + '</div>' : '') + '<div class="sh-rtop"><span class="sh-rright">' + D.esc(item.right) + '</span><span class="sh-rtitle">' + D.esc(item.title) + '</span></div>' +
        (item.sub ? '<div class="sh-rsub">' + D.esc(item.sub) + '</div>' : '') +
        (item.bar !== null ? '<div class="sh-rbar ' + (item.level || '') + '"><i style="width:' + clampNum(item.bar, 2, 100) + '%"></i></div>' : '');
      if (tap) D.bindTap(r, { scrollable: true, onTap: function () { ctx.tap(index, r); } });
      return r;
    }
    return {
      paint: function (v) {
        view = v;
        setText(title, v.label);
        var sig = (v.rowTap ? 't' : '') + JSON.stringify(v.items);
        if (list.__sig === sig) return;
        list.__sig = sig;
        list.innerHTML = '';
        if (!v.items.length) { list.appendChild(el('div', 'empty', v.empty)); return; }
        for (var i = 0; i < v.items.length; i++) list.appendChild(row(v.items[i], i, v.rowTap));
      },
      resize: function () { if (view) { list.__sig = ''; this.paint(view); } }
    };
  });

  register('slider', function (ctx) {
    var title = header(ctx.root, '');
    var num = el('div', 'sh-sval');
    var track = el('div', 'sh-track');
    var fill = el('i', 'sh-tfill');
    var knob = el('b', 'sh-knob');
    track.appendChild(fill); track.appendChild(knob);
    var sub = el('div', 'sh-sub');
    ctx.root.appendChild(num); ctx.root.appendChild(track); ctx.root.appendChild(sub);
    var view = null, dragging = false, local = null, lastSent = 0, sendTimer = null, holdUntil = 0;
    var SEND_EVERY_MS = 350;

    function show(value) {
      if (!view) return;
      var pct = view.max > view.min ? (value - view.min) / (view.max - view.min) * 100 : 0;
      pct = clampNum(pct, 0, 100);
      fill.style.width = pct + '%';
      knob.style.left = pct + '%';
      setText(num, value === null ? '—' : value + (view.unit ? ' ' + view.unit : ''));
    }
    function valueAt(p) {
      var r = track.getBoundingClientRect();
      var ratio = ctx.app.rotated ?
        (r.height ? clampNum((p.y - r.top) / r.height, 0, 1) : 0) :
        (r.width ? clampNum((p.x - r.left) / r.width, 0, 1) : 0);
      var raw = view.min + ratio * (view.max - view.min);
      var step = view.step || 1;
      return clampNum(Math.round((raw - view.min) / step) * step + view.min, view.min, view.max);
    }
    function send(final) {
      clearTimeout(sendTimer);
      var now = new Date().getTime();
      if (!final && now - lastSent < SEND_EVERY_MS) {
        sendTimer = setTimeout(function () { send(false); }, SEND_EVERY_MS - (now - lastSent));
        return;
      }
      lastSent = now;
      holdUntil = now + 2500;
      ctx.set(local, function (err) { if (err) ctx.app.toast(err.message, 'err'); });
    }
    function point(e) {
      var t = e.touches && e.touches.length ? e.touches[0] : e.changedTouches && e.changedTouches.length ? e.changedTouches[0] : e;
      return { x: t.clientX, y: t.clientY };
    }
    function start(e) {
      if (!view) return;
      dragging = true;
      D.addClass(track, 'on');
      local = valueAt(point(e));
      show(local);
      send(false);
      if (e.preventDefault) e.preventDefault();
    }
    function move(e) {
      if (!dragging) return;
      local = valueAt(point(e));
      show(local);
      send(false);
      if (e.preventDefault) e.preventDefault();
    }
    function end() {
      if (!dragging) return;
      dragging = false;
      D.removeClass(track, 'on');
      send(true);
    }
    track.addEventListener('touchstart', start, false);
    track.addEventListener('touchmove', move, false);
    track.addEventListener('touchend', end, false);
    track.addEventListener('touchcancel', end, false);
    track.addEventListener('mousedown', start, false);
    document.addEventListener('mousemove', move, false);
    document.addEventListener('mouseup', end, false);

    return {
      paint: function (v) {
        view = v;
        setText(title, v.label);
        setText(sub, v.sub);
        if (dragging || new Date().getTime() < holdUntil) return;
        local = v.value;
        show(v.value);
      },
      resize: function (w, h) {
        num.style.fontSize = clampNum(Math.round((h - 34) * 0.3), 16, 40) + 'px';
        sub.style.display = h > 150 ? '' : 'none';
      },
      destroy: function () {
        clearTimeout(sendTimer);
        document.removeEventListener('mousemove', move, false);
        document.removeEventListener('mouseup', end, false);
      }
    };
  });

  register('voice', function (ctx) {
    var title = header(ctx.root, '');
    var form = el('div', 'sh-vform');
    var input = el('input', 'sh-vin');
    input.type = 'text';
    input.setAttribute('autocomplete', 'off');
    var mic = el('div', 'sh-vmic');
    mic.innerHTML = Icons.html('mic');
    var send = el('div', 'sh-vsend');
    send.innerHTML = Icons.html('send');
    form.appendChild(input); form.appendChild(mic); form.appendChild(send);
    var said = el('div', 'sh-said');
    var hints = el('div', 'sh-hints notr');
    ctx.root.appendChild(form); ctx.root.appendChild(said); ctx.root.appendChild(hints);
    var view = null, busy = false;

    function submit() {
      var text = input.value.replace(/^\s+|\s+$/g, '');
      if (!text || busy) return;
      busy = true;
      D.addClass(send, 'busy');
      setText(said, '« ' + text + ' »');
      ctx.say(text, function (err, r) {
        busy = false;
        D.removeClass(send, 'busy');
        if (!err) input.value = '';
        setText(said, err ? err.message : '« ' + text + ' » · ' + ((r && r.message) || 'Fatto'));
        setClass(said, 'sh-said ' + (err ? 'err' : 'ok'));
      });
    }
    Widgets.helpers.dictation({
      mic: mic, input: input, app: ctx.app,
      serverVoice: function () { return !!(view && view.voiceServer); },
      onText: function () { submit(); }
    });
    D.bindTap(send, { onTap: submit });
    input.addEventListener('keydown', function (e) { if (e.keyCode === 13) { e.preventDefault(); submit(); } }, false);

    return {
      paint: function (v) {
        view = v;
        setText(title, v.label);
        if (input.getAttribute('placeholder') !== v.placeholder) input.setAttribute('placeholder', v.placeholder);
        setText(hints, v.hints && v.hints.length ? v.hints.join(' · ') : '');
      },
      resize: function (w, h) { hints.style.display = h > 150 ? '' : 'none'; }
    };
  });

  function Controller(root, tile, app) {
    this.root = root;
    this.app = app;
    this.key = String(tile.def || '');
    this.url = '/api/shapes/' + this.key.split('/').map(encodeURIComponent).join('/');
    this.timer = null;
    this.dead = false;
    this.shape = '';
    this.painter = null;
    this.body = null;
    this.size = null;
    D.addClass(root, 'w-shape');
    this.load();
  }

  Controller.prototype.context = function () {
    var self = this;
    return {
      root: self.body,
      app: self.app,
      tap: function (index, node) { self.tap(index, node); },
      set: function (value, done) { D.api.post(self.url + '/set', { value: value }, done, 30000); },
      say: function (text, done) { D.api.post(self.url + '/voice', { text: text }, done, 30000); }
    };
  };

  Controller.prototype.build = function (shape) {
    var factory = renderers[shape];
    if (this.painter && this.painter.destroy) this.painter.destroy();
    if (this.body) this.root.removeChild(this.body);
    this.body = el('div', 'sh-body');
    this.root.appendChild(this.body);
    this.shape = shape;
    this.painter = factory ? factory(this.context()) : null;
    if (!factory) this.body.appendChild(el('div', 'empty err', 'Forma sconosciuta: ' + shape));
    if (this.painter && this.size) this.painter.resize(this.size.w, this.size.h);
  };

  Controller.prototype.showError = function (label, message) {
    this.build('');
    this.body.innerHTML = '';
    header(this.body, label || '');
    this.body.appendChild(el('div', 'empty err', message));
  };

  Controller.prototype.apply = function (v) {
    if (v.error) { this.showError(v.label, v.error); this.shape = ''; return; }
    if (v.shape !== this.shape || !this.painter) this.build(v.shape);
    if (this.painter) this.painter.paint(v);
    this.paintGlyph(v);
    var tappable = !!v.tappable;
    if (tappable !== !!this.tapBound) this.bindRoot(tappable);
  };

  var GLYPH_CLASS = { value: 'sh-glyph', text: 'sh-glyph', status: 'sh-glyph', slider: 'sh-sicon' };

  Controller.prototype.paintGlyph = function (v) {
    var cls = GLYPH_CLASS[v.shape];
    var html = cls && v.glyph && Icons.has(v.glyph) ? Icons.html(v.glyph) : '';
    if (!this.glyph || this.glyph.parentNode !== this.body) {
      if (!html) return;
      this.glyph = el('div', cls);
      this.body.appendChild(this.glyph);
    }
    if (this.glyph.__html !== html) { this.glyph.innerHTML = html; this.glyph.__html = html; }
    this.glyph.style.display = html ? '' : 'none';
    if (html) D.addClass(this.body, 'sh-has-glyph'); else D.removeClass(this.body, 'sh-has-glyph');
    this.sizeGlyph();
  };

  Controller.prototype.sizeGlyph = function () {
    if (!this.glyph || !this.size || this.glyph.className !== 'sh-glyph') return;
    if (this.size.h < COMPACT_BELOW) { this.glyph.style.width = this.glyph.style.height = ''; return; }
    var s = clampNum(Math.round((this.size.h - 48) * 0.75), 36, 120);
    this.glyph.style.width = this.glyph.style.height = s + 'px';
  };

  Controller.prototype.bindRoot = function (on) {
    var self = this;
    this.tapBound = on;
    if (on) D.addClass(this.root, 'sh-tap'); else D.removeClass(this.root, 'sh-tap');
    if (on && !this.rootBound) {
      this.rootBound = true;
      D.bindTap(this.root, { onTap: function () { if (self.tapBound) self.tap(0, self.root); } });
    }
  };

  Controller.prototype.load = function () {
    var self = this;
    if (this.dead) return;
    D.api.get(this.url, function (err, v) {
      if (self.dead) return;
      if (err) {
        if (err.status) self.showError('', err.message);
        self.schedule(RETRY_MS);
        return;
      }
      self.apply(v);
      self.schedule(Math.max(MIN_EVERY_MS, (v.every || 5) * 1000));
    }, 15000);
  };

  Controller.prototype.schedule = function (ms) {
    var self = this;
    clearTimeout(this.timer);
    this.timer = setTimeout(function () { self.load(); }, ms);
  };

  Controller.prototype.tap = function (index, node) {
    var self = this;
    D.api.post(this.url + '/tap', { index: index }, function (err, r) {
      flash(node, !err);
      if (err) { self.app.toast(err.message, 'err'); return; }
      if (r && r.message) self.app.toast(r.message, 'ok');
    }, 125000);
  };

  Controller.prototype.resize = function (w, h) {
    this.size = { w: w, h: h };
    if (h < COMPACT_BELOW) D.addClass(this.root, 'sh-compact'); else D.removeClass(this.root, 'sh-compact');
    if (this.painter) this.painter.resize(w, h);
    this.sizeGlyph();
  };

  Controller.prototype.destroy = function () {
    this.dead = true;
    clearTimeout(this.timer);
    if (this.painter && this.painter.destroy) this.painter.destroy();
  };

  function create(root, tile, app) {
    var c = new Controller(root, tile, app);
    return {
      update: function () {},
      resize: function (w, h) { c.resize(w, h); },
      destroy: function () { c.destroy(); }
    };
  }

  return { create: create, register: register, renderers: renderers };
})();
