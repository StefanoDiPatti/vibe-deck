(function () {
  'use strict';
  I18n.add({
    'Chat, sessioni di Claude Code, dettatura, scrittura sul PC': 'Chat, Claude Code sessions, dictation, typing on the PC',
    'app sul PC': 'apps on the PC', 'Scrivi o detta a Claude…': 'Write or dictate to Claude…', 'Nuova chat': 'New chat',
    'Nuova sessione': 'New session', 'Chat eliminata': 'Chat deleted', 'Scegli una chat': 'Choose a chat',
    'Scegli una chat o premi NUOVA CHAT.': 'Choose a chat or press NEW CHAT.',
    'Scegli prima una sessione': 'Choose a session first', 'Claude fermato': 'Claude stopped',
    'Claude non stava lavorando': 'Claude was not working',
    'Inviato alla sessione sul PC': 'Sent to the session on the PC',
    'Sessione aperta sul PC': 'Session opened on the PC',
    'Claude Code (il tuo abbonamento)': 'Claude Code (your subscription)',
    'Claude sta lavorando…': 'Claude is working…', 'messaggio in coda': 'queued message',
    '· messaggio in coda: parte quando Claude finisce': '· queued message: sent when Claude finishes',
    'sta rispondendo…': 'is answering…', 'al lavoro…': 'working…', '(risposta troncata)': '(answer truncated)',
    'Consumi': 'Usage', 'Sessione 5 ore': '5-hour session', 'Settimana': 'Week', '(settimana)': '(week)',
    '(non aggiornati)': '(not updated)', 'Carico le sessioni…': 'Loading sessions…',
    'App desktop di Claude non trovata su questo PC.': 'Claude desktop app not found on this PC.',
    'Scrivi o detta un messaggio.': 'Write or dictate a message.', 'Non inviato:': 'Not sent:'
  });
  var H = Widgets.helpers, el = H.el, header = H.header, setHtml = H.setHtml, dictation = H.dictation, setText = D.setText;

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

  Widgets.register('claudeusage', function (root, tile) {
    D.addClass(root, 'w-cusage');
    header(root, tile.title || 'CLAUDE');
    var box = el('div', 'cu-box scroll');
    root.appendChild(box);
    var alive = true, big = false;
    function load(force) {
      D.api.get('/api/plugins/claude/usage' + (force ? '?refresh=1' : ''), function (err, u) {
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
  });

  var CL = { mode: D.store.get('cl:mode2', 'code'), sel: D.store.get('cl:sel2', null), info: null, closed: {} };

  Widgets.register('claude', function (root, tile, app) {
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
        D.api.get('/api/plugins/claude/desktop', function (err, d) {
          if (err || !alive) return;
          desk = d;
          if (CL.mode === 'code') renderList();
        }, 15000);
      } else {
        D.api.get('/api/plugins/claude/chats', function (err, d) {
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
      var url = sel.kind === 'code' ? '/api/plugins/claude/desktop/session?id=' + encodeURIComponent(sel.id)
        : '/api/plugins/claude/chat?kind=dock&id=' + encodeURIComponent(sel.id);
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
        post('/api/plugins/claude/desktop/send', { id: sel.id, text: text }, function (err) {
          if (err) { input.value = text; return app.toast(err.message, 'err'); }
          app.toast('Inviato alla sessione sul PC', 'ok');
          loadChat(true);
          loadList();
        });
      } else if (sel.kind === 'new') {
        pendingNew = text;
        renderChat(true);
        post('/api/plugins/claude/desktop/new', { section: sel.section, text: text }, function (err) {
          pendingNew = null;
          if (err) { input.value = text; renderChat(true); return app.toast(err.message, 'err'); }
          app.toast('Sessione aperta sul PC', 'ok');
          var tries = 0;
          var known = {};
          var sec = sectionOf(sel.section);
          for (var i = 0; sec && i < sec.sessions.length; i++) known[sec.sessions[i].id] = true;
          (function look() {
            D.api.get('/api/plugins/claude/desktop', function (e2, d) {
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
        post('/api/plugins/claude/send', { kind: 'dock', id: sel.id || null, text: text }, function (err, r) {
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
        D.api.post('/api/plugins/claude/desktop/open', { id: CL.sel.id }, function (err) {
          app.toast(err ? err.message : 'Aperta nell\'app sul PC', err ? 'err' : 'ok');
        });
      }
    });
    D.bindTap(stopBtn, {
      hold: 600,
      onTap: function () {
        if (!CL.sel || CL.sel.kind !== 'code') return;
        D.api.post('/api/plugins/claude/desktop/stop', { id: CL.sel.id }, function (err, r) {
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
        D.api.post('/api/plugins/claude/delete', { id: CL.sel.id }, function (err) {
          if (err) return app.toast(err.message, 'err');
          app.toast('Chat eliminata', 'ok');
          select(null);
          loadList();
        });
      }
    });
    input.placeholder = 'Scrivi o detta a Claude…';

    D.api.get('/api/plugins/claude/info', function (err, inf) { if (!err && alive) CL.info = inf; });
    renderList();
    renderChat(true);
    loadList();
    loadChat(true);
    var usageEl = q('cl-usage');
    function loadUsage(force) {
      D.api.get('/api/plugins/claude/usage' + (force ? '?refresh=1' : ''), function (err, u) {
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
  });
})();
