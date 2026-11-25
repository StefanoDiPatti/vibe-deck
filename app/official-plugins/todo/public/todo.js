(function () {
  'use strict';
  I18n.add({
    'Note e TODO': 'Notes and TODO', 'Nuova attività…': 'New task…', 'Nessuna attività': 'No tasks',
    'Nessuna completata': 'None completed', 'completate rimosse': 'completed removed', 'da fare': 'to do',
    'Attività non trovata': 'Task not found', 'TODO sincronizzati con GitHub': 'TODO synced with GitHub'
  });
  var H = Widgets.helpers, el = H.el, header = H.header, setHtml = H.setHtml, smallBtn = H.smallBtn, level = H.level, dictation = H.dictation, guideHtml = H.guideHtml, setText = D.setText;

  Widgets.register('todo', function (root, tile, app) {
    D.addClass(root, 'w-todo');
    var clearBtn = smallBtn('PULISCI', 'trash', function () {
      send('/api/plugins/todo/clear', {}, function (r) {
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
        send('/api/plugins/todo/sync', {}, function (r) {
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
      var memo = state.source === 'memo';
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
          if (del) { D.addClass(row, 'busy'); send('/api/plugins/todo/remove', { id: it.id }); return; }
          it.done = !it.done;
          D.toggleClass(row, 'done', it.done);
          D.addClass(row, 'busy');
          send('/api/plugins/todo/toggle', { id: it.id });
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
      send('/api/plugins/todo/add', { text: text, note: tn ? tn.id : '' }, function () {
        app.toast(tn ? 'Aggiunta a ' + tn.title : 'Aggiunta', 'ok');
      });
    }
    D.bindTap(addBtn, { onTap: add });
    input.addEventListener('keydown', function (e) { if (e.keyCode === 13) { e.preventDefault(); add(); } }, false);
    var lastTodo = '';
    function load() {
      if (busy) return;
      D.api.get('/api/plugins/todo', function (err, d) {
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
  });
})();
