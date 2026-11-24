(function () {
  'use strict';
  I18n.add({
    "Chat con DeepSeek: scrivi o detta, risposta in diretta, saldo dell'account": 'Chat with DeepSeek: write or dictate, live answer, account balance',
    "Chat con DeepSeek e saldo dell'account": 'Chat with DeepSeek and account balance',
    'Scrivi o detta a DeepSeek…': 'Write or dictate to DeepSeek…',
    'Scrivi o detta un messaggio. DeepSeek risponde dal PC, qui vedi la risposta mentre la scrive.': 'Write or dictate a message. DeepSeek answers from the PC, here you see the answer while it is written.',
    'Inserisci la chiave API di DeepSeek nel pannello del PC': 'Enter the DeepSeek API key in the PC panel',
    'Sta ragionando…': 'Thinking…', 'Fermata': 'Stopped', 'Tocca di nuovo per fermare': 'Tap again to stop',
    'Nessun modello DeepSeek disponibile': 'No DeepSeek model available', 'DeepSeek non configurato': 'DeepSeek not configured'
  });

  var KEY = 'chat:deepseek';
  var POLL_MS = 600;
  var STATE = null;

  function state() {
    if (!STATE) {
      STATE = { saved: D.store.get(KEY, { sessionId: null, messages: [], model: null }), job: null, partial: '', phase: '', render: null, info: null, balance: null, timer: null };
      if (!STATE.saved.messages) STATE.saved.messages = [];
      if (STATE.saved.job) { STATE.job = STATE.saved.job; STATE.phase = 'waiting'; }
    }
    return STATE;
  }

  function money(b) {
    if (!b || !b.currency) return '';
    var sym = b.currency === 'USD' ? '$' : b.currency === 'CNY' ? '¥' : b.currency + ' ';
    return sym + (Math.round(b.total * 100) / 100).toFixed(2);
  }

  Widgets.register('deepseek', function (root, tile, app) {
    var H = Widgets.helpers, el = H.el;
    var st = state();
    D.addClass(root, 'w-chat w-deepseek');

    var head = el('div', 'w-head');
    var title = el('div', 'w-title notr', 'DEEPSEEK');
    var right = el('div', 'chat-tools');
    var bal = el('span', 'ds-balance notr', '');
    var select = el('select', 'chat-model');
    right.appendChild(bal);
    right.appendChild(select);
    right.appendChild(H.smallBtn('NUOVA', 'add', function () {
      if (st.job) return;
      st.saved = { sessionId: null, messages: [], model: st.saved.model };
      persist(); render();
    }));
    head.appendChild(title); head.appendChild(right);
    root.appendChild(head);

    var log = el('div', 'chat-log scroll');
    var form = el('div', 'chat-form ds-form');
    var mic = el('div', 'ds-mic');
    mic.innerHTML = Icons.html('mic') || 'MIC';
    var input = el('textarea', 'chat-input ds-input');
    input.setAttribute('rows', '2');
    input.placeholder = 'Scrivi o detta a DeepSeek…';
    var send = el('div', 'chat-send ds-send');
    form.appendChild(mic); form.appendChild(input); form.appendChild(send);
    root.appendChild(log); root.appendChild(form);

    select.addEventListener('change', function () { st.saved.model = select.value; persist(); }, false);

    function persist() {
      if (st.saved.messages.length > 40) st.saved.messages = st.saved.messages.slice(-40);
      D.store.set(KEY, st.saved);
    }

    function bubble(m) {
      var b = el('div', 'msg ' + (m.error ? '' : 'notr ') + m.role + (m.error ? ' error' : ''));
      b.innerHTML = m.role === 'user' ? D.esc(m.text).replace(/\n/g, '<br>') : D.richText(m.text);
      return b;
    }

    function render() {
      var atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
      log.innerHTML = '';
      if (!st.saved.messages.length && !st.job) {
        log.appendChild(el('div', 'empty', st.info && !st.info.configured ? 'Inserisci la chiave API di DeepSeek nel pannello del PC' : 'Scrivi o detta un messaggio. DeepSeek risponde dal PC, qui vedi la risposta mentre la scrive.'));
      }
      for (var i = 0; i < st.saved.messages.length; i++) log.appendChild(bubble(st.saved.messages[i]));
      if (st.job) {
        if (st.partial) {
          var live = bubble({ role: 'assistant', text: st.partial });
          D.addClass(live, 'ds-live');
          log.appendChild(live);
        } else if (st.phase === 'thinking') {
          log.appendChild(el('div', 'msg assistant ds-thinking', 'Sta ragionando…'));
        } else {
          var t = el('div', 'msg assistant typing');
          t.innerHTML = '<i></i><i></i><i></i>';
          log.appendChild(t);
        }
      }
      if (atBottom || st.job) log.scrollTop = log.scrollHeight;
      send.innerHTML = Icons.html(st.job ? 'stop' : 'send') || (st.job ? 'STOP' : 'INVIA');
      D.toggleClass(send, 'ds-stop', !!st.job);
    }

    function done(text, isError) {
      st.saved.messages.push({ role: 'assistant', text: text, error: !!isError });
      st.job = null; st.partial = ''; st.phase = '';
      delete st.saved.job;
      persist();
      loadBalance(true);
      if (st.render) st.render();
    }

    function poll() {
      if (!st.job) return;
      var jobId = st.job;
      D.api.get('/api/plugins/deepseek/job?id=' + encodeURIComponent(jobId), function (err, j) {
        if (st.job !== jobId) return;
        if (err) { done(err.message, true); return; }
        if (j.status === 'running') {
          st.partial = j.text; st.phase = j.phase;
          if (st.render) st.render();
          st.timer = setTimeout(poll, POLL_MS);
          return;
        }
        if (j.status === 'done') done(j.text, false);
        else done(j.status === 'stopped' ? 'Fermata' : j.error, true);
      }, 15000);
    }

    function submit() {
      if (st.job) return stop();
      var text = input.value.replace(/^\s+|\s+$/g, '');
      if (!text) return;
      if (!select.value) { app.toast(st.info && !st.info.configured ? 'Inserisci la chiave API di DeepSeek nel pannello del PC' : 'Nessun modello DeepSeek disponibile', 'err'); return; }
      voice.stop();
      st.saved.messages.push({ role: 'user', text: text });
      input.value = '';
      input.blur();
      st.job = 'pending'; st.partial = ''; st.phase = 'waiting';
      persist(); render();
      D.api.post('/api/plugins/deepseek/send', { sessionId: st.saved.sessionId, text: text, model: select.value }, function (err, r) {
        if (err) { st.job = 'pending'; done(err.message, true); return; }
        st.saved.sessionId = r.sessionId;
        st.job = r.jobId;
        st.saved.job = r.jobId;
        persist();
        st.timer = setTimeout(poll, 300);
      }, 20000);
    }

    function stop() {
      if (!st.job || st.job === 'pending') return;
      D.api.post('/api/plugins/deepseek/stop', { id: st.job }, function (err) { if (err) app.toast(err.message, 'err'); });
    }

    D.bindTap(send, { onTap: submit });
    var voice = H.dictation({ mic: mic, input: input, app: app, serverVoice: function () { return !!(st.info && st.info.voiceServer); } });

    function fillModels(d) {
      select.innerHTML = '';
      if (!d || !d.configured || !d.models.length) {
        D.setText(title, 'DEEPSEEK');
        var o = el('option', '', d && !d.configured ? 'DeepSeek non configurato' : 'Nessun modello DeepSeek disponibile');
        o.value = '';
        select.appendChild(o);
        return;
      }
      for (var i = 0; i < d.models.length; i++) {
        var opt = el('option', 'notr', d.models[i].replace(/^deepseek-/, ''));
        opt.value = d.models[i];
        select.appendChild(opt);
      }
      var want = st.saved.model || d.defaultModel;
      for (var j = 0; j < select.options.length; j++) if (select.options[j].value === want) select.selectedIndex = j;
    }

    function loadInfo() {
      D.api.get('/api/plugins/deepseek/info', function (err, d) {
        st.info = err ? null : d;
        fillModels(st.info);
        if (st.info && st.info.error && st.info.configured) app.toast(st.info.error, 'err');
        render();
        if (st.info && st.info.configured) loadBalance(false);
      }, 15000);
    }

    function loadBalance(refresh) {
      D.api.get('/api/plugins/deepseek/balance' + (refresh ? '?refresh=1' : ''), function (err, b) {
        st.balance = err ? null : b;
        D.setText(bal, money(st.balance));
        D.toggleClass(bal, 'low', !!(st.balance && !st.balance.available));
      }, 15000);
    }

    st.render = render;
    D.setText(bal, money(st.balance));
    if (st.info) fillModels(st.info);
    render();
    loadInfo();
    if (st.job && st.job !== 'pending' && !st.timer) st.timer = setTimeout(poll, 50);
    var infoTimer = D.every(300000, 900000, function () { if (!st.job) loadBalance(false); });
    return {
      update: function () {},
      resize: function (w) {
        D.toggleClass(root, 'chat-narrow', w < 560);
        D.toggleClass(root, 'ds-tiny', w < 420);
        select.style.maxWidth = (w < 560 ? Math.max(80, Math.round(w * 0.28)) : 220) + 'px';
        title.style.marginRight = (right.offsetWidth ? right.offsetWidth + 12 : 0) + 'px';
        log.scrollTop = log.scrollHeight;
      },
      destroy: function () { voice.stop(); D.stop(infoTimer); if (st.render === render) st.render = null; }
    };
  });
})();
