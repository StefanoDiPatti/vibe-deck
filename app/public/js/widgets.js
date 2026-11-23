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

  function todo(root, tile, app) {
    D.addClass(root, 'w-todo');
    var clearBtn = smallBtn('PULISCI', 'trash', function () {
      send('/api/todo/clear', {}, function (r) {
        app.toast(r.removed ? r.removed + ' completate rimosse' : 'Nessuna completata', 'ok');
      });
    });
    var title = header(root, 'TODO', clearBtn);
    var syncEl = el('span', 'todo-sync');
    title.appendChild(syncEl);
    function renderSync() {
      var s = state.sync;
      var cls = 'todo-sync' + (!s || !s.enabled ? ' hidden' : s.ok === false ? ' err' : s.ok ? ' ok' : '');
      if (syncEl.className !== cls) syncEl.className = cls;
      setHtml(syncEl, Icons.html('cloud') + '<i>' + (s && s.ok === false ? 'sync' : 'GitHub') + '</i>');
    }
    D.bindTap(syncEl, {
      onTap: function () {
        if (state.sync && state.sync.ok === false) app.toast('Sincronizzazione: ' + state.sync.message, 'err');
        send('/api/todo/sync', {}, function (r) {
          if (r.sync && r.sync.ok) app.toast('TODO sincronizzati con GitHub', 'ok');
          else if (r.sync && r.sync.ok === false) app.toast(r.sync.message, 'err');
        });
      }
    });
    var form = el('div', 'todo-form');
    var mic = el('div', 'todo-mic');
    mic.innerHTML = Icons.html('mic');
    var input = el('input', 'todo-input');
    input.type = 'text';
    input.placeholder = 'Nuova attività…';
    input.setAttribute('maxlength', '200');
    var addBtn = el('div', 'todo-add');
    addBtn.innerHTML = Icons.html('add') || '+';
    form.appendChild(mic); form.appendChild(input); form.appendChild(addBtn);
    var list = el('div', 'w-list scroll');
    root.appendChild(form); root.appendChild(list);
    var state = { items: [], notes: [], source: 'local', voiceServer: false };
    var target = D.store.get('todo:note', '');
    var busy = 0;

    dictation({ mic: mic, input: input, app: app, serverVoice: function () { return state.voiceServer; } });

    function targetNote() {
      for (var i = 0; i < state.notes.length; i++) if (state.notes[i].id === target) return state.notes[i];
      return state.notes[0] || null;
    }
    function render() {
      list.innerHTML = '';
      var open = 0, group = null;
      var tn = targetNote();
      var groups = state.notes.length > 0;
      for (var i = 0; i < state.items.length; i++) {
        var it = state.items[i];
        if (!it.done) open++;
        if (groups && it.note !== group) {
          group = it.note;
          list.appendChild(groupRow(it.note, it.group, tn && tn.id === it.note));
        }
        var row = el('div', 'todo-row' + (it.done ? ' done' : '') + (it.priority === 'high' ? ' high' : ''));
        var text = D.esc(it.text);
        if (it.label && it.text.indexOf(it.label) === 0) text = '<b>' + D.esc(it.label) + '</b>' + D.esc(it.text.slice(it.label.length));
        row.innerHTML = '<span class="todo-box">' + (it.done ? Icons.html('check') || 'x' : '') + '</span>' +
          '<span class="todo-text notr">' + text + '</span>' +
          '<span class="todo-del">' + (Icons.html('close') || 'x') + '</span>';
        bindRow(row, it);
        list.appendChild(row);
      }
      if (groups) for (var n = 0; n < state.notes.length; n++) {
        var has = false;
        for (var j = 0; j < state.items.length; j++) if (state.items[j].note === state.notes[n].id) { has = true; break; }
        if (!has) list.appendChild(groupRow(state.notes[n].id, state.notes[n].title, tn && tn.id === state.notes[n].id));
      }
      setText(title, 'TODO' + (memo ? ' · MEMO' : '') + ' · ' + open + ' da fare');
      input.placeholder = memo && tn ? 'Aggiungi a ' + tn.title + '…' : 'Nuova attività…';
      if (!state.items.length && !groups) list.appendChild(el('div', 'empty', 'Nessuna attività'));
    }
    function groupRow(id, label, isTarget) {
      var g = el('div', 'todo-group' + (isTarget ? ' target' : ''));
      g.innerHTML = '<span' + (label ? ' class="notr"' : '') + '>' + D.esc(label || 'Memo') + '</span>' + (isTarget && state.notes.length > 1 ? '<i>+ qui</i>' : '');
      if (state.notes.length > 1) {
        D.bindTap(g, {
          scrollable: true,
          onTap: function () { target = id; D.store.set('todo:note', id); render(); }
        });
      }
      return g;
    }
    function bindRow(row, it) {
      D.bindTap(row, {
        scrollable: true,
        onTap: function (t) {
          var del = D.closestClass(t, 'todo-del', row);
          if (del) { D.addClass(row, 'busy'); send('/api/todo/remove', { id: it.id }); return; }
          it.done = !it.done;
          D.toggleClass(row, 'done', it.done);
          D.addClass(row, 'busy');
          send('/api/todo/toggle', { id: it.id });
        }
      });
    }
    function send(url, body, done) {
      busy++;
      D.addClass(root, 'todo-busy');
      D.api.post(url, body, function (err, r) {
        busy--;
        if (!busy) D.removeClass(root, 'todo-busy');
        if (err) { app.toast(err.message, 'err'); load(); return; }
        apply(r);
        if (done) done(r);
      }, 20000);
    }
    function apply(d) {
      state.items = d.items || [];
      state.notes = d.notes || [];
      state.source = d.source || 'local';
      state.voiceServer = !!d.voiceServer;
      state.sync = d.sync || null;
      renderSync();
      render();
    }
    function add() {
      var text = input.value.replace(/^\s+|\s+$/g, '');
      if (!text) { input.focus(); return; }
      var tn = targetNote();
      input.value = '';
      input.blur();
      send('/api/todo/add', { text: text, note: tn ? tn.id : '' }, function () {
        app.toast(tn ? 'Aggiunta a ' + tn.title : 'Aggiunta', 'ok');
      });
    }
    D.bindTap(addBtn, { onTap: add });
    input.addEventListener('keydown', function (e) { if (e.keyCode === 13) { e.preventDefault(); add(); } }, false);
    var lastTodo = '';
    function load() {
      if (busy) return;
      D.api.get('/api/todo', function (err, d) {
        if (err || busy) return;
        var key = JSON.stringify(d);
        if (key === lastTodo) return;
        lastTodo = key;
        apply(d);
      });
    }
    load();
    var timer = D.every(10000, 30000, load);
    return { update: function () {}, resize: function () {}, destroy: function () { D.stop(timer); } };
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

  var DC = { guild: D.store.get('dc:guild', '') };
  function discord(root, tile, app) {
    D.addClass(root, 'w-discord');
    root.innerHTML =
      '<div class="dc-guilds scroll"></div>' +
      '<div class="dc-chans"><div class="dc-ctitle"></div><div class="dc-clist scroll"></div></div>' +
      '<div class="dc-room">' +
        '<div class="dc-rhead"><div class="dc-rtitle">DISCORD</div><div class="dc-rsub"></div></div>' +
        '<div class="dc-members scroll"></div>' +
        '<div class="dc-ctrl">' +
          '<div class="dc-btn dc-mute">' + Icons.html('mic') + '<span>MIC</span></div>' +
          '<div class="dc-btn dc-deaf">' + Icons.html('headset') + '<span>AUDIO</span></div>' +
          '<div class="dc-btn dc-cam">' + Icons.html('camera') + '<span>CAM</span></div>' +
          '<div class="dc-btn dc-live">' + Icons.html('live') + '<span>LIVE</span></div>' +
          '<div class="dc-btn dc-leave">' + Icons.html('hangup') + '<span>ESCI</span></div>' +
        '</div>' +
        '<div class="dc-pop hidden"></div>' +
      '</div>';
    function q(c) { return root.querySelector('.' + c); }
    var guildsEl = q('dc-guilds'), ctitle = q('dc-ctitle'), clist = q('dc-clist'), members = q('dc-members');
    var rtitle = q('dc-rtitle'), rsub = q('dc-rsub'), muteBtn = q('dc-mute'), deafBtn = q('dc-deaf'), leaveBtn = q('dc-leave');
    var camBtn = q('dc-cam'), liveBtn = q('dc-live'), pop = q('dc-pop');
    var st = null, guilds = null, chans = null, alive = true, lastRoom = '';
    var popUser = null, popBusy = 0, popLast = '';

    function av(m, cls) {
      return m.avatar ? '<img class="' + cls + '" src="' + D.esc(m.avatar) + '" alt="">' : '<span class="' + cls + ' noav">' + D.esc((m.name || '?').charAt(0).toUpperCase()) + '</span>';
    }
    function flags(m) {
      return (m.stream ? '<span class="dc-livebadge">LIVE</span>' : '') +
        (m.video ? Icons.html('camera', 'dc-flag dc-camflag') : '') +
        (m.deaf ? Icons.html('headsetoff', 'dc-flag') : m.mute ? Icons.html('micoff', 'dc-flag') : '') +
        (m.localMute ? '<span class="dc-local">muto per te</span>' :
          (!m.me && typeof m.volume === 'number' && Math.round(m.volume) !== 100 ? '<span class="dc-local">' + Math.round(m.volume) + '%</span>' : ''));
    }

    function findMem(id) {
      var ch = st && st.channel;
      for (var i = 0; ch && i < ch.members.length; i++) if (ch.members[i].id === id) return ch.members[i];
      return null;
    }
    function openPop(id) { popUser = id; popLast = ''; D.removeClass(pop, 'hidden'); renderPop(); }
    function closePop() { popUser = null; popLast = ''; D.addClass(pop, 'hidden'); pop.innerHTML = ''; }
    function renderPop() {
      if (!popUser) return;
      var m = findMem(popUser);
      if (!m) return closePop();
      if (popBusy) return;
      var v = typeof m.volume === 'number' ? Math.round(m.volume) : 100, pre = [50, 100, 150, 200], ph = '';
      for (var i = 0; i < pre.length; i++) ph += '<span class="dc-ppre' + (pre[i] === v ? ' on' : '') + '" data-vol="' + pre[i] + '">' + pre[i] + '%</span>';
      var html =
        '<div class="dc-phead">' + av(m, 'dc-av') + '<span class="dc-pname">' + D.esc(m.name) + '</span>' +
          '<span class="dc-pclose" data-act="close">' + Icons.html('close') + '</span></div>' +
        '<div class="dc-plabel">VOLUME PER TE<b>' + (m.localMute ? 'MUTO' : v + '%') + '</b></div>' +
        '<div class="dc-pvol' + (m.localMute ? ' muted' : '') + '">' +
          '<span class="dc-pb" data-act="down">' + Icons.html('voldown') + '</span>' +
          '<span class="dc-pbar" data-act="bar"><i style="width:' + (v / 2) + '%"></i><em></em></span>' +
          '<span class="dc-pb dc-pup" data-act="up">' + Icons.html('volup') + '</span>' +
        '</div>' +
        '<div class="dc-pres">' + ph + '</div>' +
        '<div class="dc-pmute' + (m.localMute ? ' on' : '') + '" data-act="mute">' + Icons.html(m.localMute ? 'volup' : 'mute') +
          '<span>' + (m.localMute ? 'TOGLI IL MUTO' : 'MUTA PER ME') + '</span></div>' +
        '<div class="dc-pnote">Vale solo per te, gli altri non lo vedono.</div>';
      if (html !== popLast) { pop.innerHTML = html; popLast = html; }
    }
    function setUser(patch, msg) {
      var m = findMem(popUser);
      if (!m) return;
      if ('volume' in patch) m.volume = patch.volume;
      if ('mute' in patch) m.localMute = patch.mute;
      popLast = ''; renderPop(); lastRoom = ''; renderState();
      popBusy++;
      patch.user = m.id;
      D.api.post('/api/discord/user', patch, function (err, d) {
        popBusy--;
        if (err) { app.toast(err.message, 'err'); loadState(); return; }
        st = d; popLast = ''; renderState();
        if (msg) app.toast(msg, 'ok');
      });
    }
    D.bindTap(pop, {
      onTap: function (t, x) {
        var m = findMem(popUser);
        if (!m) return closePop();
        var pv = D.closestAttr(t, 'data-vol', pop);
        if (pv) return setUser({ volume: parseInt(pv.getAttribute('data-vol'), 10) });
        var act = D.closestAttr(t, 'data-act', pop);
        if (!act) return;
        var a = act.getAttribute('data-act');
        var v = typeof m.volume === 'number' ? Math.round(m.volume) : 100;
        if (a === 'close') return closePop();
        if (a === 'mute') return setUser({ mute: !m.localMute }, m.localMute ? 'Di nuovo udibile' : 'Mutato per te');
        if (a === 'up' || a === 'down') return setUser({ volume: Math.max(0, Math.min(200, v + (a === 'up' ? 10 : -10))) });
        if (a === 'bar') {
          var r = act.getBoundingClientRect();
          var nv = Math.round(Math.max(0, Math.min(1, (x - r.left) / (r.right - r.left))) * 40) * 5;
          setUser({ volume: nv });
        }
      }
    });

    function renderState() {
      renderPop();
      var ready = st && st.status === 'ready';
      var v = (st && st.voice) || {};
      D.toggleClass(muteBtn, 'off', !!v.mute);
      D.toggleClass(deafBtn, 'off', !!v.deaf);
      setHtml(muteBtn, Icons.html(v.mute ? 'micoff' : 'mic') + '<span>' + (v.mute ? 'MUTO' : 'MIC') + '</span>');
      setHtml(deafBtn, Icons.html(v.deaf ? 'headsetoff' : 'headset') + '<span>' + (v.deaf ? 'SILENZIATO' : 'AUDIO') + '</span>');
      D.toggleClass(leaveBtn, 'disabled', !(ready && st.channel));
      var inRoom = !!(ready && st.channel);
      D.toggleClass(camBtn, 'on', !!v.video);
      D.toggleClass(liveBtn, 'on', !!v.stream);
      D.toggleClass(camBtn, 'disabled', !inRoom || !st.media);
      D.toggleClass(liveBtn, 'disabled', !inRoom || !st.media);
      setHtml(camBtn, Icons.html(v.video ? 'camera' : 'camoff') + '<span>' + (v.video ? 'CAM ON' : 'CAM') + '</span>');
      setHtml(liveBtn, Icons.html('live') + (v.stream ? '<i class="dc-livedot"></i>' : '') + '<span>' + (v.stream ? 'SEI IN LIVE' : 'LIVE') + '</span>');
      D.toggleClass(root, 'dc-streaming', !!v.stream);
      D.toggleClass(root, 'dc-off', !ready);
      if (!ready) {
        var head = !st || st.status === 'connecting' ? 'Collegamento a Discord…' :
          st.status === 'setup' ? 'Discord da collegare' :
          st.status === 'unauthorized' ? 'Manca l\'autorizzazione' : 'Discord è chiuso';
        var msg = !st || st.status === 'connecting' ? '' :
          st.status === 'setup' ? 'Sul PC fai doppio clic su Vibe Deck e segui la sezione Discord del pannello: serve una volta sola.' :
          st.status === 'unauthorized' ? 'Apri il pannello di controllo sul PC e premi "Autorizza su Discord".' :
          'Apri Discord sul PC: la dock si collega da sola.';
        setHtml(rtitle, 'COMANDI RAPIDI');
        setHtml(rsub, 'con le scorciatoie di Discord');
        members.innerHTML = '';
        guildsEl.innerHTML = '';
        ctitle.innerHTML = '';
        clist.innerHTML = '<div class="dc-setup">' + Icons.html('headset') + '<b>' + D.esc(head) + '</b><p>' + D.esc(msg) + '</p></div>';
        lastRoom = '';
        return;
      }
      var ch = st.channel;
      if (!ch) {
        setHtml(rtitle, 'NON SEI IN UNA STANZA');
        setHtml(rsub, D.esc(st.user ? st.user.name : ''));
        if (lastRoom !== 'none') members.innerHTML = '<div class="empty">Tocca un canale vocale per entrare.</div>';
        lastRoom = 'none';
        return;
      }
      setHtml(rtitle, (v.stream ? '<span class="dc-onair"><i class="dc-livedot"></i>IN LIVE</span>' : '') + Icons.html('volup') + D.esc(ch.name));
      setHtml(rsub, D.esc(ch.guild || '') + ' · ' + ch.members.length + (ch.members.length === 1 ? ' persona' : ' persone'));
      var html = '';
      for (var i = 0; i < ch.members.length; i++) {
        var m = ch.members[i];
        html += '<div class="dc-mem' + (m.speaking ? ' speaking' : '') + (m.localMute ? ' lmuted' : '') + (m.me ? ' me' : '') + '" data-user="' + D.esc(m.id) + '" data-lmute="' + (m.localMute ? 1 : 0) + '">' +
          av(m, 'dc-av') + '<span class="dc-name">' + D.esc(m.name) + (m.me ? ' <i>(tu)</i>' : '') + '</span>' + flags(m) + '</div>';
      }
      if (html !== lastRoom) { members.innerHTML = html; lastRoom = html; }
    }

    function renderGuilds() {
      if (!guilds) return;
      var html = '';
      for (var i = 0; i < guilds.length; i++) {
        var g = guilds[i];
        html += '<div class="dc-guild' + (g.id === DC.guild ? ' on' : '') + '" data-guild="' + D.esc(g.id) + '">' + av({ avatar: g.icon, name: g.name }, 'dc-gic') + '<span>' + D.esc(g.name) + '</span></div>';
      }
      guildsEl.innerHTML = html || '<div class="empty">Nessun server</div>';
    }

    function renderChans() {
      var g = null;
      for (var i = 0; guilds && i < guilds.length; i++) if (guilds[i].id === DC.guild) g = guilds[i];
      ctitle.innerHTML = g ? D.esc(g.name) + ' · CANALI VOCALI' : 'CANALI VOCALI';
      if (!chans) { clist.innerHTML = '<div class="empty">Carico…</div>'; return; }
      var here = st && st.channel ? st.channel.id : '';
      var html = '';
      for (var c = 0; c < chans.length; c++) {
        var ch = chans[c];
        html += '<div class="dc-chan' + (ch.id === here ? ' here' : '') + '" data-chan="' + D.esc(ch.id) + '">' +
          '<div class="dc-cname">' + Icons.html('volup') + D.esc(ch.name) + (ch.members.length ? ' <b>' + ch.members.length + '</b>' : '') + '</div>';
        for (var k = 0; k < ch.members.length; k++) {
          var m = ch.members[k];
          html += '<div class="dc-cmem">' + av(m, 'dc-sav') + D.esc(m.name) + flags(m) + '</div>';
        }
        html += '</div>';
      }
      clist.innerHTML = html || '<div class="empty">Nessun canale vocale</div>';
    }

    function loadState() {
      D.api.get('/api/discord/state', function (err, d) {
        if (!alive) return;
        if (err) { st = { status: 'offline' }; renderState(); return; }
        var wasReady = st && st.status === 'ready';
        var oldChan = st && st.channel ? st.channel.id : '';
        st = d;
        renderState();
        if (st.status === 'ready' && !wasReady) loadGuilds();
        if (st.status === 'ready' && (st.channel ? st.channel.id : '') !== oldChan) loadChans();
      });
    }
    function loadGuilds(refresh) {
      D.api.get('/api/discord/guilds' + (refresh ? '?refresh=1' : ''), function (err, list) {
        if (!alive || err) return;
        guilds = list;
        var ok = false;
        for (var i = 0; i < list.length; i++) if (list[i].id === DC.guild) ok = true;
        if (!ok) DC.guild = st && st.channel && st.channel.guild_id ? st.channel.guild_id : (list[0] ? list[0].id : '');
        renderGuilds();
        loadChans();
      });
    }
    function loadChans() {
      if (!DC.guild) return;
      var wanted = DC.guild;
      D.api.get('/api/discord/channels?guild=' + encodeURIComponent(wanted), function (err, list) {
        if (!alive || wanted !== DC.guild) return;
        if (err) { clist.innerHTML = '<div class="empty err">' + D.esc(err.message) + '</div>'; return; }
        chans = list;
        renderChans();
      }, 15000);
    }

    D.bindTap(guildsEl, {
      scrollable: true,
      onTap: function (t) {
        var g = D.closestAttr(t, 'data-guild', guildsEl);
        if (!g) return;
        DC.guild = g.getAttribute('data-guild');
        D.store.set('dc:guild', DC.guild);
        chans = null;
        renderGuilds();
        renderChans();
        loadChans();
      }
    });
    D.bindTap(clist, {
      scrollable: true,
      onTap: function (t) {
        var c = D.closestAttr(t, 'data-chan', clist);
        if (!c) return;
        var id = c.getAttribute('data-chan');
        if (st && st.channel && st.channel.id === id) return;
        D.addClass(c, 'joining');
        D.api.post('/api/discord/join', { channel: id }, function (err, d) {
          if (err) { D.removeClass(c, 'joining'); return app.toast(err.message, 'err'); }
          st = d; lastRoom = ''; renderState(); loadChans();
        }, 15000);
      }
    });
    D.bindTap(members, {
      scrollable: true,
      onTap: function (t) {
        var m = D.closestAttr(t, 'data-user', members);
        if (!m || D.hasClass(m, 'me')) return;
        openPop(m.getAttribute('data-user'));
      }
    });
    function toggle(what) {
      D.api.post('/api/discord/toggle', { what: what }, function (err, d) {
        if (err) return app.toast(err.message, 'err');
        if (d.message) app.toast(d.message, 'info');
        st = d; renderState();
      });
    }
    D.bindTap(muteBtn, { onTap: function () { toggle('mute'); } });
    D.bindTap(deafBtn, { onTap: function () { toggle('deaf'); } });
    function media(what) {
      if (st && st.status === 'ready' && !st.media) return app.toast('Per webcam e Go Live: pannello di controllo sul PC > Discord > Riautorizza', 'err');
      if (!st || !st.channel) return app.toast('Entra prima in un canale vocale', 'err');
      toggle(what);
    }
    D.bindTap(camBtn, { onTap: function () { media('video'); } });
    D.bindTap(liveBtn, { onTap: function () { media('stream'); } });
    D.bindTap(leaveBtn, {
      hold: 700,
      onShort: function () { if (st && st.channel) app.toast('Tieni premuto ESCI per uscire dalla stanza', 'info'); },
      onTap: function () {
        if (!st || !st.channel) return;
        D.api.post('/api/discord/join', { channel: null }, function (err, d) {
          if (err) return app.toast(err.message, 'err');
          st = d; lastRoom = ''; renderState(); loadChans();
          app.toast('Sei uscito dalla stanza', 'ok');
        });
      }
    });

    renderState();
    loadState();
    var lastStateAt = 0;
    var fast = D.every(1000, 5000, function () {
      if (!(st && st.channel) && new Date().getTime() - lastStateAt < 4000) return;
      lastStateAt = new Date().getTime();
      loadState();
    });
    var slow = D.every(15000, 60000, function () { if (st && st.status === 'ready') loadChans(); });
    return {
      update: function () {},
      resize: function () {},
      destroy: function () { alive = false; D.stop(fast); D.stop(slow); }
    };
  }

  var ML = { acc: D.store.get('ml:acc', '') };
  function mailWidget(root, tile, app) {
    D.addClass(root, 'w-mail');
    var tools = el('div', 'ml-tools');
    var accBtn = smallBtn('', 'mail', function () { nextAccount(); });
    var webBtn = smallBtn('APRI SUL PC', 'desktop', function () { openWeb(); });
    var refreshBtn = smallBtn('', 'refresh', function () { load(true); });
    tools.appendChild(accBtn); tools.appendChild(webBtn); tools.appendChild(refreshBtn);
    var title = header(root, 'EMAIL', tools);
    var info = el('div', 'ml-info', '');
    var list = el('div', 'w-list scroll');
    root.appendChild(info); root.appendChild(list);
    var reader = el('div', 'ml-reader');
    reader.innerHTML =
      '<div class="ml-rhead"></div>' +
      '<div class="ml-rtitle notr"></div><div class="ml-rmeta notr"></div>' +
      '<div class="ml-body scroll notr"></div>';
    root.appendChild(reader);
    function q(c) { return reader.querySelector('.' + c); }
    var rhead = q('ml-rhead'), rtitle = q('ml-rtitle'), rmeta = q('ml-rmeta'), rbody = q('ml-body');
    rhead.appendChild(smallBtn('INDIETRO', 'back', function () { closeReader(); }));
    rhead.appendChild(smallBtn('APRI SUL PC', 'desktop', function () { openWeb(); }));

    var accounts = [], data = null, alive = true, timer = null, loading = false, openUid = null;

    function current() {
      for (var i = 0; i < accounts.length; i++) if (accounts[i].id === ML.acc) return accounts[i];
      return accounts[0] || null;
    }
    function fmtDate(iso) {
      var t = new Date(Date.parse(iso));
      if (isNaN(t.getTime())) return '';
      var now = new Date();
      if (t.toDateString() === now.toDateString()) return D.pad(t.getHours()) + ':' + D.pad(t.getMinutes());
      var days = (now.getTime() - t.getTime()) / 86400000;
      var names = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
      if (days < 6) return names[t.getDay()] + ' ' + D.pad(t.getHours()) + ':' + D.pad(t.getMinutes());
      return t.getDate() + '/' + (t.getMonth() + 1) + (t.getFullYear() !== now.getFullYear() ? '/' + String(t.getFullYear()).slice(2) : '');
    }
    function who(f) { return (f && (f.name || f.address)) || '(sconosciuto)'; }

    function renderHead() {
      var a = current();
      D.toggleClass(accBtn, 'hidden', accounts.length < 2);
      accBtn.innerHTML = Icons.html('mail') + '<span>' + D.esc(accounts.length > 1 ? 'CAMBIA' : '') + '</span>';
      D.toggleClass(webBtn, 'hidden', !a);
      setText(title, a ? 'EMAIL · ' + a.label + (a.unread ? ' (' + a.unread + ')' : '') : 'EMAIL');
    }

    function render() {
      renderHead();
      list.innerHTML = '';
      var a = current();
      if (!a) {
        setText(info, '');
        list.innerHTML = '<div class="empty">Nessun account email.<br>La posta arriva da Thunderbird sul PC:<br>pannello di controllo, sezione Email.</div>';
        return;
      }
      if (!data || data.account.id !== a.id) {
        setText(info, a.error ? a.error : 'Caricamento…');
        D.toggleClass(info, 'err', !!a.error);
        return;
      }
      setText(info, a.email + '   ·   ' + (data.unread ? data.unread + ' da leggere' : 'tutto letto') + '   ·   ' + data.total + ' in arrivo');
      D.removeClass(info, 'err');
      if (!data.messages.length) { list.innerHTML = '<div class="empty">La posta in arrivo è vuota.</div>'; return; }
      for (var i = 0; i < data.messages.length; i++) {
        var m = data.messages[i];
        var row = el('div', 'ml-row' + (m.seen ? '' : ' unread'));
        row.innerHTML =
          '<div class="ml-when">' + D.esc(fmtDate(m.date)) + '</div>' +
          '<div class="ml-from notr">' + (m.seen ? '' : '<span class="ml-dot"></span>') + D.esc(who(m.from)) + '</div>' +
          '<div class="ml-subj' + (m.subject ? ' notr' : '') + '">' + D.esc(m.subject || '(senza oggetto)') + '</div>';
        bindRow(row, m.uid);
        list.appendChild(row);
      }
    }
    function bindRow(row, uid) {
      D.bindTap(row, { scrollable: true, onTap: function () { openMessage(uid); } });
    }

    function openMessage(uid) {
      var a = current();
      if (!a) return;
      openUid = uid;
      D.addClass(root, 'ml-open');
      setText(rtitle, 'Caricamento…');
      setText(rmeta, '');
      rbody.innerHTML = '';
      D.api.get('/api/mail/message?account=' + encodeURIComponent(a.id) + '&uid=' + encodeURIComponent(uid), function (err, m) {
        if (!alive || openUid !== uid) return;
        if (err) { setText(rtitle, err.message); return; }
        setText(rtitle, m.subject || '(senza oggetto)');
        var from = m.from.name ? m.from.name + ' <' + m.from.address + '>' : m.from.address;
        setText(rmeta, from + '   ·   ' + fmtDate(m.date) + (m.attachments.length ? '   ·   ' + m.attachments.length + ' allegat' + (m.attachments.length === 1 ? 'o' : 'i') : ''));
        rbody.innerHTML = D.esc(m.text || '(nessun testo)').replace(/\n/g, '<br>') +
          (m.truncated ? '<div class="ml-note">Messaggio lungo: il resto è sul PC (APRI SUL PC).</div>' : '') +
          (m.attachments.length ? '<div class="ml-note">' + Icons.html('attach') + ' ' + D.esc(m.attachments.join(', ')) + '</div>' : '');
        rbody.scrollTop = 0;
      }, 30000);
    }
    function closeReader() { openUid = null; D.removeClass(root, 'ml-open'); }

    function nextAccount() {
      if (accounts.length < 2) return;
      var i = 0;
      for (var k = 0; k < accounts.length; k++) if (accounts[k].id === (current() || {}).id) i = k;
      ML.acc = accounts[(i + 1) % accounts.length].id;
      D.store.set('ml:acc', ML.acc);
      data = null; closeReader(); render(); load(false);
    }
    function openWeb() {
      var a = current();
      if (!a) return;
      D.api.post('/api/mail/open', { account: a.id }, function (err, res) {
        app.toast(err ? err.message : res.message, err ? 'err' : 'ok');
      });
    }

    function load(force) {
      if (loading) return;
      loading = true;
      D.addClass(refreshBtn, 'spin');
      D.api.get('/api/mail', function (err, st) {
        if (!alive) return;
        if (err) { loading = false; D.removeClass(refreshBtn, 'spin'); setText(info, err.message); D.addClass(info, 'err'); return; }
        accounts = st.accounts || [];
        var a = current();
        if (!a) { loading = false; D.removeClass(refreshBtn, 'spin'); data = null; render(); return; }
        if (data && data.account.id !== a.id) data = null;
        render();
        D.api.get('/api/mail/list?account=' + encodeURIComponent(a.id) + (force ? '&refresh=1' : ''), function (err2, d) {
          loading = false;
          D.removeClass(refreshBtn, 'spin');
          if (!alive) return;
          if (err2) {
            a.error = err2.message;
            if (!data) render(); else app.toast(err2.message, 'err');
            return;
          }
          a.unread = d.unread;
          data = d;
          render();
        }, 45000);
      }, 15000);
    }
    load(false);
    timer = D.every(60000, 300000, function () { if (!openUid) load(false); });
    return { update: function () {}, resize: function () {}, destroy: function () { alive = false; D.stop(timer); } };
  }

  function gamesWidget(root, tile, app) {
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
  }

  function discordMini(root, tile, app) {
    D.addClass(root, 'w-dcmini');
    header(root, tile.title || 'DISCORD');
    var room = el('div', 'dm-room', '…');
    var people = el('div', 'dm-people', '');
    var ctr = el('div', 'dm-ctr');
    root.appendChild(room); root.appendChild(people); root.appendChild(ctr);
    var st = null, alive = true;
    function btn(icon, label, what) {
      var b = el('div', 'dm-btn');
      b.innerHTML = Icons.html(icon) + '<span>' + label + '</span>';
      D.bindTap(b, { onTap: function () {
        D.api.post('/api/discord/toggle', { what: what }, function (err, d) {
          if (err) return app.toast(err.message, 'err');
          if (d.message) app.toast(d.message, 'info');
          st = d; render();
        });
      } });
      ctr.appendChild(b);
      return b;
    }
    var muteB = btn('mic', 'MUTE', 'mute'), deafB = btn('headset', 'SILENZIA', 'deaf');
    function render() {
      if (!st) return;
      var ready = st.status === 'ready';
      if (!ready) setText(room, st.status === 'setup' ? 'Collega Discord dal pannello sul PC' : (st.message || 'Discord non collegato'));
      else if (!st.channel) setText(room, 'Non sei in una stanza');
      else setText(room, st.channel.name + (st.channel.guild ? ' · ' + st.channel.guild : ''));
      var h = '';
      var mem = st.channel ? st.channel.members : [];
      for (var i = 0; i < mem.length && i < 8; i++) {
        h += '<span class="dm-p' + (mem[i].speaking ? ' talk' : '') + (mem[i].mute || mem[i].deaf ? ' off' : '') + '">' + D.esc(mem[i].name) + '</span>';
      }
      if (mem.length > 8) h += '<span class="dm-p">+' + (mem.length - 8) + '</span>';
      setHtml(people, h);
      var v = st.voice || {};
      D.toggleClass(muteB, 'on', !!v.mute);
      D.toggleClass(deafB, 'on', !!v.deaf);
    }
    function load() {
      D.api.get('/api/discord/state', function (err, d) {
        if (!alive) return;
        st = err ? { status: 'offline', message: err.message } : d;
        render();
      });
    }
    load();
    var timer = D.every(2000, 8000, load);
    return { update: function () {}, resize: function () {}, destroy: function () { alive = false; D.stop(timer); } };
  }

  var TYPES = { system: system, nowplaying: nowplaying, queue: queue, todo: todo, clock: clock, games: gamesWidget, discordmini: discordMini, discord: discord, mail: mailWidget };

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
