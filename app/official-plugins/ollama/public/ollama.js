(function () {
  'use strict';
  var STATE = null;
  var KEY = 'chat:ollama';

  Widgets.register('chat', function (root, tile, app) {
    var H = Widgets.helpers, el = H.el;
    D.addClass(root, 'w-chat ollama');
    var st = STATE || (STATE = { saved: D.store.get(KEY, { sessionId: null, messages: [], model: null }), busy: false, render: null });

    var head = el('div', 'w-head');
    var title = el('div', 'w-title', 'OLLAMA');
    var right = el('div', 'chat-tools');
    var select = el('select', 'chat-model');
    right.appendChild(select);
    select.addEventListener('change', function () { st.saved.model = select.value; persist(); }, false);
    right.appendChild(H.smallBtn('NUOVA', 'add', function () {
      st.saved = { sessionId: null, messages: [], model: st.saved.model };
      persist(); render();
    }));
    head.appendChild(title); head.appendChild(right);
    root.appendChild(head);

    var log = el('div', 'chat-log scroll');
    var form = el('div', 'chat-form');
    var input = el('textarea', 'chat-input');
    input.setAttribute('rows', '2');
    input.placeholder = 'Scrivi al modello…';
    var send = el('div', 'chat-send');
    send.innerHTML = Icons.html('send') || 'INVIA';
    form.appendChild(input); form.appendChild(send);
    root.appendChild(log); root.appendChild(form);

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
      log.innerHTML = '';
      if (!st.saved.messages.length) {
        log.appendChild(el('div', 'empty', 'Scegli un modello e scrivi. Ollama gira sul PC, il tablet mostra solo la risposta.'));
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
      if (!select.value) { app.toast('Nessun modello Ollama disponibile', 'err'); return; }
      st.busy = true;
      D.addClass(send, 'busy');
      st.saved.messages.push({ role: 'user', text: text });
      input.value = '';
      input.blur();
      persist(); render();
      D.api.post('/api/plugins/ollama/chat', { sessionId: st.saved.sessionId, text: text, model: select.value }, function (err, r) {
        st.busy = false;
        D.removeClass(send, 'busy');
        if (err) {
          st.saved.messages.push({ role: 'assistant', text: err.message, error: true });
        } else {
          st.saved.sessionId = r.sessionId;
          st.saved.messages.push({ role: 'assistant', text: r.reply });
        }
        persist();
        if (st.render) st.render();
      }, 330000);
    }
    D.bindTap(send, { onTap: submit });

    function loadModels() {
      D.api.get('/api/plugins/ollama/models', function (err, d) {
        select.innerHTML = '';
        if (err || !d.running) {
          D.setText(title, 'OLLAMA · offline');
          var o = el('option', '', 'Ollama non attivo');
          o.value = '';
          select.appendChild(o);
          return;
        }
        D.setText(title, 'OLLAMA');
        for (var i = 0; i < d.models.length; i++) {
          var opt = el('option', 'notr', d.models[i].name + (d.models[i].sizeGb ? '  (' + d.models[i].sizeGb + ' GB)' : ''));
          opt.value = d.models[i].name;
          select.appendChild(opt);
        }
        var want = st.saved.model || d.defaultModel;
        for (var j = 0; j < select.options.length; j++) if (select.options[j].value === want) select.selectedIndex = j;
      }, 8000);
    }

    st.render = render;
    D.toggleClass(send, 'busy', st.busy);
    render();
    loadModels();
    return {
      update: function () {},
      resize: function (w) {
        D.toggleClass(root, 'chat-narrow', w < 560);
        select.style.maxWidth = (w < 560 ? Math.max(90, Math.round(w * 0.32)) : 280) + 'px';
        title.style.marginRight = (right.offsetWidth ? right.offsetWidth + 12 : 0) + 'px';
        log.scrollTop = log.scrollHeight;
      },
      destroy: function () { if (st.render === render) st.render = null; }
    };
  });
})();
