(function () {
  'use strict';
  const { $, esc, icon, api, toast } = window.Panel;
  const refresh = () => window.Panel.refresh();
  const adopt = () => window.Panel.update(info);
  let info = null;
  let mlKey = '';

  window.Panel.card('mail-card', `
    <div class="card-head">
      <div>
        <h2>Email</h2>
        <p class="hint">Posta in arrivo sul tablet, in sola lettura. <b>Si collega solo tramite Thunderbird</b>: aggiungi lì i tuoi account (Gmail, Outlook, iCloud, università, lavoro...) e la dock legge la posta dal PC. Poi aggiungi la pagina <b>EMAIL</b> alla barra qui sopra.</p>
      </div>
      <span id="ml-count" class="pill"></span>
    </div>
    <div id="ml-status" class="ml-status"></div>
    <div id="ml-accounts"></div>
    <div id="ml-add"></div>`);

  function mailSteps(m) {
    return '<ol class="steps ml-steps">' +
      '<li>' + (m.installed ? '<b>Thunderbird è installato.</b>' : '<b>Scarica e installa Thunderbird</b> (gratis, open source, di Mozilla): ' +
        '<a href="' + esc(m.download) + '" target="_blank" rel="noopener">thunderbird.net</a>') + '</li>' +
      '<li>Aprilo e aggiungi il tuo account: <b>Account email esistente</b>, scrivi nome, indirizzo e lascia vuota la password se è Gmail o Microsoft. ' +
        'Si apre la pagina di accesso del tuo servizio: entri come sempre (con la conferma sul telefono se ce l\'hai). Funziona anche con le mail di <b>università e aziende</b>, se l\'organizzazione permette Thunderbird.</li>' +
      '<li>Lascia attivo <b>"Conserva i messaggi di questo account sul computer"</b> (è già così: impostazioni dell\'account → Sincronizzazione e archiviazione). Serve per leggere il testo dal tablet.</li>' +
      '<li>Aspetta che Thunderbird scarichi la posta: l\'account compare qui da solo. Thunderbird deve restare aperto (anche ridotto a icona) per ricevere le email nuove.</li>' +
    '</ol>';
  }
  function renderMail() {
    const m = info.mail;
    if (!m) return;
    const shown = m.accounts.filter((a) => a.shown).length;
    $('ml-count').textContent = m.accounts.length ? shown + ' SUL TABLET' : (m.installed ? 'NESSUN ACCOUNT' : 'THUNDERBIRD NON INSTALLATO');
    $('ml-count').className = 'pill' + (shown ? ' ok' : '');
    const st = !m.installed ? 'Thunderbird non è installato su questo PC.'
      : !m.profile ? 'Thunderbird è installato ma non è ancora stato aperto: aprilo e aggiungi il tuo account.'
      : !m.accounts.length ? 'Thunderbird è collegato, ma non ha account di posta: aggiungili in Thunderbird.'
      : 'Thunderbird è collegato: ' + m.accounts.length + (m.accounts.length === 1 ? ' account trovato.' : ' account trovati.');
    $('ml-status').innerHTML = '<span class="dot' + (m.accounts.length ? ' ok' : '') + '"></span><span class="txt">' + esc(st) + '</span>' +
      (m.exe ? '<button class="btn ghost small-btn" type="button" data-mlact="open">Apri Thunderbird</button>' : '') +
      '<button class="btn ghost small-btn" type="button" data-mlact="check">Controlla di nuovo</button>';
    const accDesc = (a) => a.status === 'error' ? a.error
      : a.unread != null ? a.unread + ' da leggere' + (a.offline ? '' : ' · il testo delle email non è sul PC: attiva "Conserva i messaggi sul computer"')
      : 'lettura della posta in corso…';
    $('ml-accounts').innerHTML = m.accounts.map((a) =>
      '<div class="ml-acc' + (a.shown ? '' : ' off') + '" data-acc="' + esc(a.id) + '">' +
        '<span class="ico">' + icon('mail') + '</span>' +
        '<span class="txt"><span class="name">' + esc(a.label) + '</span> <span class="hint">' + esc(a.email) + '</span>' +
          '<span class="desc' + (a.status === 'error' ? ' err' : '') + '">' + esc(accDesc(a)) + '</span></span>' +
        '<button class="chip' + (a.shown ? ' on' : '') + '" type="button" data-mlact="' + (a.shown ? 'hide' : 'show') + '">' + (a.shown ? 'Sul tablet' : 'Nascosto') + '</button>' +
      '</div>'
    ).join('');
    const key = m.installed + '|' + m.profile + '|' + m.accounts.length;
    if (key === mlKey) return;
    mlKey = key;
    $('ml-add').innerHTML = (m.accounts.length
      ? '<details class="ml-more"><summary>Aggiungere un altro account</summary>' + mailSteps(m) + '</details>'
      : mailSteps(m)) +
      '<p class="hint small">Riservatezza: la dock non chiede e non salva password. Legge in sola lettura i file che Thunderbird tiene su questo PC e manda le email solo al tuo tablet, sulla rete di casa. ' +
      'I file della posta non sono cifrati: proteggi l\'account del PC con una password (e, se puoi, la cifratura del disco).</p>';
  }

  async function mailAction(act, id, btn) {
    if (btn) btn.disabled = true;
    try {
      if (act === 'check') {
        toast('Cerco Thunderbird e leggo la posta…', '');
        info = await api('POST', '/api/control/mail/check', {});
        adopt();
        const n = info.mail.accounts.length;
        toast(n ? 'Thunderbird collegato: ' + n + (n === 1 ? ' account' : ' account') : (info.mail.profile ? 'Nessun account in Thunderbird' : 'Thunderbird non trovato'), n ? 'ok' : 'err');
        if (btn) btn.disabled = false;
        return;
      }
      if (act === 'open') {
        await api('POST', '/api/control/mail/open', {});
        toast('Thunderbird aperto', 'ok');
        if (btn) btn.disabled = false;
        return;
      }
      info = await api('POST', '/api/control/mail/show', { id: id, shown: act === 'show' });
      adopt();
      if (act === 'show') toast('Account sul tablet: aggiungi la pagina EMAIL alla barra se non c\'è', 'ok');
    } catch (e) { toast(e.message, 'err'); }
    if (btn) btn.disabled = false;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mlact]');
    if (!b) return;
    const row = b.closest('[data-acc]');
    mailAction(b.dataset.mlact, row ? row.dataset.acc : '', b);
  });

  window.Panel.register((next) => { info = next; renderMail(); });
})();
