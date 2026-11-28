(function () {
  'use strict';
  const { $, esc, api, toast } = window.Panel;

  window.Panel.card('wol-card', `
    <div class="card-head">
      <div>
        <h2>Wake-on-LAN</h2>
        <p class="hint">Accendi PC, console o NAS della rete dal tablet. Aggiungi qui il dispositivo (nome e indirizzo MAC, lo trovi nelle impostazioni di rete); poi metti il widget <b>Wake-on-LAN</b> in una pagina, oppure usa l'azione <code>wol.wake</code> in un pulsante o in una regola. Il dispositivo deve avere Wake-on-LAN attivo nel BIOS e nella scheda di rete.</p>
      </div>
      <span id="wol-count" class="pill"></span>
    </div>
    <div class="wol-form">
      <label>Nome <input id="wol-name" type="text" maxlength="40" placeholder="PC del salotto"></label>
      <label>Indirizzo MAC <input id="wol-mac" type="text" maxlength="17" placeholder="00:1A:2B:3C:4D:5E"></label>
      <button id="wol-add" class="btn primary" type="button">Aggiungi</button>
    </div>
    <div id="wol-list" class="mk-list"></div>`);

  function render(info) {
    const w = info.wol;
    if (!w) return;
    $('wol-count').textContent = w.devices.length + (w.devices.length === 1 ? ' dispositivo' : ' dispositivi');
    $('wol-list').innerHTML = w.devices.length ? w.devices.map((d) =>
      '<div class="mk-row"><div class="txt"><span class="name">' + esc(d.name) + '</span><span class="desc">' + esc(d.mac) + '</span></div>' +
      '<button class="btn small-btn" type="button" data-wol-wake="' + esc(d.name) + '">Sveglia</button>' +
      '<button class="btn small-btn" type="button" data-wol-del="' + esc(d.name) + '">Togli</button></div>').join('')
      : '<p class="hint">Nessun dispositivo.</p>';
  }

  async function guarded(fn) {
    try { await fn(); } catch (e) { toast(e.message, 'err'); }
  }

  $('wol-add').addEventListener('click', () => guarded(async () => {
    window.Panel.update(await api('POST', '/api/control/wol/add', { name: $('wol-name').value, mac: $('wol-mac').value }));
    $('wol-name').value = '';
    $('wol-mac').value = '';
    toast('Dispositivo aggiunto', 'ok');
  }));

  $('wol-list').addEventListener('click', (e) => {
    const wake = e.target.closest('[data-wol-wake]');
    const del = e.target.closest('[data-wol-del]');
    if (wake) guarded(async () => { const r = await api('POST', '/api/control/wol/wake', { name: wake.dataset.wolWake }); toast(r.message, 'ok'); });
    else if (del) guarded(async () => { window.Panel.update(await api('POST', '/api/control/wol/remove', { name: del.dataset.wolDel })); });
  });

  window.Panel.register(render);
})();
