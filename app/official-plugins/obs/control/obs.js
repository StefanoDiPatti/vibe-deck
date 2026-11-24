(function () {
  'use strict';
  const { $, esc, api, toast } = window.Panel;

  window.Panel.card('obs-card', `
    <div class="card-head">
      <div>
        <h2>OBS Studio</h2>
        <p class="hint">Diretta, registrazione, scene, microfono e anteprima dal tablet. In OBS: <b>Strumenti &gt; Impostazioni server WebSocket</b>, spunta <b>Abilita il server WebSocket</b>, poi <b>Mostra informazioni di connessione</b> e copia qui la password. Aggiungi la pagina <b>OBS</b> alla barra qui sopra.</p>
      </div>
      <span id="obs-status" class="pill"></span>
    </div>
    <div class="obs-form">
      <label>Indirizzo <input id="obs-host" type="text" placeholder="127.0.0.1"></label>
      <label>Porta <input id="obs-port" type="number" placeholder="4455"></label>
      <label>Password <input id="obs-pass" type="password" autocomplete="new-password"></label>
      <button id="obs-save" class="btn primary" type="button">Collega</button>
    </div>
    <p id="obs-msg" class="hint small"></p>`);

  const STATES = {
    ready: ['COLLEGATO', 'ok'], setup: ['DA CONFIGURARE', ''], offline: ['OBS CHIUSO', 'bad'],
    auth: ['PASSWORD SBAGLIATA', 'bad'], connecting: ['IN ATTESA…', 'warn']
  };
  let filled = false;

  function render(info) {
    const o = info.obs;
    if (!o) return;
    const st = STATES[o.status] || [o.status, ''];
    $('obs-status').textContent = st[0];
    $('obs-status').className = 'pill ' + st[1];
    if (!filled) {
      $('obs-host').value = o.host;
      $('obs-port').value = o.port;
      $('obs-pass').placeholder = o.hasPassword ? 'salvata (lascia vuoto per non cambiarla)' : 'nessuna';
      filled = true;
    }
    $('obs-msg').textContent = o.message ? o.message : o.status === 'ready' ? 'Tutto a posto: il tablet comanda OBS.' : '';
    $('obs-msg').className = 'hint small' + (o.status === 'auth' || o.status === 'offline' ? ' err' : '');
  }

  $('obs-save').addEventListener('click', async () => {
    try {
      const info = await api('POST', '/api/control/obs', { host: $('obs-host').value, port: $('obs-port').value, password: $('obs-pass').value });
      $('obs-pass').value = '';
      filled = false;
      window.Panel.update(info);
      toast(info.obs && info.obs.status === 'ready' ? 'OBS collegato' : (info.obs && info.obs.message) || 'Salvato', info.obs && info.obs.status === 'ready' ? 'ok' : 'err');
    } catch (e) {
      toast(e.message, 'err');
    }
  });

  window.Panel.register(render);
})();
