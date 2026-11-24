(function () {
  'use strict';
  I18n.add({
    'Apri sul PC': 'Open on PC',
    'Posta in arrivo di Gmail, Outlook, iCloud e altri (account scelti dal pannello)': 'Inbox from Gmail, Outlook, iCloud and more (accounts chosen in the panel)',
    '(nessun testo)': '(no text)', 'tutto letto': 'all read', 'da leggere': 'unread', 'in arrivo': 'incoming',
    '(senza oggetto)': '(no subject)', '(sconosciuto)': '(unknown)',
    'La posta in arrivo è vuota.': 'The inbox is empty.', 'Nessun account email.': 'No email accounts.',
    'La posta arriva da Thunderbird sul PC:': 'Mail comes from Thunderbird on the PC:',
    'pannello di controllo, sezione Email.': 'control panel, Email section.',
    'Messaggio lungo: il resto è sul PC (APRI SUL PC).': 'Long message: the rest is on the PC (OPEN ON PC).',
    'Thunderbird aperto sul PC': 'Thunderbird opened on the PC'
  });
  var H = Widgets.helpers, el = H.el, header = H.header, setHtml = H.setHtml, smallBtn = H.smallBtn, level = H.level, dictation = H.dictation, guideHtml = H.guideHtml, setText = D.setText;

  var ML = { acc: D.store.get('ml:acc', '') };
  Widgets.register('mail', function (root, tile, app) {
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
      D.api.get('/api/plugins/mail/message?account=' + encodeURIComponent(a.id) + '&uid=' + encodeURIComponent(uid), function (err, m) {
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
      D.api.post('/api/plugins/mail/open', { account: a.id }, function (err, res) {
        app.toast(err ? err.message : res.message, err ? 'err' : 'ok');
      });
    }

    function load(force) {
      if (loading) return;
      loading = true;
      D.addClass(refreshBtn, 'spin');
      D.api.get('/api/plugins/mail', function (err, st) {
        if (!alive) return;
        if (err) { loading = false; D.removeClass(refreshBtn, 'spin'); setText(info, err.message); D.addClass(info, 'err'); return; }
        accounts = st.accounts || [];
        var a = current();
        if (!a) { loading = false; D.removeClass(refreshBtn, 'spin'); data = null; render(); return; }
        if (data && data.account.id !== a.id) data = null;
        render();
        D.api.get('/api/plugins/mail/list?account=' + encodeURIComponent(a.id) + (force ? '&refresh=1' : ''), function (err2, d) {
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
  });
})();
