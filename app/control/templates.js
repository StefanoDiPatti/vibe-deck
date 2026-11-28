(function () {
  'use strict';
  const { esc, icon, api, toast } = window.Panel;
  const $ = (id) => document.getElementById(id);

  let list = [];

  function render() {
    $('tp-list').innerHTML = list.map((t) =>
      '<button class="chip" type="button" data-tp="' + esc(t.id) + '" title="' + esc(t.description + ' (' + t.available + ' di ' + t.total + ' widget disponibili)') + '"' + (t.available ? '' : ' disabled') + '>' + icon(t.icon) + esc(t.title) + '</button>').join('');
  }

  function shownPage() {
    const on = document.querySelector('#hm-targets .chip.on');
    return on ? on.getAttribute('data-hmgo') : '';
  }

  async function opened(info) {
    window.Panel.update(info);
    await new Promise((r) => setTimeout(r, 60));
    const chip = document.querySelector('#hm-targets [data-hmgo="' + info.savedPage + '"]');
    if (chip) chip.click();
    const skipped = info.skipped || [];
    toast(skipped.length ? 'Pagina creata senza: ' + skipped.join(', ') + ' (non installati)' : 'Pagina creata: la trovi tra le disponibili in "Pagine del tablet"', skipped.length ? 'info' : 'ok');
  }

  async function guarded(fn) {
    try { await fn(); } catch (err) { toast(err.message, 'err'); }
  }

  function download(name, data) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function start() {
    $('tp-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tp]');
      if (b) guarded(async () => opened(await api('POST', '/api/control/templates/apply', { id: b.dataset.tp })));
    });
    $('tp-export').addEventListener('click', () => guarded(async () => {
      const id = shownPage();
      if (!/^u-/.test(id)) throw new Error('Apri una pagina tua (non la HOME) per esportarla');
      const t = await api('GET', '/api/control/pages/export?id=' + encodeURIComponent(id));
      download('vibe-deck-' + id + '.json', t);
      toast('Modello salvato', 'ok');
    }));
    $('tp-import').addEventListener('click', () => $('tp-file').click());
    $('tp-file').addEventListener('change', () => guarded(async () => {
      const f = $('tp-file').files[0];
      $('tp-file').value = '';
      if (!f) return;
      if (f.size > 60000) throw new Error('Il file è troppo grande per essere un modello');
      let template;
      try { template = JSON.parse(await f.text()); } catch (e) { throw new Error('Il file non è un JSON valido'); }
      await opened(await api('POST', '/api/control/pages/import', { template: template }));
    }));
    api('GET', '/api/control/templates').then((l) => { list = l; render(); }).catch((err) => toast(err.message, 'err'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
