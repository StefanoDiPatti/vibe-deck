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

  var GIT_GUIDE = [
    { title: 'IL TUO FLUSSO: UNA MODIFICA DALL\'INIZIO ALLA FINE', note: 'Nella cartella del progetto (es. vibe-deck), in PowerShell o nel terminale di VS Code.', items: [
      ['git checkout main', 'Torna sul ramo principale.'],
      ['git pull', 'Scarica da GitHub le novità (anche quelle fatte dall\'altro PC). Fallo sempre prima di iniziare.'],
      ['git checkout -b feature/nome', 'Crea un branch nuovo per la modifica e ci entra. Nomi tipo feature/..., fix/..., docs/...'],
      ['git status', 'Mostra cosa è cambiato: file modificati, nuovi, pronti per il commit.'],
      ['git add .', 'Prepara per il commit tutte le modifiche della cartella (git add nomefile per uno solo).'],
      ['git commit -m "cosa ho fatto"', 'Salva un punto nella storia, con una frase che spiega la modifica.'],
      ['git push -u origin feature/nome', 'Manda il branch su GitHub. La prima volta con -u, poi basta git push.'],
      ['gh pr create', 'Apre la pull request su GitHub (ti chiede titolo e descrizione). Si può fare anche dal sito.'],
      ['gh pr merge --merge --delete-branch', 'Unisce la pull request in main e cancella il branch. Solo quando sei convinto.', 'warn'],
      ['git checkout main  +  git pull', 'Torni su main aggiornato, pronto per la prossima modifica.']
    ] },
    { title: 'GUARDARE (NON CAMBIA NIENTE)', items: [
      ['git status', 'Su che branch sei e cosa è cambiato.'],
      ['git diff', 'Le righe modificate e non ancora preparate con git add.'],
      ['git diff --staged', 'Le righe già preparate, che finiranno nel prossimo commit.'],
      ['git log --oneline -10', 'Gli ultimi 10 commit, uno per riga.'],
      ['git log --oneline --graph --all', 'La storia di tutti i branch come un albero.'],
      ['git show <commit>', 'Cosa è cambiato in un commit (il codice tipo 5a703aa che vedi nel log).'],
      ['git branch -a', 'Tutti i branch: i tuoi locali e quelli su GitHub (remotes/origin/...).'],
      ['git remote -v', 'A quale repository GitHub è collegata la cartella.'],
      ['git blame <file>', 'Chi e quando ha cambiato ogni riga di un file.']
    ] },
    { title: 'BRANCH', items: [
      ['git branch', 'Elenco dei branch locali; quello con * è il tuo.'],
      ['git switch <nome>', 'Passa a un altro branch (uguale a git checkout <nome>).'],
      ['git switch -c <nome>', 'Crea un branch e ci entra (uguale a git checkout -b).'],
      ['git merge <altro>', 'Porta nel branch attuale le modifiche di un altro branch.', 'warn'],
      ['git branch -d <nome>', 'Cancella un branch locale già unito. Se non è unito git si rifiuta: bene così.'],
      ['git push origin --delete <nome>', 'Cancella il branch su GitHub.', 'warn']
    ] },
    { title: 'SINCRONIZZARE CON GITHUB', items: [
      ['git fetch', 'Scarica le novità senza toccare i tuoi file: dopo puoi guardarle con git log.'],
      ['git pull', 'Scarica e unisce le novità nel branch attuale (fetch + merge).'],
      ['git pull --rebase', 'Come pull, ma mette i tuoi commit locali dopo quelli arrivati: storia più lineare.'],
      ['git push', 'Manda i tuoi commit su GitHub.'],
      ['git clone <url>', 'Scarica un repository la prima volta (es. sul PC Linux).']
    ] },
    { title: 'ANNULLARE E METTERE DA PARTE', note: 'In rosso i comandi che buttano via lavoro: usali solo se sei sicuro.', items: [
      ['git restore --staged <file>', 'Toglie un file da quelli preparati per il commit. Le modifiche restano.'],
      ['git stash', 'Mette da parte le modifiche non salvate e pulisce la cartella (es. per cambiare branch).'],
      ['git stash pop', 'Riprende le modifiche messe da parte.'],
      ['git commit --amend', 'Corregge l\'ultimo commit (messaggio o file dimenticati). Solo se non l\'hai ancora pushato.', 'warn'],
      ['git revert <commit>', 'Crea un commit nuovo che annulla uno vecchio. Sicuro anche dopo il push.'],
      ['git reset --soft HEAD~1', 'Annulla l\'ultimo commit ma tiene le modifiche, pronte da ricommitare.', 'warn'],
      ['git restore <file>', 'Butta via le modifiche non salvate di un file. Non si recuperano.', 'danger'],
      ['git reset --hard', 'Butta via TUTTE le modifiche non salvate e torna all\'ultimo commit. Non si recuperano.', 'danger'],
      ['git push --force', 'Sovrascrive il branch su GitHub con il tuo. Può cancellare lavoro di altri o dell\'altro PC.', 'danger']
    ] },
    { title: 'PRIMA VOLTA SU UN PC', items: [
      ['git config --global user.name "Nome"', 'Il nome che compare nei commit.'],
      ['git config --global user.email "mail"', 'La mail dei commit (quella di GitHub).'],
      ['gh auth login', 'Collega il terminale al tuo account GitHub (serve per gh pr e per il push).'],
      ['git init', 'Trasforma una cartella in un repository git (solo per progetti nuovi).']
    ] }
  ];

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

  function github(root, tile, app) {
    D.addClass(root, 'w-gh');
    var refreshBtn = smallBtn('', 'refresh', function () { load(true); });
    var guideBtn = smallBtn('COMANDI GIT', 'terminal', function () { showGuide(!guideOn); });
    var tools = el('span', 'gh-tools');
    tools.appendChild(guideBtn); tools.appendChild(refreshBtn);
    var title = header(root, 'GITHUB', tools);
    var totals = el('div', 'gh-totals', '');
    var list = el('div', 'w-list scroll');
    var guide = el('div', 'w-list scroll gg hidden');
    guide.innerHTML = guideHtml(GIT_GUIDE);
    root.appendChild(totals); root.appendChild(list); root.appendChild(guide);
    var guideOn = false;
    function showGuide(on) {
      guideOn = on;
      D.store.set('gh:guide', on);
      D.toggleClass(guide, 'hidden', !on);
      D.toggleClass(list, 'hidden', on);
      D.toggleClass(totals, 'hidden', on);
      D.toggleClass(refreshBtn, 'hidden', on);
      D.toggleClass(guideBtn, 'on', on);
      guideBtn.innerHTML = Icons.html(on ? 'github' : 'terminal') + '<span>' + (on ? 'REPOSITORY' : 'COMANDI GIT') + '</span>';
      if (on) guide.scrollTop = 0;
      setText(title, on ? 'COMANDI GIT' : 'GITHUB' + (data && !data.authenticated ? ' (senza token)' : ''));
    }
    var timer = null, data = null;

    function ci(r) {
      if (!r.ci) return '<span class="badge none">CI —</span>';
      if (r.ci.status !== 'completed') return '<span class="badge run">CI …</span>';
      if (r.ci.conclusion === 'success') return '<span class="badge good">CI ✓</span>';
      if (r.ci.conclusion === 'failure') return '<span class="badge bad">CI ✗</span>';
      return '<span class="badge none">CI ' + D.esc(r.ci.conclusion || '?') + '</span>';
    }
    function deploy(r) {
      var d = r.deploy;
      if (!d) return '';
      var cls = d.status !== 'completed' ? 'run' : d.conclusion === 'success' ? 'good' : d.conclusion === 'failure' ? 'bad' : 'none';
      var mark = d.status !== 'completed' ? '…' : d.conclusion === 'success' ? '✓' : d.conclusion === 'failure' ? '✗' : '–';
      return '<span class="badge ' + cls + '" data-what="deploy" title="' + D.esc(d.name) + '">DEPLOY ' + mark + '</span>';
    }

    function render() {
      list.innerHTML = '';
      if (!data) return;
      if (!guideOn) setText(title, 'GITHUB' + (data.authenticated ? '' : ' (senza token)'));
      setText(totals, data.error ? data.error :
        'PR aperte ' + data.totals.prs + '   ·   Issue ' + data.totals.issues + (data.totals.failing ? '   ·   CI falliti ' + data.totals.failing : '') +
        (data.totals.deployFailing ? '   ·   Deploy falliti ' + data.totals.deployFailing : ''));
      D.toggleClass(totals, 'err', !!data.error);
      for (var i = 0; i < data.repos.length; i++) {
        var r = data.repos[i];
        var row = el('div', 'gh-row');
        if (r.error) {
          row.innerHTML = '<div class="gh-name">' + D.esc(r.full) + '</div><div class="gh-msg err">' + D.esc(r.error) + '</div>';
        } else {
          row.setAttribute('data-repo', r.full);
          row.innerHTML =
            '<div class="gh-badges">' +
              '<span class="badge pr" data-what="pulls">PR ' + r.prs + '</span>' +
              '<span class="badge is" data-what="issues">ISSUE ' + r.issues + '</span>' +
              '<span data-what="actions">' + ci(r) + '</span>' + deploy(r) +
            '</div>' +
            '<div class="gh-name">' + D.esc(r.name) + (r.private ? ' <span class="gh-priv">privato</span>' : '') + '</div>' +
            '<div class="gh-msg">' + (r.commit ? '<span class="notr">' + D.esc(r.commit.message) + '</span> <span class="gh-when">· ' + D.esc(D.ago(r.commit.date)) + '</span>' : '') + '</div>';
          bindRow(row, r.full);
        }
        list.appendChild(row);
      }
    }
    function bindRow(row, full) {
      D.bindTap(row, {
        scrollable: true,
        onTap: function (target) {
          var w = D.closestAttr(target, 'data-what', row);
          D.api.post('/api/github/open', { repo: full, what: w ? w.getAttribute('data-what') : 'repo' }, function (err, res) {
            app.toast(err ? err.message : res.message, err ? 'err' : 'ok');
          });
        }
      });
    }
    function load(force) {
      D.addClass(refreshBtn, 'spin');
      D.api.get('/api/github' + (force ? '?refresh=1' : ''), function (err, d) {
        D.removeClass(refreshBtn, 'spin');
        if (err) { setText(totals, err.message); D.addClass(totals, 'err'); return; }
        data = d;
        render();
      }, 30000);
    }
    showGuide(!!D.store.get('gh:guide', false));
    load(false);
    timer = D.every(60000, 300000, function () { load(false); });
    return { update: function () {}, resize: function () {}, destroy: function () { D.stop(timer); } };
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

  function chat(root, tile, app) {
    var provider = tile.provider === 'claude' ? 'claude' : 'ollama';
    D.addClass(root, 'w-chat ' + provider);
    var stKey = 'chat:' + provider;
    var st = CHAT[provider] || (CHAT[provider] = { saved: D.store.get(stKey, { sessionId: null, messages: [], model: null }), busy: false, render: null });

    var head = el('div', 'w-head');
    var title = el('div', 'w-title', provider === 'claude' ? 'CLAUDE' : 'OLLAMA');
    var select = null;
    var right = el('div', 'chat-tools');
    if (provider === 'ollama') {
      select = el('select', 'chat-model');
      right.appendChild(select);
      select.addEventListener('change', function () { st.saved.model = select.value; persist(); }, false);
    } else {
      select = el('span', 'chat-model-label', '');
      right.appendChild(select);
    }
    right.appendChild(smallBtn('NUOVA', 'add', function () {
      st.saved = { sessionId: null, messages: [], model: st.saved.model };
      persist(); render();
    }));
    head.appendChild(title); head.appendChild(right);
    root.appendChild(head);

    var log = el('div', 'chat-log scroll');
    var form = el('div', 'chat-form');
    var input = el('textarea', 'chat-input');
    input.setAttribute('rows', '2');
    input.placeholder = provider === 'claude' ? 'Scrivi a Claude…' : 'Scrivi al modello…';
    var send = el('div', 'chat-send');
    send.innerHTML = Icons.html('send') || 'INVIA';
    form.appendChild(input); form.appendChild(send);
    root.appendChild(log); root.appendChild(form);

    function persist() {
      if (st.saved.messages.length > 40) st.saved.messages = st.saved.messages.slice(-40);
      D.store.set(stKey, st.saved);
    }

    function bubble(m) {
      var b = el('div', 'msg ' + (m.error ? '' : 'notr ') + m.role + (m.error ? ' error' : ''));
      b.innerHTML = m.role === 'user' ? D.esc(m.text).replace(/\n/g, '<br>') : D.richText(m.text);
      return b;
    }
    function render() {
      log.innerHTML = '';
      if (!st.saved.messages.length) {
        log.appendChild(el('div', 'empty', provider === 'claude'
          ? 'Fai una domanda a Claude. La conversazione resta sul PC finché il server è acceso.'
          : 'Scegli un modello e scrivi. Ollama gira sul PC, il tablet mostra solo la risposta.'));
      }
      for (var i = 0; i < st.saved.messages.length; i++) log.appendChild(bubble(st.saved.messages[i]));
      if (st.busy) {
        var t = el('div', 'msg assistant typing');
        t.innerHTML = '<i></i><i></i><i></i>';
        log.appendChild(t);
      }
      log.scrollTop = log.scrollHeight;
      D.toggleClass(send, 'busy', st.busy);
    }

    function submit() {
      var text = input.value.replace(/^\s+|\s+$/g, '');
      if (!text || st.busy) return;
      if (provider === 'ollama' && !(select.value)) { app.toast('Nessun modello Ollama disponibile', 'err'); return; }
      st.busy = true;
      D.addClass(send, 'busy');
      st.saved.messages.push({ role: 'user', text: text });
      input.value = '';
      input.blur();
      persist(); render();
      var body = { sessionId: st.saved.sessionId, text: text };
      if (provider === 'ollama') body.model = select.value;
      D.api.post('/api/' + provider + '/chat', body, function (err, r) {
        st.busy = false;
        D.removeClass(send, 'busy');
        if (err) {
          st.saved.messages.push({ role: 'assistant', text: err.message, error: true });
        } else {
          st.saved.sessionId = r.sessionId;
          st.saved.messages.push({ role: 'assistant', text: r.reply + (r.truncated ? '\n\n(risposta troncata)' : '') });
        }
        persist();
        if (st.render) st.render();
      }, 330000);
    }
    D.bindTap(send, { onTap: submit });

    function loadInfo() {
      if (provider === 'ollama') {
        D.api.get('/api/ollama/models', function (err, d) {
          select.innerHTML = '';
          if (err || !d.running) {
            setText(title, 'OLLAMA · offline');
            var o = el('option', '', 'Ollama non attivo');
            o.value = '';
            select.appendChild(o);
            return;
          }
          setText(title, 'OLLAMA');
          for (var i = 0; i < d.models.length; i++) {
            var opt = el('option', '', d.models[i].name + (d.models[i].sizeGb ? '  (' + d.models[i].sizeGb + ' GB)' : ''));
            opt.value = d.models[i].name;
            select.appendChild(opt);
          }
          var want = st.saved.model || d.defaultModel;
          for (var j = 0; j < select.options.length; j++) if (select.options[j].value === want) select.selectedIndex = j;
        }, 8000);
      } else {
        D.api.get('/api/claude/info', function (err, d) {
          if (err) return;
          setText(select, d.available ? (d.backend === 'cli' ? 'Claude Code' : d.model) : 'non configurato');
          if (!d.available && !st.saved.messages.length) {
            log.innerHTML = '';
            log.appendChild(el('div', 'empty err', d.hint));
          }
        });
      }
    }

    st.render = render;
    D.toggleClass(send, 'busy', st.busy);
    render();
    loadInfo();
    return {
      update: function () {},
      resize: function (w) {
        D.toggleClass(root, 'chat-narrow', w < 560);
        if (select) select.style.maxWidth = (w < 560 ? Math.max(90, Math.round(w * 0.32)) : 280) + 'px';
        title.style.marginRight = (right.offsetWidth ? right.offsetWidth + 12 : 0) + 'px';
        log.scrollTop = log.scrollHeight;
      },
      destroy: function () { if (st.render === render) st.render = null; }
    };
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

  function usageWhen(iso) {
    if (!iso) return '';
    var d = new Date(iso), now = new Date();
    var t = D.pad(d.getHours()) + ':' + D.pad(d.getMinutes());
    if (d.toDateString() === now.toDateString()) return 'alle ' + t;
    var giorni = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
    return giorni[d.getDay()] + ' ' + t;
  }
  function usageBar(label, w) {
    if (!w) return '';
    var lvl = w.percent >= 90 ? ' hot' : w.percent >= 70 ? ' warm' : '';
    return '<div class="cu-row' + lvl + '"><div class="cu-top"><b>' + D.esc(label) + '</b><span>' + w.percent + '%</span></div>' +
      '<div class="cu-bar"><i style="width:' + w.percent + '%"></i></div>' +
      (w.resetsAt ? '<div class="cu-reset">si azzera ' + usageWhen(w.resetsAt) + '</div>' : '') + '</div>';
  }
  function usageHtml(err, u, models) {
    if (err || !u || !u.ok) return '<div class="cu-h">CONSUMI</div><div class="cu-err">' + D.esc(err ? err.message : (u && u.error) || 'Non disponibili') + '</div>';
    var h = '<div class="cu-h">CONSUMI' + (u.stale ? ' <i>(non aggiornati)</i>' : '') + '</div>' + usageBar('Sessione 5 ore', u.fiveHour) + usageBar('Settimana', u.sevenDay);
    if (models) for (var i = 0; i < u.models.length; i++) h += usageBar(u.models[i].name + ' (settimana)', u.models[i]);
    return h;
  }

  function claudeUsage(root, tile) {
    D.addClass(root, 'w-cusage');
    header(root, tile.title || 'CLAUDE');
    var box = el('div', 'cu-box scroll');
    root.appendChild(box);
    var alive = true, big = false;
    function load(force) {
      D.api.get('/api/claude/usage' + (force ? '?refresh=1' : ''), function (err, u) {
        if (alive) setHtml(box, usageHtml(err, u, big));
      });
    }
    D.bindTap(box, { scrollable: true, onTap: function () { load(true); } });
    load(false);
    var timer = D.every(60000, 300000, function () { load(false); });
    return {
      update: function () {},
      resize: function (w, h) { var b = h > 240; if (b !== big) { big = b; load(false); } },
      destroy: function () { alive = false; D.stop(timer); }
    };
  }

  var CL = { mode: D.store.get('cl:mode2', 'code'), sel: D.store.get('cl:sel2', null), info: null, closed: {} };

  function claudeWidget(root, tile, app) {
    D.addClass(root, 'w-claude');
    root.innerHTML =
      '<div class="cl-side">' +
        '<div class="cl-tabs"><div class="cl-tab" data-mode="code">CLAUDE CODE</div><div class="cl-tab" data-mode="dock">CHAT</div></div>' +
        '<div class="cl-list scroll"></div>' +
        '<div class="cl-usage"></div>' +
      '</div>' +
      '<div class="cl-main">' +
        '<div class="cl-head"><div class="cl-title"></div><div class="cl-sub"></div>' +
          '<div class="cl-tools">' +
            '<div class="sbtn cl-stop">' + Icons.html('stop') + '<span>STOP</span></div>' +
            '<div class="sbtn cl-open">' + Icons.html('desktop') + '<span>SUL PC</span></div>' +
            '<div class="sbtn cl-refresh">' + Icons.html('refresh') + '</div>' +
            '<div class="sbtn cl-del">' + Icons.html('trash') + '</div>' +
          '</div></div>' +
        '<div class="cl-log scroll"></div>' +
        '<div class="cl-compose">' +
          '<div class="cl-mic">' + Icons.html('mic') + '</div>' +
          '<textarea class="cl-input" rows="3"></textarea>' +
          '<div class="cl-send">' + Icons.html('send') + '</div>' +
        '</div>' +
      '</div>';

    function q(cls) { return root.querySelector('.' + cls); }
    var list = q('cl-list'), log = q('cl-log'), input = q('cl-input'), send = q('cl-send'), mic = q('cl-mic');
    var titleEl = q('cl-title'), subEl = q('cl-sub'), del = q('cl-del'), stopBtn = q('cl-stop'), openBtn = q('cl-open');
    var tabs = root.querySelectorAll('.cl-tab');
    var desk = null, dock = null, chat = null, alive = true, lastLog = '', pendingNew = null;

    function persist() { D.store.set('cl:mode2', CL.mode); D.store.set('cl:sel2', CL.sel); }
    function ago(ms) { return ms ? D.ago(new Date(ms).toISOString()) : ''; }

    function sectionOf(id) {
      for (var i = 0; desk && i < desk.sections.length; i++) if (desk.sections[i].id === id) return desk.sections[i];
      return null;
    }
    function renderList() {
      for (var t = 0; t < tabs.length; t++) D.toggleClass(tabs[t], 'on', tabs[t].getAttribute('data-mode') === CL.mode);
      var html = '';
      if (CL.mode === 'code') {
        if (!desk) html = '<div class="empty">Carico le sessioni…</div>';
        else if (!desk.available) html = '<div class="empty">App desktop di Claude non trovata su questo PC.</div>';
        else {
          for (var s = 0; s < desk.sections.length; s++) {
            var sec = desk.sections[s], closed = !!CL.closed[sec.id];
            html += '<div class="cl-sec' + (closed ? ' closed' : '') + '" data-sec="' + D.esc(sec.id) + '"><span class="cl-sec-n">' + D.esc(sec.name) + '</span>' +
              (desk.appUi ? '<span class="cl-sec-add" data-add="' + D.esc(sec.id) + '">' + Icons.html('add') + '</span>' : '') + '</div>';
            if (closed) continue;
            for (var i = 0; i < sec.sessions.length; i++) {
              var it = sec.sessions[i];
              var on = CL.sel && CL.sel.kind === 'code' && CL.sel.id === it.id;
              html += '<div class="cl-row' + (on ? ' on' : '') + (it.busy ? ' busy' : '') + '" data-code="' + D.esc(it.id) + '">' +
                '<div class="cl-row-t">' + (it.busy ? '<i class="cl-dot"></i>' : '') + '<span class="notr">' + D.esc(it.title) + '</span></div>' +
                '<div class="cl-row-m">' + D.esc((sec.project ? '' : it.project + ' · ') + (it.queued ? 'messaggio in coda' : it.busy ? 'al lavoro…' : ago(it.updatedAt))) + '</div></div>';
            }
          }
        }
      } else {
        html = '<div class="cl-row cl-newchat' + (CL.sel && CL.sel.kind === 'dock' && !CL.sel.id ? ' on' : '') + '" data-dock="">' + Icons.html('add') + '<b>NUOVA CHAT</b></div>';
        var items = dock ? dock.dock : [];
        for (var k = 0; k < items.length; k++) {
          var c = items[k];
          html += '<div class="cl-row' + (CL.sel && CL.sel.kind === 'dock' && CL.sel.id === c.id ? ' on' : '') + (c.busy ? ' busy' : '') + '" data-dock="' + D.esc(c.id) + '">' +
            '<div class="cl-row-t">' + D.esc(c.title) + '</div><div class="cl-row-m">' + D.esc(c.busy ? 'sta rispondendo…' : ago(c.updatedAt)) + '</div></div>';
        }
        html += '<div class="cl-note">Qui ci sono le chat fatte dal tablet. Quelle di claude.ai e dell\'app restano sul tuo account e non sono leggibili dal PC.</div>';
      }
      list.innerHTML = html;
    }
    function loadList() {
      if (CL.mode === 'code') {
        D.api.get('/api/claude/desktop', function (err, d) {
          if (err || !alive) return;
          desk = d;
          if (CL.mode === 'code') renderList();
        }, 15000);
      } else {
        D.api.get('/api/claude/chats', function (err, d) {
          if (err || !alive) return;
          dock = d;
          if (CL.mode === 'dock') renderList();
        }, 15000);
      }
    }

    function bubbleHtml(m) {
      if (m.role === 'user') return D.esc(m.text).replace(/\n/g, '<br>');
      return D.richText(m.text).replace(/(^|<br>)\[ ([^\]<]{1,80}) \](?=<br>|$)/g, '$1<span class="tool">$2</span>');
    }
    function renderChat(force) {
      var sel = CL.sel;
      var busy = !!(chat && chat.busy);
      var queued = chat && chat.queue && chat.queue.state === 'waiting' ? chat.queue : null;
      D.toggleClass(stopBtn, 'hidden', !(sel && sel.kind === 'code' && busy && desk && desk.appUi));
      D.toggleClass(openBtn, 'hidden', !(sel && sel.kind === 'code'));
      D.toggleClass(del, 'hidden', !(sel && sel.kind === 'dock' && sel.id));
      var html = '';
      if (!sel) {
        setText(titleEl, CL.mode === 'code' ? 'Claude Code' : 'Chat');
        setText(subEl, '');
        html = '<div class="empty">' + (CL.mode === 'code' ? 'Scegli una sessione a sinistra: quello che scrivi qui arriva nella sessione aperta nell\'app sul PC. Con + accanto a una sezione ne apri una nuova.' : 'Scegli una chat o premi NUOVA CHAT.') + '</div>';
      } else if (sel.kind === 'new') {
        var sec = sectionOf(sel.section);
        setText(titleEl, 'Nuova sessione');
        setText(subEl, sec ? 'in ' + sec.name + (sec.sessions[0] ? ' · ' + sec.sessions[0].project : '') : '');
        html = pendingNew ? '<div class="msg user">' + D.esc(pendingNew).replace(/\n/g, '<br>') + '</div><div class="msg assistant typing"><i></i><i></i><i></i></div>'
          : '<div class="empty">Scrivi il primo messaggio: la sessione si apre nell\'app sul PC, nella stessa cartella delle altre di questa sezione.</div>';
      } else if (sel.kind === 'dock' && !sel.id) {
        setText(titleEl, 'Nuova chat');
        setText(subEl, CL.info && CL.info.available ? (CL.info.backend === 'api' ? 'Claude API · ' + CL.info.model : 'Claude Code (il tuo abbonamento)') : '');
        html = '<div class="empty">Scrivi o detta un messaggio.</div>';
      } else if (!chat) {
        html = '<div class="empty">Caricamento…</div>';
      } else {
        setText(titleEl, chat.title);
        var sub = sel.kind === 'code'
          ? chat.project + (queued ? ' · messaggio in coda: parte quando Claude finisce' : busy ? ' · Claude sta lavorando…' : '')
          : (chat.subtitle || '');
        setText(subEl, sub);
        for (var i = 0; i < chat.messages.length; i++) {
          var m = chat.messages[i];
          html += '<div class="msg ' + m.role + (m.error ? ' error' : '') + '">' + bubbleHtml(m) + '</div>';
        }
        if (queued) html += '<div class="msg user queued">' + D.esc(queued.text).replace(/\n/g, '<br>') + '<span class="cl-q">in coda</span></div>';
        if (busy || queued) html += '<div class="msg assistant typing"><i></i><i></i><i></i></div>';
        if (chat.queue && chat.queue.state === 'error') html += '<div class="msg assistant error">Non inviato: ' + D.esc(chat.queue.error) + '</div>';
      }
      if (force || html !== lastLog) {
        var atEnd = log.scrollTop + log.clientHeight >= log.scrollHeight - 40;
        log.innerHTML = html;
        lastLog = html;
        if (force || atEnd) log.scrollTop = log.scrollHeight;
      }
    }
    function loadChat(force) {
      var sel = CL.sel;
      if (!sel || sel.kind === 'new' || (sel.kind === 'dock' && !sel.id)) { chat = null; renderChat(force); return; }
      var url = sel.kind === 'code' ? '/api/claude/desktop/session?id=' + encodeURIComponent(sel.id)
        : '/api/claude/chat?kind=dock&id=' + encodeURIComponent(sel.id);
      D.api.get(url, function (err, d) {
        if (!alive || CL.sel !== sel) return;
        if (err) { chat = null; CL.sel = null; persist(); renderChat(true); app.toast(err.message, 'err'); return; }
        var wasBusy = chat && (chat.busy || (chat.queue && chat.queue.state === 'waiting'));
        chat = d;
        renderChat(force);
        if (wasBusy && !d.busy) loadList();
      }, 15000);
    }
    function select(sel) {
      CL.sel = sel;
      if (sel) CL.mode = sel.kind === 'dock' ? 'dock' : 'code';
      chat = null;
      pendingNew = null;
      persist();
      renderList();
      renderChat(true);
      loadChat(true);
    }

    function post(url, body, done) {
      D.addClass(send, 'busy');
      D.api.post(url, body, function (err, r) {
        D.removeClass(send, 'busy');
        done(err, r);
      }, 60000);
    }
    function submit() {
      var text = input.value.replace(/^\s+|\s+$/g, '');
      var sel = CL.sel;
      if (!text) { input.focus(); return; }
      if (!sel) { app.toast(CL.mode === 'code' ? 'Scegli prima una sessione' : 'Scegli una chat', 'err'); return; }
      voice.stop();
      input.value = '';
      input.blur();
      if (sel.kind === 'code') {
        post('/api/claude/desktop/send', { id: sel.id, text: text }, function (err) {
          if (err) { input.value = text; return app.toast(err.message, 'err'); }
          app.toast('Inviato alla sessione sul PC', 'ok');
          loadChat(true);
          loadList();
        });
      } else if (sel.kind === 'new') {
        pendingNew = text;
        renderChat(true);
        post('/api/claude/desktop/new', { section: sel.section, text: text }, function (err) {
          pendingNew = null;
          if (err) { input.value = text; renderChat(true); return app.toast(err.message, 'err'); }
          app.toast('Sessione aperta sul PC', 'ok');
          var tries = 0;
          var known = {};
          var sec = sectionOf(sel.section);
          for (var i = 0; sec && i < sec.sessions.length; i++) known[sec.sessions[i].id] = true;
          (function look() {
            D.api.get('/api/claude/desktop', function (e2, d) {
              if (!alive || CL.sel !== sel) return;
              if (!e2) {
                desk = d;
                var s2 = sectionOf(sel.section);
                for (var j = 0; s2 && j < s2.sessions.length; j++) if (!known[s2.sessions[j].id]) return select({ kind: 'code', id: s2.sessions[j].id });
              }
              if (++tries < 10) setTimeout(look, 1500); else renderList();
            });
          })();
        });
      } else {
        post('/api/claude/send', { kind: 'dock', id: sel.id || null, text: text }, function (err, r) {
          if (err) { input.value = text; return app.toast(err.message, 'err'); }
          if (!sel.id && r.chatId) { CL.sel = { kind: 'dock', id: r.chatId }; persist(); }
          loadList();
          loadChat(true);
        });
      }
    }

    var voice = dictation({ mic: mic, input: input, app: app, serverVoice: function () { return !!(CL.info && CL.info.voiceServer); } });

    for (var t = 0; t < tabs.length; t++) (function (tab) {
      D.bindTap(tab, { onTap: function () { CL.mode = tab.getAttribute('data-mode'); CL.sel = null; chat = null; persist(); renderList(); renderChat(true); loadList(); } });
    })(tabs[t]);
    D.bindTap(list, {
      scrollable: true,
      onTap: function (target) {
        var add = D.closestAttr(target, 'data-add', list);
        if (add) return select({ kind: 'new', section: add.getAttribute('data-add') });
        var sec = D.closestAttr(target, 'data-sec', list);
        if (sec) { var id = sec.getAttribute('data-sec'); CL.closed[id] = !CL.closed[id]; return renderList(); }
        var row = D.closestAttr(target, 'data-code', list);
        if (row) return select({ kind: 'code', id: row.getAttribute('data-code') });
        row = D.closestAttr(target, 'data-dock', list);
        if (row) select({ kind: 'dock', id: row.getAttribute('data-dock') || null });
      }
    });
    D.bindTap(send, { onTap: submit });
    D.bindTap(q('cl-refresh'), { onTap: function () { loadList(); loadChat(true); } });
    D.bindTap(openBtn, {
      onTap: function () {
        if (!CL.sel || CL.sel.kind !== 'code') return;
        D.api.post('/api/claude/desktop/open', { id: CL.sel.id }, function (err) {
          app.toast(err ? err.message : 'Aperta nell\'app sul PC', err ? 'err' : 'ok');
        });
      }
    });
    D.bindTap(stopBtn, {
      hold: 600,
      onTap: function () {
        if (!CL.sel || CL.sel.kind !== 'code') return;
        D.api.post('/api/claude/desktop/stop', { id: CL.sel.id }, function (err, r) {
          if (err) return app.toast(err.message, 'err');
          app.toast(r.stopped ? 'Claude fermato' : 'Claude non stava lavorando', 'ok');
          loadChat(true);
        }, 30000);
      }
    });
    D.bindTap(del, {
      hold: 900,
      onTap: function () {
        if (!CL.sel || CL.sel.kind !== 'dock' || !CL.sel.id) return;
        D.api.post('/api/claude/delete', { id: CL.sel.id }, function (err) {
          if (err) return app.toast(err.message, 'err');
          app.toast('Chat eliminata', 'ok');
          select(null);
          loadList();
        });
      }
    });
    input.placeholder = 'Scrivi o detta a Claude…';

    D.api.get('/api/claude/info', function (err, inf) { if (!err && alive) CL.info = inf; });
    renderList();
    renderChat(true);
    loadList();
    loadChat(true);
    var usageEl = q('cl-usage');
    function loadUsage(force) {
      D.api.get('/api/claude/usage' + (force ? '?refresh=1' : ''), function (err, u) {
        if (!alive) return;
        usageEl.innerHTML = usageHtml(err, u, true);
      });
    }
    D.bindTap(usageEl, { onTap: function () { loadUsage(true); } });
    loadUsage(false);

    var chatTimer = D.every(2500, 10000, function () { loadChat(false); });
    var listTimer = D.every(8000, 60000, loadList);
    var usageTimer = D.every(60000, 300000, function () { loadUsage(false); });

    return {
      update: function () {},
      resize: function () { log.scrollTop = log.scrollHeight; },
      destroy: function () { alive = false; voice.stop(); D.stop(chatTimer); D.stop(listTimer); D.stop(usageTimer); }
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

  var VDESK_GUIDE = {
    windows: [
      { title: 'LE BASI', note: 'Windows 10 e 11. Le finestre restano aperte anche sui desktop che non stai guardando.', items: [
        ['Win + Tab', 'Visualizzazione attività: vedi tutti i desktop e le finestre. Da qui crei, rinomini e riordini i desktop.'],
        ['Win + Ctrl + D', 'Crea un desktop nuovo e ci entra.'],
        ['Win + Ctrl + →', 'Passa al desktop a destra.'],
        ['Win + Ctrl + ←', 'Passa al desktop a sinistra.'],
        ['Win + Ctrl + F4', 'Chiude il desktop attuale. Le sue finestre non si chiudono: passano al desktop vicino.', 'warn']
      ] },
      { title: 'SPOSTARE LE FINESTRE TRA I DESKTOP', note: 'Windows non ha una scorciatoia pronta per questo: si fa da Win + Tab.', items: [
        ['Win + Tab → trascina', 'Trascina la miniatura di una finestra sul desktop che vuoi, in alto (o sul pulsante + per un desktop nuovo).'],
        ['Win + Tab → tasto destro', 'Sulla miniatura: "Sposta in" un altro desktop, anche uno nuovo.'],
        ['Mostra su tutti i desktop', 'Stesso menu: la finestra (o tutte quelle dell\'app) resta visibile su ogni desktop. Comodo per musica e chat.']
      ] },
      { title: 'TOUCHPAD', items: [
        ['4 dita ← / →', 'Cambia desktop.'],
        ['4 dita ↑', 'Visualizzazione attività (come Win + Tab).'],
        ['4 dita ↓', 'Mostra il desktop (riduce tutto).']
      ] },
      { title: 'FINESTRE E MONITOR (UTILI INSIEME)', items: [
        ['Alt + Tab', 'Cambia finestra. Di base solo quelle del desktop attuale: si cambia in Impostazioni → Sistema → Multitasking → Desktop.'],
        ['Win + ← / → / ↑ / ↓', 'Affianca la finestra a metà schermo, la ingrandisce o la riduce (Snap).'],
        ['Win + Z', 'Sceglie una disposizione di Snap (Windows 11).'],
        ['Win + Shift + ← / →', 'Sposta la finestra sull\'altro monitor, mantenendo la posizione.'],
        ['Win + D', 'Mostra il desktop; ripremi per tornare alle finestre.'],
        ['Win + Home', 'Riduce tutte le finestre tranne quella attiva.']
      ] },
      { title: 'TRUCCHI', items: [
        ['Nome e sfondo', 'In Win + Tab, tasto destro su un desktop: "Rinomina" e "Scegli sfondo". Es. LAVORO, GIOCO, STREAM.'],
        ['Barra delle applicazioni', 'Impostazioni → Sistema → Multitasking → Desktop: scegli se la barra mostra le finestre di tutti i desktop.'],
        ['Dal tablet', 'Qui in SCHERMI, sotto le finestre: tocca un desktop per passarci, + per crearne uno, tieni premuta la X per chiuderlo.']
      ] }
    ],
    linux: [
      { title: 'KDE PLASMA (IL TUO LINUX)', note: 'Scorciatoie di base di Plasma 6. Meta è il tasto Windows. Si cambiano in Impostazioni di sistema → Scorciatoie → KWin.', items: [
        ['Meta + W', 'Panoramica: tutti i desktop e le finestre. Da qui aggiungi (+) e rinomini i desktop.'],
        ['Meta + G', 'Griglia dei desktop: tutti i desktop affiancati, trascini le finestre dall\'uno all\'altro.'],
        ['Ctrl + F1 … F4', 'Va direttamente al desktop 1, 2, 3 o 4.'],
        ['Meta + Ctrl + ← / →', 'Passa al desktop a sinistra o a destra.'],
        ['Meta + Ctrl + Shift + ← / →', 'Porta la finestra attiva sul desktop a sinistra o a destra (e ci vai con lei).'],
        ['Alt + F3', 'Menu della finestra: "Sposta su desktop" o "Tutti i desktop" (visibile ovunque).']
      ] },
      { title: 'KDE: QUANTI DESKTOP E COME', items: [
        ['Desktop virtuali', 'Impostazioni di sistema → cerca "Desktop virtuali": numero, righe, nomi e scorciatoie. Di base ce n\'è uno solo.'],
        ['Attività', 'Plasma ha anche le Attività (Meta + Q): gruppi di desktop con sfondi e widget diversi. Diverse dai desktop virtuali.'],
        ['4 dita ← / →', 'Touchpad su Wayland: cambia desktop.'],
        ['4 dita ↑ / ↓', 'Touchpad: Panoramica e griglia dei desktop.']
      ] },
      { title: 'GNOME (SE USI UBUNTU E SIMILI)', note: 'In GNOME i desktop si chiamano spazi di lavoro e se ne crea uno nuovo da solo quando l\'ultimo si riempie.', items: [
        ['Super', 'Attività: vedi tutti gli spazi di lavoro e le finestre.'],
        ['Super + PagSu / PagGiù', 'Spazio di lavoro precedente o successivo (anche Ctrl + Alt + ← / →).'],
        ['Super + Shift + PagSu / PagGiù', 'Porta la finestra sullo spazio di lavoro precedente o successivo.'],
        ['3 dita ← / →', 'Touchpad: cambia spazio di lavoro.']
      ] },
      { title: 'FINESTRE E MONITOR', items: [
        ['Alt + Tab', 'Cambia finestra (in KDE di base solo quelle del desktop attuale).'],
        ['Meta + ← / → / ↑ / ↓', 'Affianca la finestra a metà o in un quarto di schermo (KDE e GNOME).'],
        ['Meta + Shift + ← / →', 'Sposta la finestra sull\'altro monitor.'],
        ['Meta + D', 'Mostra il desktop (KDE). In GNOME: Super + D.'],
        ['Alt + F4', 'Chiude la finestra attiva.', 'warn']
      ] }
    ]
  };

  function vdeskGuide(root, sys, onClose) {
    var btns = {};
    var tools = el('span', 'gh-tools');
    btns.windows = smallBtn('WINDOWS', 'desktop', function () { show('windows'); });
    btns.linux = smallBtn('LINUX', 'terminal', function () { show('linux'); });
    tools.appendChild(btns.windows); tools.appendChild(btns.linux);
    if (onClose) tools.appendChild(smallBtn('', 'close', onClose));
    var title = header(root, 'DESKTOP VIRTUALI', tools);
    var guide = el('div', 'w-list scroll gg');
    root.appendChild(guide);
    function show(sys) {
      if (!VDESK_GUIDE[sys]) sys = 'windows';
      guide.innerHTML = guideHtml(VDESK_GUIDE[sys]);
      guide.scrollTop = 0;
      D.toggleClass(btns.windows, 'on', sys === 'windows');
      D.toggleClass(btns.linux, 'on', sys === 'linux');
      setText(title, 'DESKTOP VIRTUALI · ' + (sys === 'linux' ? 'LINUX' : 'WINDOWS'));
    }
    show(sys);
    return { show: show };
  }

  function vdeskWidget(root, tile, app) {
    D.addClass(root, 'w-vdesk');
    vdeskGuide(root, tile && tile.system);
    return { update: function () {}, resize: function () {}, destroy: function () {} };
  }

  var SC = { mon: D.store.get('sc:mon', ''), layout: D.store.get('sc:layout', 'half'), zone: null, placed: {} };
  function screensWidget(root, tile, app) {
    D.addClass(root, 'w-screens');
    root.innerHTML =
      '<div class="sc-left">' +
        '<div class="sc-head"><span class="sc-title">SCHERMI</span><span class="sc-hint"></span></div>' +
        '<div class="sc-map"></div>' +
        '<div class="sc-layouts"></div>' +
        '<div class="sc-open"></div>' +
      '</div>' +
      '<div class="sc-right">' +
        '<div class="sc-whead">FINESTRE APERTE</div>' +
        '<div class="sc-wins scroll"></div>' +
        '<div class="sc-dhead">DESKTOP VIRTUALI<span class="sc-dsub">tocca per passarci · trascinaci una finestra</span></div>' +
        '<div class="sc-desks"></div>' +
      '</div>' +
      '<div class="sc-guide w-vdesk hidden"></div>';
    function q(c) { return root.querySelector('.' + c); }
    var map = q('sc-map'), layoutsEl = q('sc-layouts'), openEl = q('sc-open'), winsEl = q('sc-wins'), hint = q('sc-hint');
    var desksEl = q('sc-desks'), guideEl = q('sc-guide');
    var desks = null, deskBusy = false;

    var helpBtn = smallBtn('GUIDA', 'info', function () { D.removeClass(guideEl, 'hidden'); });
    D.addClass(helpBtn, 'sc-help');
    q('sc-left').appendChild(helpBtn);
    vdeskGuide(guideEl, tile.system === 'linux' ? 'linux' : 'windows', function () { D.addClass(guideEl, 'hidden'); });

    function deskCard(d) {
      var n = d.windows ? d.windows.length : 0;
      return '<div class="sc-dk' + (d.current ? ' on' : '') + '" data-desk="' + D.esc(d.id) + '">' +
        Icons.html('desktop', 'sc-dkic') + '<b class="sc-dkn">' + d.n + '</b>' +
        '<span class="sc-dkname">' + D.esc(d.name) + '</span>' +
        '<span class="sc-dksub">' + (d.current ? 'sei qui' : n + (n === 1 ? ' finestra' : ' finestre')) + '</span>' +
        (desks.desktops.length > 1 ? '<span class="sc-dkx" data-del="' + D.esc(d.id) + '">' + Icons.html('close') + '</span>' : '') +
        '</div>';
    }
    function renderDesks() {
      D.toggleClass(root, 'sc-dbusy', deskBusy);
      if (!desks) { desksEl.innerHTML = '<div class="empty">Carico…</div>'; return; }
      if (!desks.supported) { desksEl.innerHTML = '<div class="empty">' + D.esc(desks.message || 'Non disponibili su questo sistema') + '</div>'; return; }
      var html = '';
      for (var i = 0; i < desks.desktops.length; i++) html += deskCard(desks.desktops[i]);
      if (desks.desktops.length < (desks.max || 3)) html += '<div class="sc-dk sc-dknew" data-new="1">' + Icons.html('add', 'sc-dkic') + '<span class="sc-dkname">Nuovo</span></div>';
      desksEl.innerHTML = html;
      var xs = desksEl.querySelectorAll('.sc-dkx');
      for (var k = 0; k < xs.length; k++) bindClose(xs[k]);
    }
    var xFired = 0;
    function bindClose(x) {
      D.bindTap(x, { hold: 700, onTap: function () {
        xFired = new Date().getTime();
        deskAction({ action: 'delete', desktop: x.getAttribute('data-del') }, function () { return 'Desktop chiuso: le sue finestre sono passate a quello vicino'; });
      } });
    }
    var lastDesks = '';
    function loadDesks() {
      if (deskBusy) return;
      D.api.get('/api/screens/desktops', function (err, d) {
        if (!alive || deskBusy) return;
        if (err) {
          if (!desks) desksEl.innerHTML = '<div class="empty err">' + D.esc(err.code === 'NOT_FOUND' ?
            'Il PC ha una versione vecchia della dock: riavviala (icona vicino all\'orologio → Riavvia).' : err.message) + '</div>';
          return;
        }
        var key = JSON.stringify(d);
        if (key === lastDesks) return;
        lastDesks = key; desks = d; renderDesks();
      });
    }
    function deskAction(body, msg) {
      if (deskBusy) return;
      deskBusy = true; renderDesks();
      D.api.post('/api/screens/desktops', body, function (err, d) {
        deskBusy = false;
        if (err) { app.toast(err.message, 'err'); lastDesks = ''; renderDesks(); loadDesks(); return; }
        desks = d; lastDesks = JSON.stringify(d); renderDesks();
        if (msg) app.toast(msg(d), 'ok');
        lastWins = ''; setTimeout(loadWins, 300);
      }, 15000);
    }
    function curDesk(d) {
      for (var i = 0; d && i < d.desktops.length; i++) if (d.desktops[i].current) return d.desktops[i];
      return null;
    }
    D.bindTap(desksEl, {
      scrollable: true,
      onTap: function (t) {
        if (D.closestAttr(t, 'data-del', desksEl)) {
          if (new Date().getTime() - xFired > 1500) app.toast('Tieni premuta la X per chiudere il desktop', 'info');
          return;
        }
        if (D.closestAttr(t, 'data-new', desksEl)) {
          return deskAction({ action: 'create' }, function (d) { var c = curDesk(d); return 'Creato ' + (c ? c.name : 'un desktop nuovo'); });
        }
        var c = D.closestAttr(t, 'data-desk', desksEl);
        if (!c || D.hasClass(c, 'on')) return;
        D.addClass(c, 'busy');
        deskAction({ action: 'switch', desktop: c.getAttribute('data-desk') });
      }
    });
    var info = null, wins = null, alive = true, error = '';

    function mon(id) {
      for (var i = 0; info && i < info.monitors.length; i++) if (info.monitors[i].id === id) return info.monitors[i];
      return null;
    }
    function layout(id) {
      for (var i = 0; info && i < info.layouts.length; i++) if (info.layouts[i].id === id) return info.layouts[i];
      return info ? info.layouts[0] : null;
    }
    function zones(l, m) {
      var out = [];
      for (var i = 0; i < l.zones.length; i++) {
        var z = l.zones[i];
        out.push(m && m.portrait ? [z[1], z[0], z[3], z[2]] : z);
      }
      return out;
    }
    function pct(v) { return (Math.round(v * 10000) / 100) + '%'; }
    function short(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

    function setHint() {
      var m = mon(SC.mon);
      if (error) { hint.innerHTML = '<b class="err">' + D.esc(error) + '</b>'; return; }
      if (!m) { hint.innerHTML = ''; return; }
      hint.innerHTML = SC.zone === null ? 'tocca una zona del monitor ' + m.n : 'ora tocca una finestra a destra';
    }

    function renderMap() {
      if (!info) { map.innerHTML = '<div class="empty">' + D.esc(error || 'Carico i monitor…') + '</div>'; return; }
      var list = info.monitors;
      var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, i;
      for (i = 0; i < list.length; i++) {
        minX = Math.min(minX, list[i].x); minY = Math.min(minY, list[i].y);
        maxX = Math.max(maxX, list[i].x + list[i].w); maxY = Math.max(maxY, list[i].y + list[i].h);
      }
      var W = map.offsetWidth - 16, H = map.offsetHeight - 16;
      if (W < 50 || H < 50) return;
      var k = Math.min(W / (maxX - minX), H / (maxY - minY));
      var ox = 8 + (W - (maxX - minX) * k) / 2, oy = 8 + (H - (maxY - minY) * k) / 2;
      var l = layout(SC.layout), html = '';
      for (i = 0; i < list.length; i++) {
        var m = list[i], sel = m.id === SC.mon;
        var x = Math.round(ox + (m.x - minX) * k) + 3, y = Math.round(oy + (m.y - minY) * k) + 3;
        var w = Math.round(m.w * k) - 6, h = Math.round(m.h * k) - 6;
        html += '<div class="sc-mon' + (sel ? ' sel' : '') + '" data-mon="' + D.esc(m.id) + '" style="left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px">';
        if ((sel || drag) && l) {
          var zs = zones(l, m);
          for (var z = 0; z < zs.length; z++) {
            var placed = SC.placed[m.id + '|' + l.id + '|' + z];
            html += '<div class="sc-zone' + (SC.zone === z ? ' on' : '') + '" data-zone="' + z + '" style="left:' + pct(zs[z][0]) + ';top:' + pct(zs[z][1]) + ';width:' + pct(zs[z][2]) + ';height:' + pct(zs[z][3]) + '">' +
              '<div class="sc-zin"><b>' + (z + 1) + '</b>' + (placed ? '<span>' + D.esc(short(placed, 28)) + '</span>' : '') + '</div></div>';
          }
        }
        html += '<div class="sc-mlabel"><b>' + m.n + '</b> ' + D.esc(m.name || (m.primary ? 'Principale' : 'Monitor')) +
          '<span>' + m.w + '×' + m.h + (info.target === m.id ? ' · app qui' : '') + '</span></div></div>';
      }
      map.innerHTML = html;
      setHint();
    }

    function renderLayouts() {
      if (!info) { layoutsEl.innerHTML = ''; return; }
      var m = mon(SC.mon), html = '';
      for (var i = 0; i < info.layouts.length; i++) {
        var l = info.layouts[i], zs = zones(l, m), inner = '';
        for (var z = 0; z < zs.length; z++) {
          inner += '<i style="left:' + pct(zs[z][0]) + ';top:' + pct(zs[z][1]) + ';width:' + pct(zs[z][2]) + ';height:' + pct(zs[z][3]) + '"></i>';
        }
        html += '<div class="sc-lay' + (l.id === SC.layout ? ' on' : '') + (m && m.portrait ? ' tall' : '') + '" data-layout="' + l.id + '"><div class="sc-lbox">' + inner + '</div><span>' + D.esc(l.name) + '</span></div>';
      }
      layoutsEl.innerHTML = html;
    }

    function renderOpen() {
      if (!info) { openEl.innerHTML = ''; return; }
      var html = '<span class="sc-olabel">APRI LE APP SU</span><div class="sc-opt' + (!info.target ? ' on' : '') + '" data-target="">AUTO</div>';
      for (var i = 0; i < info.monitors.length; i++) {
        var m = info.monitors[i];
        html += '<div class="sc-opt' + (info.target === m.id ? ' on' : '') + '" data-target="' + D.esc(m.id) + '">' + Icons.html('desktop') + m.n + '</div>';
      }
      openEl.innerHTML = html;
    }

    function renderWins() {
      if (!wins) { winsEl.innerHTML = '<div class="empty">Carico…</div>'; return; }
      var html = '';
      for (var i = 0; i < wins.length; i++) {
        var w = wins[i], m = mon(w.monitor);
        html += '<div class="sc-win' + (w.active ? ' active' : '') + (w.state === 'min' ? ' min' : '') + '" data-win="' + D.esc(w.id) + '">' +
          '<span class="sc-wmon">' + (m ? m.n : '?') + '</span>' +
          '<span class="sc-wtitle notr">' + D.esc(w.title) + '</span>' +
          '<span class="sc-wproc">' + D.esc(w.process) + (w.state === 'min' ? ' · ridotta' : w.state === 'max' ? ' · ingrandita' : '') + '</span>' +
          '<span class="sc-wbtn" data-act="minimize">' + Icons.html('minimize') + '</span>' +
          '<span class="sc-wbtn" data-act="maximize">' + Icons.html('fullscreen') + '</span>' +
          '</div>';
      }
      winsEl.innerHTML = html || '<div class="empty">Nessuna finestra aperta</div>';
    }

    function renderAll() { renderMap(); renderLayouts(); renderOpen(); renderWins(); }

    function loadInfo() {
      D.api.get('/api/screens', function (err, d) {
        if (!alive) return;
        if (err) { error = err.message; info = null; renderAll(); return; }
        error = '';
        info = d;
        if (!mon(SC.mon)) {
          SC.mon = info.target || (info.monitors[0] ? info.monitors[0].id : '');
          for (var i = 0; i < info.monitors.length; i++) if (!info.target && info.monitors[i].primary) SC.mon = info.monitors[i].id;
        }
        renderAll();
      });
    }
    var lastWins = '';
    function loadWins() {
      D.api.get('/api/screens/windows', function (err, list) {
        if (!alive || err) return;
        var key = JSON.stringify(list);
        if (key === lastWins) return;
        lastWins = key;
        wins = list;
        renderWins();
      });
    }

    D.bindTap(map, {
      onTap: function (t) {
        var zEl = D.closestAttr(t, 'data-zone', map);
        var mEl = D.closestAttr(t, 'data-mon', map);
        if (!mEl) return;
        var id = mEl.getAttribute('data-mon');
        if (id !== SC.mon) {
          SC.mon = id; SC.zone = null;
          D.store.set('sc:mon', id);
          renderMap(); renderLayouts();
          return;
        }
        if (zEl) {
          var z = parseInt(zEl.getAttribute('data-zone'), 10);
          SC.zone = SC.zone === z ? null : z;
          renderMap();
        }
      }
    });
    D.bindTap(layoutsEl, {
      onTap: function (t) {
        var l = D.closestAttr(t, 'data-layout', layoutsEl);
        if (!l) return;
        SC.layout = l.getAttribute('data-layout');
        D.store.set('sc:layout', SC.layout);
        SC.zone = 0;
        renderMap(); renderLayouts();
      }
    });
    D.bindTap(openEl, {
      onTap: function (t) {
        var o = D.closestAttr(t, 'data-target', openEl);
        if (!o) return;
        var id = o.getAttribute('data-target');
        D.api.post('/api/screens/target', { monitor: id || null }, function (err, d) {
          if (err) return app.toast(err.message, 'err');
          info = d;
          var m = mon(d.target);
          app.toast(m ? 'Le app dal tablet si aprono sul monitor ' + m.n : 'Le app si aprono dove decide il sistema', 'ok');
          renderMap(); renderOpen();
        });
      }
    });
    D.bindTap(winsEl, {
      scrollable: true,
      onTap: function (t) {
        if (drag || new Date().getTime() - dragEnded < 700) return;
        var row = D.closestAttr(t, 'data-win', winsEl);
        if (!row) return;
        var id = row.getAttribute('data-win');
        var act = D.closestAttr(t, 'data-act', row);
        if (act) {
          D.api.post('/api/screens/window', { window: id, action: act.getAttribute('data-act') }, function (err) {
            if (err) return app.toast(err.message, 'err');
            lastWins = ''; setTimeout(loadWins, 300);
          });
          return;
        }
        var title = row.querySelector('.sc-wtitle').textContent;
        if (SC.zone === null || !mon(SC.mon)) {
          D.api.post('/api/screens/window', { window: id, action: 'focus' }, function (err) {
            if (err) return app.toast(err.message, 'err');
            app.toast('In primo piano: ' + short(title, 40), 'ok');
          });
          return;
        }
        var zone = SC.zone, monId = SC.mon, lay = layout(SC.layout);
        D.addClass(row, 'busy');
        D.api.post('/api/screens/place', { window: id, monitor: monId, layout: lay.id, zone: zone }, function (err) {
          D.removeClass(row, 'busy');
          if (err) return app.toast(err.message, 'err');
          SC.placed[monId + '|' + lay.id + '|' + zone] = title;
          SC.zone = zone + 1 < lay.zones.length ? zone + 1 : null;
          renderMap();
          lastWins = ''; setTimeout(loadWins, 400);
        });
      }
    });

    var drag = null, dragEnded = 0, hold = null, holdT = null;
    function now() { return new Date().getTime(); }
    function local(x, y) {
      if (D.hasClass(document.body, 'rot')) return { x: y, y: document.body.offsetHeight - x };
      return { x: x, y: y };
    }
    function dropAt(x, y) {
      var el = document.elementFromPoint(x, y);
      if (!el) return null;
      var n = D.closestAttr(el, 'data-new', root);
      if (n) return { kind: 'new', el: n };
      var d = D.closestAttr(el, 'data-desk', root);
      if (d) return { kind: 'desk', el: d, id: d.getAttribute('data-desk') };
      var m = D.closestAttr(el, 'data-mon', root);
      var z = D.closestAttr(el, 'data-zone', root);
      if (z && m) return { kind: 'zone', el: z, id: m.getAttribute('data-mon'), zone: parseInt(z.getAttribute('data-zone'), 10) };
      if (m) return { kind: 'mon', el: m, id: m.getAttribute('data-mon') };
      return null;
    }
    function startDrag(row, x, y) {
      var title = row.querySelector('.sc-wtitle').textContent;
      drag = { id: row.getAttribute('data-win'), title: title, row: row, target: null };
      D.addClass(row, 'dragging');
      D.addClass(root, 'sc-dragging');
      renderMap();
      var g = D.el('div', 'sc-ghost');
      g.innerHTML = Icons.html('window') + D.esc(short(title, 30));
      document.body.appendChild(g);
      drag.ghost = g;
      moveDrag(x, y);
    }
    function moveDrag(x, y) {
      var p = local(x, y);
      drag.ghost.style.left = Math.round(p.x + 14) + 'px';
      drag.ghost.style.top = Math.round(p.y - 46) + 'px';
      var t = dropAt(x, y);
      if (drag.target && (!t || t.el !== drag.target.el)) D.removeClass(drag.target.el, 'drop');
      if (t) D.addClass(t.el, 'drop');
      drag.target = t;
    }
    function endDrag(cancel) {
      var d = drag;
      drag = null;
      dragEnded = now();
      if (d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
      D.removeClass(d.row, 'dragging');
      D.removeClass(root, 'sc-dragging');
      if (d.target) D.removeClass(d.target.el, 'drop');
      renderMap();
      if (cancel) return;
      if (!d.target) { app.toast('Lasciala su una zona di un monitor, su un desktop virtuale o su Nuovo', 'info'); return; }
      if (d.target.kind === 'zone') return dropOnZone(d, d.target.id, d.target.zone);
      var body = { window: d.id };
      if (d.target.kind === 'mon') body.monitor = d.target.id;
      else body.desktop = d.target.kind === 'new' ? 'new' : d.target.id;
      D.addClass(d.row, 'busy');
      D.api.post('/api/screens/move', body, function (err, r) {
        D.removeClass(d.row, 'busy');
        if (err) return app.toast(err.message, 'err');
        var where = r.desktopName || ('monitor ' + r.monitor);
        app.toast(r.moved === false ? 'È già su ' + where : 'Spostata su ' + where + ': ' + short(r.title, 30), 'ok');
        lastWins = ''; setTimeout(loadWins, 400);
        lastDesks = ''; setTimeout(loadDesks, 600);
      }, 15000);
    }
    function dropOnZone(d, monId, zone) {
      var lay = layout(SC.layout);
      if (!lay) return;
      D.addClass(d.row, 'busy');
      D.api.post('/api/screens/place', { window: d.id, monitor: monId, layout: lay.id, zone: zone, focus: false }, function (err) {
        D.removeClass(d.row, 'busy');
        if (err) return app.toast(err.message, 'err');
        SC.placed[monId + '|' + lay.id + '|' + zone] = d.title;
        SC.mon = monId; SC.zone = null;
        D.store.set('sc:mon', monId);
        var m = mon(monId);
        app.toast('Ancorata nella zona ' + (zone + 1) + (m ? ' del monitor ' + m.n : '') + ': ' + short(d.title, 30), 'ok');
        renderAll();
        lastWins = ''; setTimeout(loadWins, 400);
      });
    }
    function rowAt(t) {
      var row = D.closestAttr(t, 'data-win', winsEl);
      return row && !D.closestAttr(t, 'data-act', row) ? row : null;
    }
    function cancelHold() { clearTimeout(holdT); hold = null; }
    winsEl.addEventListener('touchstart', function (e) {
      var row = rowAt(e.target);
      if (!row || e.touches.length > 1) return;
      var t = e.touches[0];
      hold = { row: row, x: t.clientX, y: t.clientY };
      clearTimeout(holdT);
      holdT = setTimeout(function () { if (hold) { startDrag(hold.row, hold.x, hold.y); hold = null; } }, 400);
    }, false);
    winsEl.addEventListener('touchmove', function (e) {
      var t = e.touches[0];
      if (drag) { e.preventDefault(); moveDrag(t.clientX, t.clientY); return; }
      if (hold && (Math.abs(t.clientX - hold.x) > 10 || Math.abs(t.clientY - hold.y) > 10)) cancelHold();
    }, false);
    winsEl.addEventListener('touchend', function (e) {
      cancelHold();
      if (drag) { e.preventDefault(); endDrag(false); }
    }, false);
    winsEl.addEventListener('touchcancel', function () { cancelHold(); if (drag) endDrag(true); }, false);
    var mhold = null;
    winsEl.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      var row = rowAt(e.target);
      if (row) mhold = { row: row, x: e.clientX, y: e.clientY };
    }, false);
    function onMouseMove(e) {
      if (drag) { moveDrag(e.clientX, e.clientY); e.preventDefault(); return; }
      if (mhold && (Math.abs(e.clientX - mhold.x) > 8 || Math.abs(e.clientY - mhold.y) > 8)) { startDrag(mhold.row, e.clientX, e.clientY); mhold = null; }
    }
    function onMouseUp() { mhold = null; if (drag) endDrag(false); }
    document.addEventListener('mousemove', onMouseMove, false);
    document.addEventListener('mouseup', onMouseUp, false);

    renderAll();
    renderDesks();
    loadInfo();
    loadWins();
    loadDesks();
    var fast = D.every(3000, 15000, function () { loadWins(); loadDesks(); });
    var slow = D.every(30000, 120000, loadInfo);
    return {
      update: function () {},
      resize: function () { renderMap(); },
      destroy: function () {
        alive = false; D.stop(fast); D.stop(slow);
        if (drag) endDrag(true);
        document.removeEventListener('mousemove', onMouseMove, false);
        document.removeEventListener('mouseup', onMouseUp, false);
      }
    };
  }

  var VB_STATES = { question: 'ti aspetta', working: 'al lavoro', completed: 'pronto', idle: '' };
  function viberWidget(root, tile, app) {
    D.addClass(root, 'w-viber');
    if (tile.show === 'projects' || tile.show === 'tasks') D.addClass(root, 'vb-only-' + tile.show);
    root.innerHTML ='<div class="vb-col vb-colp"><div class="vb-h">PROGETTI<span class="vb-sub"></span></div><div class="vb-projs scroll"></div></div>' +
      '<div class="vb-col vb-colt"><div class="vb-h">TASK<span class="vb-tsub"></span></div><div class="vb-tasks scroll"></div></div>';
    function q(c) { return root.querySelector('.' + c); }
    var sub = q('vb-sub'), projEl = q('vb-projs'), tasksEl = q('vb-tasks'), tsub = q('vb-tsub');
    var st = null, alive = true, busy = false, lastTasks = '', lastProjs = '';

    function paintButtons() {
      var open = st && st.online && st.open ? ',' + st.open.join(',') + ',' : null;
      for (var i = 0; i < app.tiles.length; i++) {
        var p = app.tiles[i], a = p.tile.action;
        if (!a || a.type !== 'viber' || !a.panel) continue;
        D.toggleClass(p.el, 'vb-on', !!(st && st.online && st.active === a.panel));
        if (app.setOff) app.setOff(p, !open || open.indexOf(',' + a.panel + ',') < 0);
      }
    }
    function renderState() {
      D.toggleClass(root, 'vb-off', !(st && st.online));
      paintButtons();
      if (!st) { sub.innerHTML = ' · collegamento…'; return; }
      if (!st.online) { sub.innerHTML = ' · <b class="err">' + D.esc(st.message || 'Viber non è aperto') + '</b>'; return; }
      sub.innerHTML = '';
    }
    function loadState() {
      D.api.get('/api/viber/state', function (err, d) {
        if (!alive) return;
        st = err ? { online: false, message: err.message } : d;
        renderState();
      });
    }
    function renderProjects(d) {
      var key = JSON.stringify(d.projects);
      if (key === lastProjs) return;
      lastProjs = key;
      var h = '';
      for (var i = 0; i < d.projects.length; i++) {
        var p = d.projects[i], what = VB_STATES[p.state] || '';
        h += '<div class="vb-pr st-' + p.state + (p.active ? ' on' : '') + '" data-path="' + D.esc(p.path) + '"><i class="vb-dot"></i>' +
          '<div class="vb-pname notr">' + D.esc(p.name) + '</div>' +
          '<div class="vb-pmeta">' + (what ? '<b>' + what + '</b>' : '') + (p.title ? '<span class="notr">' + D.esc(p.title) + '</span>' : D.esc(p.agents ? '' : 'nessun agente')) + '</div></div>';
      }
      projEl.innerHTML = h || '<div class="empty">Nessun progetto aperto in Viber</div>';
    }
    function loadProjects() {
      D.api.get('/api/viber/projects', function (err, d) {
        if (!alive) return;
        if (err) { if (!lastProjs) projEl.innerHTML = '<div class="empty">' + D.esc(err.message) + '</div>'; return; }
        renderProjects(d);
      });
    }
    function loadTasks() {
      D.api.get('/api/viber/tasks', function (err, d) {
        if (!alive) return;
        if (err) { if (!lastTasks) tasksEl.innerHTML = '<div class="empty">' + D.esc(err.message) + '</div>'; return; }
        var key = JSON.stringify(d);
        if (key === lastTasks) return;
        lastTasks = key;
        setText(tsub, d.project ? ' · ' + d.project : '');
        var h = '';
        for (var i = 0; i < d.tasks.length; i++) {
          var t = d.tasks[i], doing = t.status === 'in_progress';
          h += '<div class="vb-task' + (doing ? ' doing' : '') + '"><div class="vb-ttext notr">' + D.esc(t.text) + '</div>' +
            '<div class="vb-tmeta"><span class="vb-chip">' + (doing ? 'IN CORSO' : 'APERTA') + '</span>' + (t.branch ? D.esc(t.branch) : '') + '</div>';
          for (var k = 0; k < t.steps.length; k++) {
            var s = t.steps[k];
            h += '<div class="vb-step ' + s.status + '">' + Icons.html(s.status === 'done' ? 'check' : s.status === 'in_progress' ? 'play' : 'flag') + '<span class="notr">' + D.esc(s.text) + '</span></div>';
          }
          h += '</div>';
        }
        tasksEl.innerHTML = h || '<div class="empty">Nessuna task aperta in questo progetto</div>';
      });
    }
    D.bindTap(projEl, {
      scrollable: true,
      onTap: function (t) {
        var p = D.closestAttr(t, 'data-path', projEl);
        if (!p || busy || D.hasClass(p, 'on')) return;
        busy = true;
        D.addClass(p, 'busy');
        D.api.post('/api/viber/project', { target: p.getAttribute('data-path') }, function (err, d) {
          busy = false;
          D.removeClass(p, 'busy');
          if (err) { app.toast(err.message, 'err'); return; }
          renderProjects(d);
          lastTasks = ''; loadState(); loadTasks();
        }, 20000);
      }
    });

    renderState();
    loadState(); loadProjects(); loadTasks();
    var fast = D.every(3000, 15000, loadState);
    var mid = D.every(6000, 30000, loadProjects);
    var slow = D.every(10000, 60000, loadTasks);
    return {
      update: function () {},
      resize: function () {},
      viber: function (d) {
        if (!d) return;
        if (d.projects) { renderProjects(d); lastTasks = ''; loadState(); loadTasks(); return; }
        if (d.online !== undefined) { st = d; renderState(); }
      },
      destroy: function () { alive = false; D.stop(fast); D.stop(mid); D.stop(slow); }
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

  function audioWidget(root, tile, app) {
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
      D.api.get('/api/audio', function (err, d) {
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
        return post('/api/audio/default', { id: def.getAttribute('data-def') });
      }
      var act = D.closestAttr(target, 'data-act', list);
      var box = D.closestAttr(target, 'data-id', list);
      if (!act || !box) return;
      var url = box.getAttribute('data-kind') === 'app' ? '/api/audio/app' : '/api/audio/device';
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
  }

  function desksWidget(root, tile, app) {
    D.addClass(root, 'w-desks');
    header(root, tile.title || 'DESKTOP');
    var list = el('div', 'dk-list');
    root.appendChild(list);
    var data = null, alive = true, busy = false, last = '';
    function render() {
      if (!data) { list.innerHTML = '<div class="empty">Carico…</div>'; return; }
      if (!data.supported) { list.innerHTML = '<div class="empty">' + D.esc(data.message || 'Non disponibili su questo sistema') + '</div>'; return; }
      var h = '';
      for (var i = 0; i < data.desktops.length; i++) {
        var d = data.desktops[i], n = d.windows ? d.windows.length : 0;
        h += '<div class="dk-item' + (d.current ? ' on' : '') + '" data-desk="' + D.esc(d.id) + '"><b>' + d.n + '</b><span>' + D.esc(d.name) + '</span>' +
          '<small>' + (d.current ? 'sei qui' : n + (n === 1 ? ' finestra' : ' finestre')) + '</small></div>';
      }
      if (data.desktops.length < (data.max || 3)) h += '<div class="dk-item dk-new" data-new="1">' + Icons.html('add') + '<span>Nuovo</span></div>';
      setHtml(list, h);
    }
    function load() {
      if (busy) return;
      D.api.get('/api/screens/desktops', function (err, d) {
        if (!alive || busy) return;
        if (err) { if (!data) list.innerHTML = '<div class="empty err">' + D.esc(err.message) + '</div>'; return; }
        var k = JSON.stringify(d);
        if (k === last) return;
        last = k; data = d; render();
      });
    }
    D.bindTap(list, { onTap: function (t) {
      if (busy) return;
      var body = null;
      if (D.closestAttr(t, 'data-new', list)) body = { action: 'create' };
      else {
        var c = D.closestAttr(t, 'data-desk', list);
        if (c && !D.hasClass(c, 'on')) { D.addClass(c, 'busy'); body = { action: 'switch', desktop: c.getAttribute('data-desk') }; }
      }
      if (!body) return;
      busy = true;
      D.api.post('/api/screens/desktops', body, function (err, d) {
        busy = false;
        if (err) { app.toast(err.message, 'err'); last = ''; load(); return; }
        data = d; last = JSON.stringify(d); render();
      }, 15000);
    } });
    render(); load();
    var timer = D.every(3000, 15000, load);
    return {
      update: function () {},
      resize: function (w, h) { D.toggleClass(root, 'dk-row', w > h * 1.3); },
      destroy: function () { alive = false; D.stop(timer); }
    };
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

  var CHAT = {};
  var TYPES = { system: system, nowplaying: nowplaying, queue: queue, github: github, todo: todo, chat: chat, clock: clock, claude: claudeWidget, claudeusage: claudeUsage, desks: desksWidget, games: gamesWidget, discordmini: discordMini, discord: discord, screens: screensWidget, mail: mailWidget, audio: audioWidget, vdesk: vdeskWidget, viber: viberWidget };

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

  var helpers = { el: el, header: header, setHtml: setHtml, smallBtn: smallBtn, level: level };

  return { create: create, types: TYPES, register: register, helpers: helpers };
})();
