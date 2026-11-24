(function () {
  'use strict';
  const { $, esc, api, toast } = window.Panel;

  window.Panel.card('deepseek-card', `
    <div class="card-head">
      <div>
        <h2>DeepSeek</h2>
        <p class="hint">Chat con DeepSeek dal tablet: scrivi o detta, la risposta arriva mentre viene scritta. Serve una <b>chiave API</b>: la crei su <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener">platform.deepseek.com</a> (a consumo, si ricarica il credito). Resta su questo PC, cifrata. Aggiungi la pagina <b>DEEPSEEK</b> alla barra qui sopra.</p>
      </div>
      <span id="ds-status" class="pill"></span>
    </div>
    <div class="ds-pform">
      <label>Chiave API <input id="ds-key" type="password" autocomplete="new-password" placeholder="sk-…"></label>
      <label>Modello predefinito <select id="ds-model"></select></label>
      <button id="ds-save" class="btn primary" type="button">Salva e prova</button>
    </div>
    <label class="ds-system">Istruzioni per DeepSeek <textarea id="ds-system"></textarea></label>
    <div class="ds-actions">
      <button id="ds-remove" class="btn" type="button">Togli la chiave</button>
    </div>
    <p id="ds-msg" class="hint small"></p>`);

  const STATES = { ready: ['COLLEGATO', 'ok'], setup: ['DA CONFIGURARE', ''], error: ['ERRORE', 'bad'], unknown: ['DA PROVARE', 'warn'] };
  let filled = false;

  function money(b) {
    if (!b || !b.currency) return '';
    return (b.currency === 'USD' ? '$' : b.currency === 'CNY' ? '¥' : b.currency + ' ') + Number(b.total || 0).toFixed(2);
  }

  function render(info) {
    const d = info.deepseek;
    if (!d) return;
    const st = STATES[d.status] || [d.status, ''];
    $('ds-status').textContent = st[0];
    $('ds-status').className = 'pill ' + st[1];
    if (!filled) {
      $('ds-key').placeholder = d.configured ? 'salvata (lascia vuoto per non cambiarla)' : 'sk-…';
      $('ds-system').value = d.system || '';
      $('ds-model').innerHTML = '<option value="">automatico</option>' + d.models.map(function (m) {
        return '<option value="' + esc(m) + '"' + (m === d.model ? ' selected' : '') + '>' + esc(m) + '</option>';
      }).join('');
      filled = true;
    }
    $('ds-remove').hidden = !d.configured;
    let msg = '';
    if (d.message) msg = d.message;
    else if (d.status === 'ready') msg = 'Tutto a posto' + (d.balance ? ': credito ' + money(d.balance) + (d.balance.available ? '' : ' (esaurito, ricarica)') : '') + '.';
    $('ds-msg').textContent = msg;
    $('ds-msg').className = 'hint small' + (d.status === 'error' || (d.balance && !d.balance.available) ? ' err' : '');
  }

  async function save(body, okText) {
    try {
      const info = await api('POST', '/api/control/deepseek', body);
      $('ds-key').value = '';
      filled = false;
      window.Panel.update(info);
      const d = info.deepseek || {};
      toast(d.status === 'error' ? d.message : okText, d.status === 'error' ? 'err' : 'ok');
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  $('ds-save').addEventListener('click', function () {
    save({ key: $('ds-key').value, model: $('ds-model').value, system: $('ds-system').value }, 'DeepSeek salvato');
  });
  $('ds-remove').addEventListener('click', function () {
    if (window.confirm('Togliere la chiave API di DeepSeek da questo PC?')) save({ removeKey: true }, 'Chiave tolta');
  });

  window.Panel.register(render);
})();
