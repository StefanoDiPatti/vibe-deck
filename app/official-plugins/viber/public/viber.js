(function () {
  'use strict';
  I18n.add({
    'Dividi': 'Split', 'Simulatore': 'Simulator', 'Agenti': 'Agents', 'Schede': 'Tabs',
    'Progetti e task': 'Projects and tasks',
    'Viber: pulsanti (pannelli, disposizioni, viste) personalizzabili dal pannello, a destra progetti e task': 'Viber: buttons (panels, layouts, views) customizable from the panel, projects and tasks on the right',
    'browser + terminale': 'browser + terminal', 'git + file + terminale': 'git + files + terminal',
    'pannello a schermo intero': 'full-screen panel', 'tutte le schede': 'all tabs', 'ti aspetta': 'waiting for you',
    'nessun agente': 'no agents', 'Viber non è aperto': 'Viber is not open',
    'Nessun progetto aperto in Viber': 'No project open in Viber',
    'Nessuna task aperta in questo progetto': 'No open task in this project', 'collegamento…': 'connecting…',
    '· collegamento…': '· connecting…'
  });
  var VB_STATES = { question: 'ti aspetta', working: 'al lavoro', completed: 'pronto', idle: '' };
  Widgets.register('viber', function (root, tile, app) {
    D.addClass(root, 'w-viber');
    if (tile.show === 'projects' || tile.show === 'tasks') D.addClass(root, 'vb-only-' + tile.show);
    root.innerHTML = '<div class="vb-col vb-colp"><div class="vb-h">PROGETTI<span class="vb-sub"></span></div><div class="vb-projs scroll"></div></div>' +
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
      D.api.get('/api/plugins/viber/state', function (err, d) {
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
      D.api.get('/api/plugins/viber/projects', function (err, d) {
        if (!alive) return;
        if (err) { if (!lastProjs) projEl.innerHTML = '<div class="empty">' + D.esc(err.message) + '</div>'; return; }
        renderProjects(d);
      });
    }
    function loadTasks() {
      D.api.get('/api/plugins/viber/tasks', function (err, d) {
        if (!alive) return;
        if (err) { if (!lastTasks) tasksEl.innerHTML = '<div class="empty">' + D.esc(err.message) + '</div>'; return; }
        var key = JSON.stringify(d);
        if (key === lastTasks) return;
        lastTasks = key;
        D.setText(tsub, d.project ? ' · ' + d.project : '');
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
        D.api.post('/api/plugins/viber/project', { target: p.getAttribute('data-path') }, function (err, d) {
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
      event: function (name, d) {
        if (name !== 'viber' || !d) return;
        if (d.projects) { renderProjects(d); lastTasks = ''; loadState(); loadTasks(); return; }
        if (d.online !== undefined) { st = d; renderState(); }
      },
      destroy: function () { alive = false; D.stop(fast); D.stop(mid); D.stop(slow); }
    };
  });
})();
