(function () {
  'use strict';

  I18n.add({
    'Imposta il canale o collega Twitch dal pannello di controllo sul PC': 'Set the channel or connect Twitch from the control panel on the PC',
    'Scrivi in chat…': 'Write in chat…', 'MARKER': 'MARKER', 'CLIP': 'CLIP', 'PUBBLICITÀ 30 S': 'AD 30 S', 'MODIFICA': 'EDIT',
    'SALVA TITOLO': 'SAVE TITLE', 'Cerca una categoria…': 'Search a category…', 'LENTA': 'SLOW', 'SOLO EMOTE': 'EMOTE ONLY',
    'SOLO ABBONATI': 'SUBS ONLY', 'SOLO FOLLOWER': 'FOLLOWERS ONLY', 'CHIUDI': 'CLOSE', 'Tieni premuto per mandare la pubblicità': 'Hold to run the ad',
    'Marker aggiunto': 'Marker added', 'Clip creata': 'Clip created', 'Titolo aggiornato': 'Title updated', 'In attesa dei messaggi…': 'Waiting for messages…',
    'Twitch: chat dal vivo e controlli della diretta': 'Twitch: live chat and stream controls'
  });
  I18n.rules([[/^(\d+) spettatori$/, '$1 viewers'], [/^(\d+) follower$/, '$1 followers'], [/^Categoria: (.+)$/, 'Category: $1'], [/^Pubblicità di (\d+) s avviata(.*)$/, 'Ad of $1 s started$2']]);

  var el = D.el, setText = D.setText;
  var BASE = '/api/plugins/twitch';
  var CHAT_MS = 1500, STATE_MS = 10000, MAX_LINES = 150;
  var MODES = [['slow', 'LENTA'], ['emote', 'SOLO EMOTE'], ['subs', 'SOLO ABBONATI'], ['followers', 'SOLO FOLLOWER']];
  var MODE_KEY = { slow: 'slow', emote: 'emoteOnly', subs: 'subsOnly', followers: 'followersOnly' };

  function twitch(root, tile, app) {
    D.addClass(root, 'w-twitch');
    var head = el('div', 'tw-head');
    var pill = el('span', 'tw-pill');
    var info = el('span', 'tw-info notr');
    head.appendChild(pill); head.appendChild(info);
    var chat = el('div', 'tw-chat scroll');
    var form = el('div', 'tw-form');
    var input = el('input', 'tw-input');
    input.type = 'text';
    input.setAttribute('placeholder', 'Scrivi in chat…');
    var mic = el('div', 'tw-mic');
    mic.innerHTML = Icons.html('mic');
    var send = el('div', 'tw-send');
    send.innerHTML = Icons.html('send');
    form.appendChild(input); form.appendChild(mic); form.appendChild(send);
    var side = el('div', 'tw-side scroll');
    var note = el('div', 'empty');
    root.appendChild(head); root.appendChild(chat); root.appendChild(form); root.appendChild(side); root.appendChild(note);
    var state = null, last = 0, epoch = null, dead = false, chatTimer = null, stateTimer = null, compact = false, editing = false, sideKey = '';

    function act(path, body, node, after) {
      D.api.post(BASE + path, body || {}, function (err, r) {
        if (node) { D.addClass(node, err ? 'err' : 'ok'); setTimeout(function () { D.removeClass(node, 'ok'); D.removeClass(node, 'err'); }, 700); }
        if (err) app.toast(err.message, 'err');
        else if (r && r.message) app.toast(r.message, 'ok');
        if (!err && after) after(r);
        clearTimeout(stateTimer);
        stateTimer = setTimeout(loadState, 400);
      }, 20000);
    }

    function btn(label, icon, cls, onTap, hold, holdMsg) {
      var b = el('div', 'tw-btn ' + (cls || ''));
      b.innerHTML = (icon ? Icons.html(icon) : '') + '<span>' + D.esc(label) + '</span>';
      if (hold) D.bindTap(b, { hold: 700, onTap: function () { onTap(b); }, onShort: function () { app.toast(holdMsg, 'info'); } });
      else D.bindTap(b, { scrollable: true, onTap: function () { onTap(b); } });
      return b;
    }

    function line(m) {
      var r = el('div', 'tw-line' + (m.kind === 'notice' ? ' notice' : ''));
      if (m.kind === 'notice') r.innerHTML = '<b>' + D.esc(m.text || m.type) + '</b>' + (m.extra ? ' ' + D.esc(m.extra) : '');
      else r.innerHTML = '<b' + (m.color ? ' style="color:' + m.color + '"' : '') + '>' + (m.badges.indexOf('broadcaster') >= 0 ? '★ ' : m.badges.indexOf('moderator') >= 0 ? '⚔ ' : '') + D.esc(m.user) + '</b>: ' + D.esc(m.text);
      return r;
    }

    function addMessages(list) {
      if (!list.length) return;
      var atBottom = chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 30;
      var empty = chat.querySelector('.empty');
      if (empty) chat.removeChild(empty);
      for (var i = 0; i < list.length; i++) chat.appendChild(line(list[i]));
      while (chat.childNodes.length > MAX_LINES) chat.removeChild(chat.firstChild);
      if (atBottom) chat.scrollTop = chat.scrollHeight;
    }

    function paintSide(s) {
      var key = JSON.stringify([s.canControl, s.live && s.live.title, s.live && s.live.game, s.modes, editing, compact]);
      if (key === sideKey) return;
      sideKey = key;
      side.innerHTML = '';
      if (!s.canControl || compact) return;
      if (editing) { paintEditor(s); return; }
      var t = el('div', 'tw-title notr');
      t.innerHTML = '<b>' + D.esc((s.live && s.live.title) || '—') + '</b><span>' + D.esc((s.live && s.live.game) || '') + '</span>';
      side.appendChild(t);
      side.appendChild(btn('MODIFICA', 'keyboard', 'small', function () { editing = true; sideKey = ''; paintSide(state); }));
      var acts = el('div', 'tw-grid');
      acts.appendChild(btn('MARKER', 'flag', '', function (n) { act('/marker', {}, n); }));
      acts.appendChild(btn('CLIP', 'film', '', function (n) { act('/clip', {}, n); }));
      acts.appendChild(btn('PUBBLICITÀ 30 S', 'live', 'warn', function (n) { act('/ad', { length: 30 }, n); }, true, 'Tieni premuto per mandare la pubblicità'));
      side.appendChild(acts);
      var modes = el('div', 'tw-modes');
      for (var i = 0; i < MODES.length; i++) {
        (function (m) {
          var on = !!s.modes[MODE_KEY[m[0]]];
          modes.appendChild(btn(m[1], '', 'mode' + (on ? ' on' : ''), function (n) { act('/mode', { mode: m[0], on: !on }, n); }));
        })(MODES[i]);
      }
      side.appendChild(modes);
    }

    function closeEditor() { editing = false; sideKey = ''; paintSide(state); }

    function paintEditor(s) {
      var title = el('input', 'tw-edit');
      title.type = 'text';
      title.value = (s.live && s.live.title) || '';
      title.setAttribute('maxlength', '140');
      side.appendChild(title);
      side.appendChild(btn('SALVA TITOLO', 'save', 'go', function (n) { act('/title', { title: title.value }, n, closeEditor); }));
      var q = el('input', 'tw-edit');
      q.type = 'text';
      q.setAttribute('placeholder', 'Cerca una categoria…');
      side.appendChild(q);
      var results = el('div', 'tw-results');
      side.appendChild(results);
      var timer = null, asked = '';
      function search() {
        if (q.value === asked) return;
        asked = q.value;
        clearTimeout(timer);
        timer = setTimeout(function () {
          D.api.get(BASE + '/categories?q=' + encodeURIComponent(q.value), function (err, list) {
            results.innerHTML = '';
            if (err) { results.appendChild(el('div', 'empty err', err.message)); return; }
            for (var i = 0; i < list.length; i++) {
              (function (c) {
                var r = el('div', 'tw-result notr', c.name);
                D.bindTap(r, { scrollable: true, onTap: function () { act('/category', { id: c.id, name: c.name }, r, closeEditor); } });
                results.appendChild(r);
              })(list[i]);
            }
          }, 15000);
        }, 400);
      }
      q.addEventListener('keyup', search, false);
      q.addEventListener('input', search, false);
      side.appendChild(btn('CHIUDI', 'close', 'small', closeEditor));
    }

    function paint(s) {
      state = s;
      var on = s.status !== 'setup';
      note.style.display = on ? 'none' : '';
      head.style.display = chat.style.display = on ? '' : 'none';
      form.style.display = on && s.canSend ? '' : 'none';
      D.toggleClass(root, 'tw-noform', !(on && s.canSend));
      D.toggleClass(root, 'tw-nocontrols', !s.canControl || compact);
      D.toggleClass(root, 'tw-compact', compact);
      if (!on) { setText(note, 'Imposta il canale o collega Twitch dal pannello di controllo sul PC'); return; }
      var live = s.live;
      setText(pill, live && live.active ? 'LIVE · ' + live.viewers + ' · ' + live.uptime : live ? 'OFFLINE' : s.channel.toUpperCase());
      pill.className = 'tw-pill' + (live && live.active ? ' live' : '');
      setText(info, (s.name || s.channel) + (live && live.followers !== null && live.followers !== undefined ? ' · ' + live.followers + ' follower' : ''));
      paintSide(s);
    }

    function loadState() {
      if (dead) return;
      D.api.get(BASE + '/state', function (err, s) {
        if (dead) return;
        if (!err) paint(s);
        stateTimer = setTimeout(loadState, STATE_MS);
      }, 20000);
    }

    function loadChat() {
      if (dead) return;
      D.api.get(BASE + '/chat?after=' + last, function (err, r) {
        if (dead) return;
        if (!err) {
          if (r.epoch !== epoch || r.last < last) {
            var fresh = last === 0 && epoch === null;
            chat.innerHTML = ''; epoch = r.epoch;
            if (!fresh) { last = 0; chatTimer = setTimeout(loadChat, 0); return; }
          }
          addMessages(r.messages);
          last = r.last;
          if (!chat.childNodes.length) chat.appendChild(el('div', 'empty', 'In attesa dei messaggi…'));
        }
        chatTimer = setTimeout(loadChat, CHAT_MS);
      }, 10000);
    }

    function submit() {
      var t = input.value.replace(/^\s+|\s+$/g, '');
      if (!t) return;
      act('/say', { text: t }, send, function () { input.value = ''; });
    }
    D.bindTap(send, { onTap: submit });
    input.addEventListener('keydown', function (e) { if (e.keyCode === 13) { e.preventDefault(); submit(); } }, false);
    Widgets.helpers.dictation({ mic: mic, input: input, app: app });

    loadState();
    loadChat();

    return {
      update: function () {},
      resize: function (w, h) {
        var c = w < 600 || h < 220;
        if (c !== compact) { compact = c; sideKey = ''; if (state) paint(state); }
      },
      destroy: function () { dead = true; clearTimeout(chatTimer); clearTimeout(stateTimer); }
    };
  }

  Widgets.register('twitch', twitch);
})();
