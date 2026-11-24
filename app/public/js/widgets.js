var Widgets = (function () {
  'use strict';

  var el = D.el, setText = D.setText;

  function level(v, warn, hot) { return v === null || v === undefined ? '' : v >= hot ? 'hot' : v >= warn ? 'warn' : 'ok'; }

  function header(root, title, right) {
    var h = el('div', 'w-head' + (right ? ' tools' : ''));
    var t = el('div', 'w-title', title);
    h.appendChild(t);
    if (right) h.appendChild(right);
    root.appendChild(h);
    return t;
  }

  function setHtml(e, h) { if (e && e.__html !== h) { e.innerHTML = h; e.__html = h; } }

  function smallBtn(label, icon, onTap) {
    var b = el('div', 'sbtn');
    b.innerHTML = Icons.html(icon) + (label ? '<span>' + D.esc(label) + '</span>' : '');
    D.bindTap(b, { onTap: onTap });
    return b;
  }

  function dictation(opts) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var mic = opts.mic, input = opts.input, app = opts.app, rec = null, listening = false;
    var fileIn = el('input', 'voice-file');
    fileIn.type = 'file';
    fileIn.setAttribute('accept', 'audio/*');
    fileIn.setAttribute('capture', 'microphone');
    mic.parentNode.appendChild(fileIn);

    function append(t) {
      t = String(t || '').replace(/^\s+|\s+$/g, '');
      if (!t) return;
      input.value = (input.value ? input.value.replace(/\s+$/, '') + ' ' : '') + t;
      if (opts.onText) opts.onText(t);
    }
    function stop() {
      if (rec && listening) { try { rec.stop(); } catch (e) { } }
      listening = false;
      D.removeClass(mic, 'on');
    }
    function startBrowser() {
      if (!rec) {
        rec = new SR();
        rec.lang = 'it-IT';
        rec.continuous = false;
        rec.interimResults = false;
        rec.onresult = function (e) {
          var t = '';
          for (var i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
          append(t);
        };
        rec.onerror = function (e) {
          stop();
          app.toast(e.error === 'not-allowed' ? 'Microfono non consentito dal browser' : 'Dettatura non riuscita: usa il microfono della tastiera', 'err');
        };
        rec.onend = function () { listening = false; D.removeClass(mic, 'on'); };
      }
      try { rec.start(); listening = true; D.addClass(mic, 'on'); } catch (e) { stop(); }
    }
    function upload(file) {
      var xhr = new XMLHttpRequest();
      D.addClass(mic, 'on');
      app.toast('Trascrivo sul PC…', 'info');
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        D.removeClass(mic, 'on');
        var d = null;
        try { d = JSON.parse(xhr.responseText); } catch (e) { d = null; }
        if (d && d.ok) append(d.data.text);
        else app.toast((d && d.error && d.error.message) || 'Trascrizione non riuscita', 'err');
      };
      xhr.open('POST', '/api/voice', true);
      var token = D.store.get('token', '');
      if (token) xhr.setRequestHeader('X-Dock-Token', token);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.send(file);
    }
    fileIn.addEventListener('change', function () {
      if (fileIn.files && fileIn.files[0]) upload(fileIn.files[0]);
      fileIn.value = '';
    }, false);
    D.bindTap(mic, {
      onTap: function () {
        if (listening) { stop(); return; }
        if (SR) { startBrowser(); return; }
        if (opts.serverVoice && opts.serverVoice()) { fileIn.click(); return; }
        input.focus();
        app.toast('Tocca il microfono sulla tastiera di Android per dettare', 'info');
      }
    });
    return { stop: stop };
  }

  function system(root) {
    D.addClass(root, 'w-system');
    var title = header(root, 'DIAGNOSTICA');
    var list = el('div', 'm-list');
    root.appendChild(list);
    var rows = {};
    var KEYS = ['cpu', 'gpu', 'ram', 'vram'];
    function row(key, label) {
      var r = el('div', 'metric' + (key === 'net' ? ' m-nobar' : ''));
      var l = el('span', 'm-label', label);
      var bar = el('div', 'bar');
      var fill = el('i', '');
      bar.appendChild(fill);
      var v = el('span', 'm-val', '—');
      r.appendChild(l); r.appendChild(bar); r.appendChild(v);
      list.appendChild(r);
      rows[key] = { row: r, val: v, fill: fill, bar: bar };
    }
    row('cpu', 'CPU'); row('gpu', 'GPU'); row('ram', 'RAM'); row('vram', 'VRAM');

    function set(key, value, pct, lvl) {
      var r = rows[key];
      setText(r.val, value);
      var w = (pct === null || pct === undefined ? 0 : Math.max(2, Math.min(100, pct))) + '%';
      if (r.w !== w) { r.fill.style.width = w; r.w = w; }
      var cls = 'bar ' + (lvl || '');
      if (r.cls !== cls) { r.bar.className = cls; r.cls = cls; }
    }
    function deg(t) { return t === null || t === undefined ? '' : ' · ' + t + '°'; }

    return {
      update: function (s) {
        var sys = s && s.system;
        if (!sys) return;
        var c = sys.cpu;
        set('cpu', (c.usage === null ? '…' : c.usage + '%') + deg(c.temp), c.usage, level(Math.max(c.usage || 0, c.temp ? c.temp - 15 : 0), 60, 85));
        var g = sys.gpu;
        if (g) {
          set('gpu', (g.usage === null ? 'N/D' : g.usage + '%') + deg(g.temp), g.usage, level(Math.max(g.usage || 0, g.temp ? g.temp - 10 : 0), 65, 85));
          var vpct = g.memUsedGb !== null && g.memTotalGb ? Math.round((g.memUsedGb / g.memTotalGb) * 100) : null;
          set('vram', g.memUsedGb !== null ? g.memUsedGb + '/' + g.memTotalGb + ' GB' : 'N/D', vpct, level(vpct, 75, 92));
        } else {
          set('gpu', 'N/D', null, '');
          set('vram', 'N/D', null, '');
        }
        set('ram', sys.ram.usage + '% · ' + sys.ram.usedGb + '/' + sys.ram.totalGb + ' GB', sys.ram.usage, level(sys.ram.usage, 75, 90));
      },
      resize: function (w, h) {
        var rh = Math.max(24, Math.min(56, Math.floor((h - 46) / KEYS.length)));
        var fs = Math.max(12, Math.min(18, Math.round(rh * 0.5)));
        list.style.fontSize = fs + 'px';
        var visible = Math.max(1, Math.min(KEYS.length, Math.floor((h - 46) / rh)));
        for (var i = 0; i < KEYS.length; i++) {
          rows[KEYS[i]].row.style.height = rows[KEYS[i]].row.style.lineHeight = rh + 'px';
          rows[KEYS[i]].row.style.display = i < visible ? '' : 'none';
        }
      },
      destroy: function () {}
    };
  }

  function nowplaying(root, tile, app) {
    D.addClass(root, 'w-np');
    var art = el('div', 'np-art');
    var img = el('img', '');
    var artPh = el('div', 'np-art-ph');
    artPh.innerHTML = Icons.html('music');
    art.appendChild(artPh); art.appendChild(img);
    var info = el('div', 'np-info');
    var src = el('div', 'np-src', '');
    var title = el('div', 'np-title notr', 'Niente in riproduzione');
    var artist = el('div', 'np-artist notr', '');
    var seek = el('div', 'np-seek');
    var prog = el('div', 'np-prog'); var progFill = el('i', ''); prog.appendChild(progFill);
    seek.appendChild(prog);
    var times = el('div', 'np-times', '');
    var ctr = el('div', 'np-ctr');
    var ctr2 = el('div', 'np-ctr2');
    info.appendChild(src); info.appendChild(title); info.appendChild(artist);
    info.appendChild(seek); info.appendChild(times); info.appendChild(ctr2);
    root.appendChild(art); root.appendChild(info); root.appendChild(ctr);

    var cur = null, artKey = null, offset = 0, receivedAt = 0, timer = null, optimisticUntil = 0;
    img.onload = function () { img.style.display = 'block'; artPh.style.display = 'none'; };
    img.onerror = function () { img.style.display = 'none'; artPh.style.display = 'block'; };

    function send(c, value) {
      D.api.post('/api/media', { command: c, value: value }, function (err, r) {
        if (err) return app.toast(err.message, 'err');
        if (r && typeof r.volume === 'number' && cur) { cur.volume = r.volume; paintStatus(); }
      });
    }
    function cmd(c) {
      return function () {
        if (!cur) { app.toast('Nessun player musicale attivo', 'err'); return; }
        if (c === 'play_pause') {
          cur.position = position();
          receivedAt = new Date().getTime();
          cur.status = cur.status === 'playing' ? 'paused' : 'playing';
          optimisticUntil = receivedAt + 2500;
          paintStatus();
        }
        if ((c === 'shuffle' && !cur.canShuffle) || (c === 'repeat' && !cur.canRepeat)) {
          app.toast('Non disponibile per ' + (cur.appName || 'questa app'), 'err');
          return;
        }
        send(c);
      };
    }
    function ctrlBtn(parent, icon, c, cls, repeat, label) {
      var b = el('div', 'np-btn ' + (cls || ''));
      b.innerHTML = (Icons.html(icon) || D.esc(icon)) + (label ? '<span>' + D.esc(label) + '</span>' : '');
      D.bindTap(b, { onTap: cmd(c), repeat: !!repeat });
      parent.appendChild(b);
      return b;
    }
    var volDown = ctrlBtn(ctr, 'voldown', 'volume_down', 'np-vol', true);
    ctrlBtn(ctr, 'prev', 'previous');
    var playBtn = ctrlBtn(ctr, 'play', 'play_pause', 'np-play');
    ctrlBtn(ctr, 'next', 'next');
    var volUp = ctrlBtn(ctr, 'volup', 'volume_up', 'np-vol', true);
    var shufBtn = ctrlBtn(ctr2, 'shuffle', 'shuffle', 'np-opt', false, 'SHUFFLE');
    var REP = I18n.lang() === 'en' ? ['REPEAT', 'REPEAT 1'] : ['RIPETI', 'RIPETI 1'];
    var repBtn = ctrlBtn(ctr2, 'repeat', 'repeat', 'np-opt notr', false, REP[0]);
    var muteBtn = ctrlBtn(ctr2, 'mute', 'mute', 'np-opt', false, 'MUTO');
    var volLabel = el('div', 'np-vollabel', '');
    ctr2.appendChild(volLabel);

    D.bindTap(seek, {
      onTap: function (target, x) {
        if (!cur || !cur.canSeek || !cur.duration) return;
        var r = prog.getBoundingClientRect();
        var ratio = Math.max(0, Math.min(1, (x - r.left) / r.width));
        var t = Math.round(ratio * cur.duration);
        cur.position = t;
        receivedAt = new Date().getTime();
        paintProgress();
        send('seek', t);
      }
    });

    function position() {
      if (!cur || !cur.duration) return 0;
      var p = cur.position;
      if (cur.status === 'playing') p += Math.max(0, (new Date().getTime() - receivedAt) / 1000);
      return Math.min(p, cur.duration);
    }
    function paintProgress() {
      if (!cur || !cur.duration) { seek.style.visibility = 'hidden'; setText(times, ''); return; }
      seek.style.visibility = 'visible';
      D.toggleClass(seek, 'can', !!cur.canSeek);
      var p = position();
      progFill.style.width = (p / cur.duration * 100) + '%';
      setText(times, D.duration(p) + ' / ' + D.duration(cur.duration));
    }
    function paintStatus() {
      var playing = cur && cur.status === 'playing';
      playBtn.innerHTML = Icons.html(playing ? 'pause' : 'play') || (playing ? '||' : '>');
      setText(src, cur ? String(cur.appName || '').toUpperCase() : '');
      var vol = cur && typeof cur.volume === 'number' ? Math.round(cur.volume * 100) : null;
      setText(volLabel, vol === null ? '' : (cur.muted ? 'MUTO' : 'VOL ' + vol + '%'));
      D.toggleClass(shufBtn, 'on', !!(cur && cur.shuffle));
      D.toggleClass(shufBtn, 'off', !(cur && cur.canShuffle));
      D.toggleClass(repBtn, 'on', !!(cur && cur.repeat && cur.repeat !== 'none'));
      D.toggleClass(repBtn, 'off', !(cur && cur.canRepeat));
      setText(repBtn.querySelector('span'), cur && cur.repeat === 'one' ? REP[1] : REP[0]);
      D.toggleClass(muteBtn, 'on', !!(cur && cur.muted));
      var noVol = !(cur && cur.canVolume);
      D.toggleClass(volDown, 'off', noVol); D.toggleClass(volUp, 'off', noVol); D.toggleClass(muteBtn, 'off', noVol);
    }

    timer = D.every(1000, 5000, paintProgress);

    return {
      update: function (s) {
        var m = s && s.media;
        if (!m) return;
        if (s.time) offset = s.time - new Date().getTime();
        if (!m.supported) {
          cur = null;
          setText(title, I18n.t('Now Playing non disponibile'));
          setText(artist, I18n.t('Su questo sistema non è supportato'));
        } else if (!m.active) {
          cur = null;
          setText(title, I18n.t('Niente in riproduzione'));
          setText(artist, I18n.t(m.bridge ? 'Avvia Apple Music, YouTube o Spotify sul PC' : 'Avvia la musica sul PC (per Apple Music web serve l\'estensione)'));
        } else {
          var keep = cur && new Date().getTime() < optimisticUntil ? cur.status : null;
          cur = m;
          receivedAt = new Date().getTime();
          if (keep) cur.status = keep;
          setText(title, m.title || I18n.t('Titolo sconosciuto'));
          setText(artist, [m.artist, m.album].filter(function (x) { return !!x; }).join(' — '));
        }
        paintStatus();
        paintProgress();
        var key = cur && cur.hasArt ? cur.key : null;
        if (key !== artKey) {
          artKey = key;
          if (key) img.src = '/api/media/art?k=' + key;
          else { img.style.display = 'none'; artPh.style.display = 'block'; }
        }
      },
      resize: function (w, h) {
        var pad = 12;
        var tall = h > 380 && w > 420 && w < h * 1.6;
        var compact = h <= 190;
        var ctrH = compact ? 50 : 64;
        var free = h - ctrH - pad * 3;
        var size, showArt;
        if (tall) {
          size = Math.max(0, Math.min(w - pad * 2, h - 240 - ctrH));
          showArt = size >= 90;
        } else {
          size = Math.min(free, Math.round(w * 0.3));
          showArt = size >= 60 && w - size > 170;
        }
        if (!showArt) size = 0;
        art.style.display = showArt ? 'block' : 'none';
        art.style.width = size + 'px'; art.style.height = size + 'px';
        if (tall) {
          art.style.left = Math.round((w - size) / 2) + 'px'; art.style.top = pad + 'px';
          info.style.left = pad + 'px'; info.style.top = (showArt ? size + pad * 2 : pad) + 'px';
        } else {
          art.style.left = pad + 'px'; art.style.top = pad + 'px';
          info.style.left = (showArt ? size + pad * 2 : pad) + 'px'; info.style.top = pad + 'px';
        }
        info.style.right = pad + 'px';
        info.style.bottom = (ctrH + pad * 2) + 'px';
        ctr.style.left = pad + 'px'; ctr.style.right = pad + 'px'; ctr.style.bottom = pad + 'px';
        D.toggleClass(root, 'np-tall', tall);
        D.toggleClass(root, 'np-compact', compact);
        ctr2.style.display = tall ? '' : 'none';
        var vol = w - pad * 2 > 330;
        volDown.style.display = volUp.style.display = vol ? '' : 'none';
        D.toggleClass(root, 'np-novol', !vol);
      },
      destroy: function () { D.stop(timer); }
    };
  }

  function queue(root, tile, app) {
    D.addClass(root, 'w-queue');
    var title = header(root, 'IN CODA');
    var list = el('div', 'w-list scroll');
    root.appendChild(list);
    var lastKey = 'none', loading = false;

    function hint(text) {
      list.innerHTML = '';
      list.appendChild(el('div', 'empty', text));
    }
    function render(d) {
      list.innerHTML = '';
      if (!d.available || !d.items.length) {
        hint('La coda è disponibile per Apple Music, YouTube e YouTube Music nel browser, con l\'estensione Vibe Deck Bridge (vedi README).');
        return;
      }
      setText(title, 'IN CODA · ' + d.appName.toUpperCase());
      var currentRow = null;
      for (var i = 0; i < d.items.length; i++) (function (q) {
        var row = el('div', 'q-row' + (q.current ? ' current' : ''));
        row.innerHTML = '<div class="q-title">' + (q.current ? (Icons.html('play') || '> ') : '') + D.esc(q.title || '—') + '</div>' +
          '<div class="q-artist">' + D.esc(q.artist || '') + '</div>';
        D.bindTap(row, {
          scrollable: true,
          onTap: function () {
            if (q.current) return;
            D.addClass(row, 'busy');
            D.api.post('/api/media', { command: 'queue_play', value: q.index }, function (err) {
              D.removeClass(row, 'busy');
              if (err) app.toast(err.message, 'err');
              else lastKey = 'force';
            });
          }
        });
        list.appendChild(row);
        if (q.current) currentRow = row;
      })(d.items[i]);
      if (currentRow) list.scrollTop = Math.max(0, currentRow.offsetTop - 50);
    }
    function load() {
      if (loading) return;
      loading = true;
      D.api.get('/api/media/queue', function (err, d) {
        loading = false;
        if (err) return;
        render(d);
      });
    }
    return {
      update: function (s) {
        var m = s && s.media;
        var key = m && m.active && m.canQueue ? m.queueKey : null;
        if (key === lastKey) return;
        lastKey = key;
        if (!key) {
          setText(title, 'IN CODA');
          hint(m && m.active
            ? (m.appName || 'Questa app') + ' non espone la coda. È disponibile per Apple Music e YouTube nel browser con l\'estensione Vibe Deck Bridge.'
            : 'Niente in riproduzione.');
          return;
        }
        load();
      },
      resize: function () {},
      destroy: function () {}
    };
  }

  function guideHtml(sections) {
    var html = '';
    for (var s = 0; s < sections.length; s++) {
      var sec = sections[s];
      html += '<div class="gg-sec">' + D.esc(sec.title) + '</div>';
      if (sec.note) html += '<div class="gg-note">' + D.esc(sec.note) + '</div>';
      for (var i = 0; i < sec.items.length; i++) {
        var it = sec.items[i];
        html += '<div class="gg-row' + (it[2] ? ' ' + it[2] : '') + '"><code>' + D.esc(it[0]) + '</code><span>' + D.esc(it[1]) + '</span></div>';
      }
    }
    return html;
  }

  function clock(root) {
    D.addClass(root, 'w-clock');
    var t = el('div', 'clk-time', '');
    var d = el('div', 'clk-date', '');
    root.appendChild(t); root.appendChild(d);
    var en = I18n.lang() === 'en';
    var DAYS = en ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] :
      ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
    var MONTHS = en ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] :
      ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    D.addClass(d, 'notr');
    function paint() {
      var n = new Date();
      setText(t, D.pad(n.getHours()) + ':' + D.pad(n.getMinutes()));
      setText(d, DAYS[n.getDay()] + ' ' + n.getDate() + ' ' + MONTHS[n.getMonth()]);
    }
    paint();
    var timer = D.every(5000, 30000, paint);
    return {
      update: function () {},
      resize: function (w, h) {
        var inner = h - 20;
        var tf = Math.round(Math.min((w - 24) / 3.1, inner * 0.62));
        var df = Math.max(11, Math.min(20, Math.round(tf * 0.24)));
        t.style.fontSize = tf + 'px';
        d.style.fontSize = df + 'px';
        d.style.display = inner > tf + df * 1.6 ? '' : 'none';
        var used = tf + (d.style.display ? 0 : df * 1.6);
        t.style.marginTop = Math.max(0, Math.round((inner - used) / 2)) + 'px';
      },
      destroy: function () { D.stop(timer); }
    };
  }


  var TYPES = { system: system, nowplaying: nowplaying, queue: queue, clock: clock };

  function create(type, root, tile, app) {
    var fn = TYPES[type];
    if (!fn) {
      root.appendChild(el('div', 'empty err', 'Widget sconosciuto: ' + type));
      return { update: function () {}, resize: function () {}, destroy: function () {} };
    }
    return fn(root, tile, app);
  }

  function register(name, fn) {
    if (typeof fn !== 'function' || !name) return false;
    if (TYPES.hasOwnProperty(name) && !TYPES[name].plugin) {
      if (window.console) console.warn('Widget già esistente: ' + name);
      return false;
    }
    fn.plugin = true;
    TYPES[name] = fn;
    return true;
  }

  var helpers = { el: el, header: header, setHtml: setHtml, smallBtn: smallBtn, level: level, dictation: dictation, guideHtml: guideHtml };

  return { create: create, types: TYPES, register: register, helpers: helpers };
})();
