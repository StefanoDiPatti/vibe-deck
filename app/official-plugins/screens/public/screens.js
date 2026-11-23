(function () {
  'use strict';
  var H = Widgets.helpers, el = H.el, header = H.header, setHtml = H.setHtml, smallBtn = H.smallBtn, level = H.level, dictation = H.dictation, guideHtml = H.guideHtml, setText = D.setText;

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

  Widgets.register('vdesk', function (root, tile, app) {
    D.addClass(root, 'w-vdesk');
    vdeskGuide(root, tile && tile.system);
    return { update: function () {}, resize: function () {}, destroy: function () {} };
  });

  var SC = { mon: D.store.get('sc:mon', ''), layout: D.store.get('sc:layout', 'half'), zone: null, placed: {} };
  Widgets.register('screens', function (root, tile, app) {
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
      D.api.get('/api/plugins/screens/desktops', function (err, d) {
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
      D.api.post('/api/plugins/screens/desktops', body, function (err, d) {
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
      D.api.get('/api/plugins/screens', function (err, d) {
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
      D.api.get('/api/plugins/screens/windows', function (err, list) {
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
        D.api.post('/api/plugins/screens/target', { monitor: id || null }, function (err, d) {
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
          D.api.post('/api/plugins/screens/window', { window: id, action: act.getAttribute('data-act') }, function (err) {
            if (err) return app.toast(err.message, 'err');
            lastWins = ''; setTimeout(loadWins, 300);
          });
          return;
        }
        var title = row.querySelector('.sc-wtitle').textContent;
        if (SC.zone === null || !mon(SC.mon)) {
          D.api.post('/api/plugins/screens/window', { window: id, action: 'focus' }, function (err) {
            if (err) return app.toast(err.message, 'err');
            app.toast('In primo piano: ' + short(title, 40), 'ok');
          });
          return;
        }
        var zone = SC.zone, monId = SC.mon, lay = layout(SC.layout);
        D.addClass(row, 'busy');
        D.api.post('/api/plugins/screens/place', { window: id, monitor: monId, layout: lay.id, zone: zone }, function (err) {
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
      D.api.post('/api/plugins/screens/move', body, function (err, r) {
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
      D.api.post('/api/plugins/screens/place', { window: d.id, monitor: monId, layout: lay.id, zone: zone, focus: false }, function (err) {
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
  });


  Widgets.register('desks', function (root, tile, app) {
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
      D.api.get('/api/plugins/screens/desktops', function (err, d) {
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
      D.api.post('/api/plugins/screens/desktops', body, function (err, d) {
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
  });
})();
