(function () {
  'use strict';
  const { $, esc, api, toast } = window.Panel;

  window.Panel.card('twitch-card', `
    <div class="card-head">
      <div>
        <h2>Twitch</h2>
        <p class="hint">Chat dal vivo e controlli della diretta sul tablet. Aggiungi la pagina <b>TWITCH</b> alla barra qui sopra.</p>
      </div>
      <span id="tw-status" class="pill"></span>
    </div>
    <div class="tw-row">
      <label>Canale della chat <input id="tw-channel" type="text" placeholder="nome del canale"></label>
      <button id="tw-save-channel" class="btn" type="button">Salva</button>
    </div>
    <p class="hint small">Basta il nome per leggere la chat di qualsiasi canale, senza login.</p>
    <div id="tw-account"></div>`);

  let polling = null;
  let shown = '';

  function guide() {
    return '<details class="tw-guide"><summary>Come ottengo il Client ID? (una volta sola)</summary><ol>' +
      '<li>Apri <a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noopener">dev.twitch.tv/console/apps</a> ed entra con il tuo account (serve l\'autenticazione a due fattori attiva).</li>' +
      '<li><b>Registra la tua applicazione</b>: nome <code>Vibe Deck</code> (o un altro), URL di reindirizzamento <code>http://localhost</code>, categoria <b>Broadcaster Suite</b>, tipo di client <b>Pubblico</b>.</li>' +
      '<li>Crea, apri <b>Gestisci</b> e copia qui sotto l\'<b>ID client</b>. Non serve nessun segreto.</li></ol></details>';
  }

  function render(info) {
    const t = info.twitch;
    if (!t) return;
    const pill = $('tw-status');
    pill.textContent = t.status === 'ready' ? 'COLLEGATO' : t.status === 'chat' ? 'SOLO CHAT' : 'DA CONFIGURARE';
    pill.className = 'pill ' + (t.status === 'ready' ? 'ok' : t.status === 'chat' ? 'warn' : '');
    if (document.activeElement !== $('tw-channel')) $('tw-channel').value = t.channel || '';
    const key = JSON.stringify([t.status, t.user, t.pending, t.clientId]);
    if (key === shown) return;
    shown = key;
    const box = $('tw-account');
    if (t.user) {
      box.innerHTML = '<div class="me">' + (t.user.avatar ? '<img alt="" src="' + esc(t.user.avatar) + '">' : '') +
        '<div><div class="who">' + esc(t.user.name || t.user.login) + '</div><div class="hint">Il tablet vede spettatori e chat e comanda titolo, categoria, marker, clip, pubblicità e modalità della chat.</div></div></div>' +
        '<div class="row-actions"><button id="tw-logout" class="btn ghost" type="button">Scollega</button></div>';
      $('tw-logout').onclick = () => run('/api/control/twitch/logout', {});
      stopPolling();
      return;
    }
    if (t.pending) {
      box.innerHTML = '<div class="tw-code"><div class="hint">Apri <a href="' + esc(t.pending.url) + '" target="_blank" rel="noopener">' + esc(t.pending.url) + '</a> e inserisci il codice:</div>' +
        '<div class="tw-big">' + esc(t.pending.code) + '</div>' +
        (t.pending.error ? '<p class="hint err">' + esc(t.pending.error) + '</p>' : '<p class="hint small">Aspetto la conferma su Twitch…</p>') + '</div>';
      startPolling();
      return;
    }
    box.innerHTML = '<h3 class="tw-sub">Controlli della diretta (login)</h3>' + guide() +
      '<div class="tw-row"><label>Client ID <input id="tw-client" type="text" spellcheck="false" placeholder="es. gp762nuuoqcoxypju8c569th9wz7q5" value="' + esc(t.clientId) + '"></label>' +
      '<button id="tw-login" class="btn primary" type="button">Collega Twitch</button></div>';
    $('tw-login').onclick = () => run('/api/control/twitch/login', { clientId: $('tw-client').value });
  }

  async function run(url, body) {
    try { window.Panel.update(await api('POST', url, body)); } catch (e) { toast(e.message, 'err'); }
  }
  function startPolling() {
    if (polling) return;
    polling = setInterval(() => run('/api/control/twitch/check', {}), 4000);
  }
  function stopPolling() { clearInterval(polling); polling = null; }

  $('tw-save-channel').addEventListener('click', async () => {
    await run('/api/control/twitch/channel', { channel: $('tw-channel').value });
    toast('Canale salvato', 'ok');
  });

  window.Panel.register(render);
})();
