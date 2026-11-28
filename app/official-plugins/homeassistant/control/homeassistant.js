(function () {
  'use strict';
  const { $, esc, api, toast } = window.Panel;

  window.Panel.card('ha-card', `
    <div class="card-head">
      <div>
        <h2>Casa (Home Assistant)</h2>
        <p class="hint">Alexa, Google Home, Hue, Zigbee e quasi ogni dispositivo smart entrano in <b>Home Assistant</b>: Vibe Deck parla con lui nella tua rete. In Home Assistant apri il tuo profilo &gt; <i>Sicurezza</i> &gt; <i>Token di accesso di lunga durata</i> e creane uno. Serrature e allarmi non si comandano da qui. Per chiamare altri servizi usa l'azione <code>homeassistant.webhook</code> (IFTTT, Voice Monkey, Shelly, Tasmota...).</p>
      </div>
      <span id="ha-status" class="pill"></span>
    </div>
    <div class="ha-form">
      <label>Indirizzo <input id="ha-url" type="text" placeholder="http://homeassistant.local:8123"></label>
      <label>Token <input id="ha-token" type="password" autocomplete="new-password"></label>
      <button id="ha-save" class="btn primary" type="button">Collega</button>
    </div>
    <p id="ha-msg" class="hint small"></p>
    <div id="ha-pick" hidden>
      <div class="ha-pick-head">
        <b>Dispositivi sul tablet</b> <span id="ha-count" class="pill"></span>
        <input id="ha-filter" type="text" placeholder="Cerca (nome o tipo)">
        <button id="ha-save-fav" class="btn primary small-btn" type="button">Salva la scelta</button>
      </div>
      <div id="ha-list" class="ha-list"></div>
    </div>`);

  let filled = false;
  let all = [];
  let chosen = [];
  let max = 24;

  function render(info) {
    const h = info.homeassistant;
    if (!h) return;
    if (!filled) { $('ha-url').value = h.url; $('ha-token').placeholder = h.hasToken ? 'salvato (lascia vuoto per non cambiarlo)' : 'incolla il token'; filled = true; }
    $('ha-status').textContent = h.url && h.hasToken ? 'COLLEGATO' : 'DA COLLEGARE';
    $('ha-status').className = 'pill ' + (h.url && h.hasToken ? 'ok' : '');
    if (!all.length) chosen = h.favorites.slice();
    max = h.max;
  }

  function list() {
    const q = $('ha-filter').value.trim().toLowerCase();
    const rows = all.filter((d) => !q || d.name.toLowerCase().indexOf(q) >= 0 || d.id.indexOf(q) >= 0);
    $('ha-count').textContent = chosen.length + ' / ' + max;
    $('ha-list').innerHTML = rows.slice(0, 300).map((d) =>
      '<label class="ha-row"><input type="checkbox" data-ha="' + esc(d.id) + '"' + (chosen.indexOf(d.id) >= 0 ? ' checked' : '') + '><span><b>' + esc(d.name) + '</b><small>' + esc(d.id) + (d.tap ? '' : ' · solo stato') + ' · ' + esc(d.label) + '</small></span></label>').join('') +
      (rows.length > 300 ? '<p class="hint">Altri ' + (rows.length - 300) + ': restringi la ricerca.</p>' : '');
  }

  async function guarded(fn) {
    try { await fn(); } catch (e) { toast(e.message, 'err'); }
  }

  async function loadList() {
    all = await api('GET', '/api/control/homeassistant/entities');
    $('ha-pick').hidden = false;
    list();
  }

  $('ha-save').addEventListener('click', () => guarded(async () => {
    const r = await api('POST', '/api/control/homeassistant', { url: $('ha-url').value, token: $('ha-token').value });
    $('ha-token').value = '';
    filled = false;
    window.Panel.update(r.info);
    if (r.test && r.test.error) { $('ha-msg').textContent = r.test.error; $('ha-msg').className = 'hint small err'; toast('Non collegato', 'err'); return; }
    $('ha-msg').textContent = r.test ? 'Collegato: ' + r.test.count + ' dispositivi in ' + r.test.domains + ' tipi.' : '';
    $('ha-msg').className = 'hint small';
    if (r.test) { await loadList(); toast('Home Assistant collegato', 'ok'); }
  }));

  $('ha-filter').addEventListener('input', list);
  $('ha-list').addEventListener('change', (e) => {
    const id = e.target.dataset && e.target.dataset.ha;
    if (!id) return;
    if (e.target.checked) {
      if (chosen.length >= max) { e.target.checked = false; toast('Al massimo ' + max + ' dispositivi', 'err'); return; }
      chosen.push(id);
    } else chosen = chosen.filter((x) => x !== id);
    $('ha-count').textContent = chosen.length + ' / ' + max;
  });
  $('ha-save-fav').addEventListener('click', () => guarded(async () => {
    window.Panel.update(await api('POST', '/api/control/homeassistant/favorites', { list: chosen }));
    toast('Scelta salvata: metti il widget "Smart home" in una pagina', 'ok');
  }));

  window.Panel.register(render);
  setTimeout(() => { if ($('ha-url').value) loadList().catch(() => {}); }, 400);
})();
