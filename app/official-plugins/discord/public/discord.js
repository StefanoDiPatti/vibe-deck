(function () {
  'use strict';
  var H = Widgets.helpers, el = H.el, header = H.header, setHtml = H.setHtml, smallBtn = H.smallBtn, level = H.level, dictation = H.dictation, guideHtml = H.guideHtml, setText = D.setText;

  var DC = { guild: D.store.get('dc:guild', '') };
  Widgets.register('discord', function (root, tile, app) {
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
      D.api.post('/api/plugins/discord/user', patch, function (err, d) {
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
      D.api.get('/api/plugins/discord/state', function (err, d) {
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
      D.api.get('/api/plugins/discord/guilds' + (refresh ? '?refresh=1' : ''), function (err, list) {
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
      D.api.get('/api/plugins/discord/channels?guild=' + encodeURIComponent(wanted), function (err, list) {
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
        D.api.post('/api/plugins/discord/join', { channel: id }, function (err, d) {
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
      D.api.post('/api/plugins/discord/toggle', { what: what }, function (err, d) {
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
        D.api.post('/api/plugins/discord/join', { channel: null }, function (err, d) {
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
  });

  Widgets.register('discordmini', function (root, tile, app) {
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
        D.api.post('/api/plugins/discord/toggle', { what: what }, function (err, d) {
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
      D.api.get('/api/plugins/discord/state', function (err, d) {
        if (!alive) return;
        st = err ? { status: 'offline', message: err.message } : d;
        render();
      });
    }
    load();
    var timer = D.every(2000, 8000, load);
    return { update: function () {}, resize: function () {}, destroy: function () { alive = false; D.stop(timer); } };
  });
})();
