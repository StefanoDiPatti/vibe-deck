var D = (function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.appendChild(document.createTextNode(String(text)));
    return e;
  }

  function hasClass(e, c) { return (' ' + e.className + ' ').indexOf(' ' + c + ' ') >= 0; }
  function addClass(e, c) { if (e && !hasClass(e, c)) e.className = (e.className ? e.className + ' ' : '') + c; }
  function removeClass(e, c) {
    if (!e || !hasClass(e, c)) return;
    e.className = (' ' + e.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, '');
  }
  function toggleClass(e, c, on) { if (on) addClass(e, c); else removeClass(e, c); }

  function closestClass(e, c, stop) {
    while (e && e !== stop && e.nodeType === 1) {
      if (hasClass(e, c)) return e;
      e = e.parentNode;
    }
    return null;
  }
  function closestAttr(e, attr, stop) {
    while (e && e !== stop && e.nodeType === 1) {
      if (e.getAttribute(attr) !== null) return e;
      e = e.parentNode;
    }
    return null;
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function setText(e, t) {
    if (!e) return;
    t = t === undefined || t === null ? '' : String(t);
    if (e.textContent !== t) e.textContent = t;
  }

  var store = {
    get: function (k, def) {
      try {
        var v = window.localStorage.getItem('dock:' + k);
        return v === null ? def : JSON.parse(v);
      } catch (e) { return def; }
    },
    set: function (k, v) {
      try { window.localStorage.setItem('dock:' + k, JSON.stringify(v)); } catch (e) { }
    },
    remove: function (k) { try { window.localStorage.removeItem('dock:' + k); } catch (e) { } }
  };

  var onUnauthorized = null;

  function request(method, url, body, cb, timeoutMs) {
    var xhr = new XMLHttpRequest();
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      try { xhr.abort(); } catch (e) { }
      cb({ code: 'TIMEOUT', message: 'Il PC non risponde', status: 0 });
    }, timeoutMs || 8000);

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4 || done) return;
      done = true;
      clearTimeout(timer);
      var data = null;
      try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
      if (xhr.status === 0) return cb({ code: 'NETWORK', message: 'PC non raggiungibile', status: 0 });
      if (data && data.ok) return cb(null, data.data);
      var err = (data && data.error) || { code: 'HTTP_' + xhr.status, message: 'Errore ' + xhr.status };
      err.status = xhr.status;
      if (xhr.status === 401 && onUnauthorized) onUnauthorized();
      cb(err);
    };
    xhr.open(method, url, true);
    var token = store.get('token', '');
    if (token) xhr.setRequestHeader('X-Dock-Token', token);
    if (body) xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(body ? JSON.stringify(body) : null);
  }

  var api = {
    get: function (url, cb, timeoutMs) { request('GET', url, null, cb, timeoutMs); },
    post: function (url, body, cb, timeoutMs) { request('POST', url, body || {}, cb || function () {}, timeoutMs); }
  };

  function bindTap(node, opts) {
    var pressed = false, moved = false, fired = false;
    var sx = 0, sy = 0, target = null, holdTimer = null, repeatTimer = null, lastTouch = 0;

    function cancel() {
      pressed = false;
      clearTimeout(holdTimer);
      clearTimeout(repeatTimer);
      removeClass(node, 'pressed');
      removeClass(node, 'holding');
    }
    function fire() { try { opts.onTap(target, sx, sy); } catch (e) { if (window.console) console.error(e); } }

    function down(x, y, t) {
      pressed = true; moved = false; fired = false; sx = x; sy = y; target = t;
      addClass(node, 'pressed');
      if (opts.hold) {
        addClass(node, 'holding');
        holdTimer = setTimeout(function () {
          if (pressed && !moved) { fired = true; cancel(); fire(); }
        }, opts.hold);
      } else if (opts.repeat) {
        fired = true;
        fire();
        repeatTimer = setTimeout(function rep() {
          if (!pressed) return;
          fire();
          repeatTimer = setTimeout(rep, 200);
        }, 450);
      }
    }
    function move(x, y) {
      if (pressed && (Math.abs(x - sx) > 14 || Math.abs(y - sy) > 14)) { moved = true; cancel(); }
    }
    function up() {
      if (!pressed) return;
      var go = !moved && !fired && !opts.hold;
      var brief = opts.hold && opts.onShort && !moved && !fired;
      cancel();
      if (go) fire();
      if (brief) { try { opts.onShort(target); } catch (e) { if (window.console) console.error(e); } }
    }

    node.addEventListener('touchstart', function (e) {
      lastTouch = new Date().getTime();
      var t = e.touches[0];
      down(t.clientX, t.clientY, e.target);
      if (!opts.scrollable) e.preventDefault();
    }, false);
    node.addEventListener('touchmove', function (e) {
      var t = e.touches[0];
      move(t.clientX, t.clientY);
    }, false);
    node.addEventListener('touchend', function (e) {
      lastTouch = new Date().getTime();
      var wasPressed = pressed;
      up();
      if (wasPressed) e.preventDefault();
    }, false);
    node.addEventListener('touchcancel', cancel, false);
    node.addEventListener('mousedown', function (e) {
      if (new Date().getTime() - lastTouch < 800 || e.button !== 0) return;
      down(e.clientX, e.clientY, e.target);
    }, false);
    node.addEventListener('mousemove', function (e) { move(e.clientX, e.clientY); }, false);
    node.addEventListener('mouseup', function () { if (new Date().getTime() - lastTouch >= 800) up(); }, false);
    node.addEventListener('mouseout', function (e) {
      var to = e.relatedTarget;
      while (to && to !== node) to = to.parentNode;
      if (!to) cancel();
    }, false);
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function duration(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ':' + pad(m) : m) + ':' + pad(s);
  }

  function ago(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var s = Math.max(0, (new Date().getTime() - t) / 1000);
    if (s < 60) return 'ora';
    if (s < 3600) return Math.floor(s / 60) + ' min fa';
    if (s < 86400) return Math.floor(s / 3600) + ' h fa';
    var d = Math.floor(s / 86400);
    return d === 1 ? 'ieri' : d + ' giorni fa';
  }

  function richText(text) {
    var parts = String(text || '').split('```');
    var html = '';
    for (var i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        var code = parts[i].replace(/^[a-zA-Z0-9_+-]*\n/, '');
        html += '<pre class="code">' + esc(code.replace(/\s+$/, '')) + '</pre>';
      } else {
        html += esc(parts[i])
          .replace(/`([^`\n]+)`/g, '<code>$1</code>')
          .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
          .replace(/^#{1,4} (.*)$/gm, '<b>$1</b>')
          .replace(/\n/g, '<br>');
      }
    }
    return html;
  }

  var power = { lastInput: new Date().getTime(), idleAfter: 60000, asleep: false, listeners: [] };
  function isHidden() { return !!(document.hidden || document.webkitHidden); }
  function powerState() {
    if (power.asleep) return 'asleep';
    return new Date().getTime() - power.lastInput > power.idleAfter ? 'idle' : 'active';
  }
  function notifyWake() {
    for (var i = 0; i < power.listeners.length; i++) {
      try { power.listeners[i](); } catch (e) { }
    }
  }
  function onInput() {
    var was = powerState();
    power.lastInput = new Date().getTime();
    if (was === 'idle') notifyWake();
  }
  document.addEventListener('touchstart', onInput, true);
  document.addEventListener('mousedown', onInput, true);
  document.addEventListener('keydown', onInput, true);

  function every(activeMs, idleMs, fn) {
    var t = { stopped: false, id: null };
    function tick() {
      if (t.stopped) return;
      var st = powerState();
      if (st !== 'asleep' && !isHidden()) fn();
      t.id = setTimeout(tick, st === 'active' ? activeMs : idleMs);
    }
    t.wake = function () { if (!t.stopped) { clearTimeout(t.id); t.id = setTimeout(tick, 30); } };
    power.listeners.push(t.wake);
    t.id = setTimeout(tick, activeMs);
    return t;
  }
  function stop(t) {
    if (!t) return;
    t.stopped = true;
    clearTimeout(t.id);
    for (var i = power.listeners.length - 1; i >= 0; i--) if (power.listeners[i] === t.wake) power.listeners.splice(i, 1);
  }

  var Power = {
    state: powerState,
    isHidden: isHidden,
    configure: function (o) { if (o && o.idleAfterSec > 0) power.idleAfter = o.idleAfterSec * 1000; },
    sleep: function () { power.asleep = true; },
    wake: function () { power.asleep = false; power.lastInput = new Date().getTime(); notifyWake(); },
    onWake: function (fn) { power.listeners.push(fn); },
    lastInput: function () { return power.lastInput; }
  };

  return {
    every: every, stop: stop, power: Power,
    $: $, el: el, hasClass: hasClass, addClass: addClass, removeClass: removeClass, toggleClass: toggleClass,
    closestClass: closestClass, closestAttr: closestAttr, esc: esc, setText: setText, store: store,
    request: request, api: api, bindTap: bindTap, pad: pad, duration: duration, ago: ago, richText: richText,
    setUnauthorizedHandler: function (fn) { onUnauthorized = fn; }
  };
})();
