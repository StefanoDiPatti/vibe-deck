(function () {
  'use strict';

  I18n.add({
    'Cerca un campione…': 'Search a champion…', 'TUTTI': 'ALL', 'Carico i campioni…': 'Loading champions…',
    'Nessun campione': 'No champions', 'ABILITÀ': 'ABILITIES', 'INDIETRO': 'BACK', 'Build su u.gg': 'Build on u.gg',
    'Apro la build sul PC…': 'Opening the build on the PC…', 'Passiva': 'Passive',
    'League of Legends: cerca un campione o scegli il ruolo, guarda le abilità, apri la build su u.gg sul PC': 'League of Legends: search a champion or pick the role, see the abilities, open the build on u.gg on the PC'
  });
  I18n.rules([[/^Build di (.+) aperta sul PC$/, 'Build of $1 opened on the PC'], [/^(\d+) campioni$/, '$1 champions']]);

  var el = D.el, setText = D.setText;
  var BASE = '/api/plugins/lol';
  var ROLE_LABEL = { top: 'TOP', jungle: 'JUNGLE', mid: 'MID', adc: 'ADC', support: 'SUPPORT' };
  var BATCH = 40;
  var shared = { data: null, waiting: [] };

  function img(kind, file) { return '/plugins-public/lol/img/' + kind + '/' + encodeURIComponent(file); }

  function fold(s) {
    var map = { 'à': 'a', 'á': 'a', 'è': 'e', 'é': 'e', 'ì': 'i', 'í': 'i', 'ò': 'o', 'ó': 'o', 'ù': 'u', 'ú': 'u' };
    return String(s || '').toLowerCase().replace(/[àáèéìíòóùú]/g, function (c) { return map[c]; }).replace(/[^a-z0-9]/g, '');
  }

  function loadChampions(done) {
    if (shared.data) { done(null, shared.data); return; }
    shared.waiting.push(done);
    if (shared.waiting.length > 1) return;
    D.api.get(BASE + '/champions', function (err, d) {
      if (!err) shared.data = d;
      var list = shared.waiting;
      shared.waiting = [];
      for (var i = 0; i < list.length; i++) list[i](err, d);
    }, 60000);
  }

  function Model() {
    this.role = '';
    this.query = '';
    this.all = [];
  }
  Model.prototype.visible = function () {
    var q = fold(this.query), role = this.role, out = [];
    for (var i = 0; i < this.all.length; i++) {
      var c = this.all[i];
      if (role && c.roles.indexOf(role) < 0) continue;
      if (q && fold(c.name).indexOf(q) < 0 && fold(c.id).indexOf(q) < 0) continue;
      out.push(c);
    }
    return out;
  };

  function lol(root, tile, app) {
    D.addClass(root, 'w-lol');
    var model = new Model();
    var bar = el('div', 'lol-bar');
    var search = el('input', 'lol-search');
    search.type = 'text';
    search.setAttribute('placeholder', 'Cerca un campione…');
    search.setAttribute('autocomplete', 'off');
    var mic = el('div', 'lol-mic');
    mic.innerHTML = Icons.html('mic');
    var roles = el('div', 'lol-roles');
    bar.appendChild(search); bar.appendChild(mic); bar.appendChild(roles);
    var grid = el('div', 'lol-grid scroll');
    var detail = el('div', 'lol-detail scroll');
    detail.style.display = 'none';
    root.appendChild(bar); root.appendChild(grid); root.appendChild(detail);
    var paintTimer = null, dead = false, size = { w: 0, h: 0 };

    function chip(role, label) {
      var c = el('div', 'lol-role' + (model.role === role ? ' on' : ''), label);
      D.bindTap(c, { onTap: function () { model.role = role; paintRoles(); paintGrid(); } });
      return c;
    }
    function paintRoles() {
      roles.innerHTML = '';
      roles.appendChild(chip('', 'TUTTI'));
      for (var r in ROLE_LABEL) if (ROLE_LABEL.hasOwnProperty(r)) roles.appendChild(chip(r, ROLE_LABEL[r]));
    }

    function cell(c) {
      var n = el('div', 'lol-champ');
      n.innerHTML = '<img src="' + img('champion', c.id + '.png') + '" alt="" width="56" height="56"><span class="notr">' + D.esc(c.name) + '</span>';
      D.bindTap(n, { scrollable: true, onTap: function () { openDetail(c); } });
      return n;
    }
    function paintGrid() {
      clearTimeout(paintTimer);
      var list = model.visible();
      grid.innerHTML = '';
      grid.scrollTop = 0;
      if (!list.length) { grid.appendChild(el('div', 'empty', model.all.length ? 'Nessun campione' : 'Carico i campioni…')); return; }
      var i = 0;
      (function batch() {
        if (dead) return;
        var end = Math.min(list.length, i + BATCH);
        for (; i < end; i++) grid.appendChild(cell(list[i]));
        if (i < list.length) paintTimer = setTimeout(batch, 30);
      })();
    }

    function show(which) {
      grid.style.display = which === 'grid' ? '' : 'none';
      bar.style.display = which === 'grid' ? '' : 'none';
      detail.style.display = which === 'detail' ? '' : 'none';
    }

    function openBuild(c, role, node) {
      app.toast('Apro la build sul PC…', 'info');
      D.api.post(BASE + '/open', { id: c.id, role: role }, function (err, r) {
        if (node) { D.addClass(node, err ? 'err' : 'ok'); setTimeout(function () { D.removeClass(node, 'ok'); D.removeClass(node, 'err'); }, 700); }
        app.toast(err ? err.message : r.message, err ? 'err' : 'ok');
      }, 30000);
    }

    function paintDetail(d) {
      detail.innerHTML = '';
      var head = el('div', 'lol-head');
      var back = el('div', 'lol-back');
      back.innerHTML = Icons.html('back') + '<span>INDIETRO</span>';
      D.bindTap(back, { onTap: function () { show('grid'); } });
      head.innerHTML = '<img class="lol-big" src="' + img('champion', d.id + '.png') + '" alt="" width="72" height="72">' +
        '<div class="lol-name notr">' + D.esc(d.name) + '</div><div class="lol-title notr">' + D.esc(d.title.charAt(0).toUpperCase() + d.title.slice(1)) + '</div>';
      head.appendChild(back);
      detail.appendChild(head);
      var builds = el('div', 'lol-builds');
      for (var i = 0; i < d.builds.length; i++) {
        (function (b) {
          var btn = el('div', 'lol-build');
          btn.innerHTML = Icons.html('globe') + '<span>Build su u.gg</span>' + (b.role ? '<b>' + ROLE_LABEL[b.role] + '</b>' : '');
          D.bindTap(btn, { scrollable: true, onTap: function () { openBuild(d, b.role, btn); } });
          builds.appendChild(btn);
        })(d.builds[i]);
      }
      detail.appendChild(builds);
      detail.appendChild(el('div', 'lol-section', 'ABILITÀ'));
      for (var j = 0; j < d.abilities.length; j++) {
        var a = d.abilities[j];
        var row = el('div', 'lol-ability');
        row.innerHTML = '<img src="' + img(a.image.split('/')[0], a.image.split('/')[1]) + '" alt="" width="44" height="44">' +
          '<span class="lol-key">' + a.key + '</span><div class="lol-aname notr">' + D.esc(a.name) +
          (a.cooldown ? ' <small>' + D.esc(a.cooldown) + ' s</small>' : '') + '</div><div class="lol-atext notr">' + D.esc(a.text) + '</div>';
        detail.appendChild(row);
      }
      detail.scrollTop = 0;
    }

    function openDetail(c) {
      show('detail');
      detail.innerHTML = '';
      detail.appendChild(el('div', 'empty', c.name + '…'));
      D.api.get(BASE + '/champion/' + encodeURIComponent(c.id), function (err, d) {
        if (dead) return;
        if (err) { detail.innerHTML = ''; detail.appendChild(el('div', 'empty err', err.message)); return; }
        paintDetail(d);
      }, 30000);
    }

    function onSearch() {
      if (search.value === model.query) return;
      model.query = search.value;
      paintGrid();
    }
    search.addEventListener('input', onSearch, false);
    search.addEventListener('keyup', onSearch, false);
    Widgets.helpers.dictation({ mic: mic, input: search, app: app, onText: function () { onSearch(); } });

    paintRoles();
    paintGrid();
    loadChampions(function (err, d) {
      if (dead) return;
      if (err) { grid.innerHTML = ''; grid.appendChild(el('div', 'empty err', err.message)); return; }
      model.all = d.champions;
      paintGrid();
    });

    return {
      update: function () {},
      resize: function (w, h) {
        size = { w: w, h: h };
        D.toggleClass(root, 'lol-narrow', w < 520);
      },
      destroy: function () { dead = true; clearTimeout(paintTimer); }
    };
  }

  Widgets.register('lol', lol);
})();
