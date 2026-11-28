(function () {
  'use strict';
  const { esc, api, toast } = window.Panel;
  const $ = (id) => document.getElementById(id);

  let data = null;
  let shown = false;

  function ago(at) {
    const s = Math.max(0, Math.round((Date.now() - at) / 1000));
    if (s < 60) return s + ' s fa';
    if (s < 3600) return Math.round(s / 60) + ' min fa';
    if (s < 86400) return Math.round(s / 3600) + ' h fa';
    return Math.round(s / 86400) + ' giorni fa';
  }

  function mask(url, key) { return shown ? url : url.replace(key, '••••••••••••••••'); }

  function render() {
    if (!data) return;
    const rows = [['Dati', data.push], ['Notifica', data.notify], ['Cambio pagina', data.goto]];
    $('au-urls').innerHTML = rows.map((r, i) =>
      '<div class="au-url"><b>' + esc(r[0]) + '</b><code>' + esc(mask(r[1], data.key)) + '</code>' +
      '<button class="btn small-btn" type="button" data-au-copy="' + i + '">Copia</button></div>').join('') +
      '<div class="au-url"><button class="btn small-btn" type="button" id="au-show">' + (shown ? 'Nascondi la chiave' : 'Mostra la chiave') + '</button></div>';
    $('au-count').textContent = data.values.length + (data.values.length === 1 ? ' valore' : ' valori');
    $('au-page').innerHTML = data.pages.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.title) + '</option>').join('');
    $('au-values').innerHTML = data.values.length ? data.values.map((v) =>
      '<div class="mk-row"><div class="txt"><span class="name">' + esc(v.name) + ' <small>' + esc(ago(v.at)) + '</small></span>' +
      '<span class="au-val">' + esc(JSON.stringify(v.value)) + '</span></div>' +
      '<button class="btn small-btn" type="button" data-au-forget="' + esc(v.name) + '">Togli</button></div>').join('')
      : '<p class="hint">Ancora nessun valore ricevuto.</p>';
  }

  async function load() {
    data = await api('GET', '/api/control/webhooks');
    render();
  }

  async function guarded(fn) {
    try { await fn(); } catch (err) { toast(err.message, 'err'); }
  }

  function start() {
    document.addEventListener('click', (e) => {
      const copy = e.target.closest('[data-au-copy]');
      const forget = e.target.closest('[data-au-forget]');
      if (copy) {
        const url = [data.push, data.notify, data.goto][+copy.dataset.auCopy];
        guarded(async () => { await navigator.clipboard.writeText(url); toast('Indirizzo copiato', 'ok'); });
      } else if (e.target.closest('#au-show')) { shown = !shown; render(); }
      else if (forget) guarded(async () => { await api('POST', '/api/control/webhooks/forget', { name: forget.dataset.auForget }); await load(); });
    });
    $('au-notify').addEventListener('click', () => guarded(async () => {
      await api('POST', '/api/control/webhooks/test', { message: $('au-msg').value.trim() || undefined });
      toast('Notifica mandata: sul tablet compare entro pochi secondi', 'ok');
    }));
    $('au-goto').addEventListener('click', () => guarded(async () => {
      await api('POST', '/api/control/webhooks/test', { page: $('au-page').value });
      toast('Richiesta mandata al tablet', 'ok');
    }));
    $('au-rotate').addEventListener('click', () => guarded(async () => {
      if (!window.confirm('Cambiare la chiave? Gli indirizzi attuali smettono di funzionare e vanno aggiornati negli script.')) return;
      await api('POST', '/api/control/webhooks/rotate');
      await load();
      toast('Chiave cambiata', 'ok');
    }));
    load().catch((err) => toast(err.message, 'err'));
    setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 10000);
  }

  window.Automation = { reload: load };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
