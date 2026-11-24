(function () {
  'use strict';
  const { esc, icon, api, toast } = window.Panel;
  const $ = (id) => document.getElementById(id);

  const STATES = {
    available: { pill: '', label: 'Installa', action: 'install' },
    update: { pill: 'warn', text: 'AGGIORNAMENTO', label: 'Aggiorna', action: 'install' },
    installed: { pill: 'ok', text: 'INSTALLATO', label: 'Togli', action: 'remove' },
    official: { pill: '', text: 'GIÀ NELLA DOCK' },
    local: { pill: 'warn', text: 'HAI UN TUO PLUGIN CON QUESTO NOME' }
  };

  let data = null;

  function hosts(p) { return (p.permissions && Array.isArray(p.permissions.http)) ? p.permissions.http : []; }

  function row(p) {
    const st = STATES[p.state] || STATES.available;
    const reads = hosts(p);
    const action = !p.compatible && st.action === 'install'
      ? '<span class="pill bad">SERVE VIBE DECK ' + esc(String(p.engine || '').replace(/^>=\s*/, '')) + '+</span>'
      : st.action ? '<button class="btn ' + (st.action === 'remove' ? 'ghost' : 'primary') + ' small-btn" type="button" data-mk="' + st.action + '" data-id="' + esc(p.id) + '">' + esc(st.label) + (p.state === 'update' ? ' a ' + esc(p.version) : '') + '</button>' : '';
    return '<div class="mk-row" id="mk-' + esc(p.id) + '" data-id="' + esc(p.id) + '">' +
      '<span class="mk-ico">' + icon(p.icon || 'apps') + '</span>' +
      '<span class="txt"><span class="name">' + esc(p.name || p.id) + ' <small>' + esc(p.version) + (p.author ? ' · ' + esc(p.author) : '') + '</small></span>' +
        '<span class="desc">' + esc(p.description || '') + '</span>' +
        '<span class="mk-tags">' + (p.widgets ? '<span class="mk-tag">' + p.widgets + ' widget' + '</span>' : '') +
        (p.pages ? '<span class="mk-tag">' + p.pages + (p.pages === 1 ? ' pagina' : ' pagine') + '</span>' : '') +
        reads.map((h) => '<span class="mk-tag net" title="Legge dati da questo sito">legge da ' + esc(h) + '</span>').join('') + '</span></span>' +
      (st.text ? '<span class="pill ' + st.pill + '">' + st.text + '</span>' : '') +
      action +
      (p.state === 'update' ? '<button class="ibtn rm" type="button" title="Togli" data-mk="remove" data-id="' + esc(p.id) + '">' + icon('trash') + '</button>' : '') +
    '</div>';
  }

  function render() {
    const box = $('mk-list');
    if (!data) return;
    $('mk-site').href = data.site + '#market';
    $('mk-count').textContent = data.plugins.length + ' PLUGIN';
    box.innerHTML = data.plugins.length ? data.plugins.map(row).join('') : '<p class="hint small">Il market è vuoto per ora.</p>';
    highlight();
  }

  function highlight() {
    const m = /install=([a-z0-9_-]+)/.exec(location.hash);
    if (!m) return;
    const el = $('mk-' + m[1]);
    if (!el) return;
    el.classList.add('focus');
    el.scrollIntoView({ block: 'center' });
  }

  async function load(force) {
    $('mk-list').innerHTML = '<p class="hint small">Carico il market…</p>';
    try {
      data = await api('GET', '/api/control/market' + (force ? '?refresh=1' : ''));
      render();
    } catch (e) {
      $('mk-list').innerHTML = '<p class="hint err">' + esc(e.message) + '</p>';
    }
  }

  async function act(kind, id) {
    const p = data.plugins.find((x) => x.id === id);
    if (!p) return;
    if (kind === 'install') {
      const reads = hosts(p);
      if (reads.length && !window.confirm('"' + (p.name || p.id) + '" leggerà dati da internet: ' + reads.join(', ') + '.\nInstallare?')) return;
    } else if (!window.confirm('Togliere "' + (p.name || p.id) + '"? I suoi widget spariscono anche dalla HOME.')) return;
    try {
      if (kind === 'install') {
        const r = await api('POST', '/api/control/market/install', { id: id });
        toast((p.state === 'update' ? 'Aggiornato: ' : 'Installato: ') + (p.name || id) + ' ' + r.version + '. Aggiungi i suoi widget dalla HOME', 'ok');
      } else {
        await api('POST', '/api/control/market/remove', { id: id });
        toast('Tolto: ' + (p.name || id), 'ok');
      }
      await load(false);
      window.Panel.refresh();
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  function start() {
    if (!$('market-card')) return;
    $('mk-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mk]');
      if (b) act(b.dataset.mk, b.dataset.id);
    });
    $('mk-refresh').addEventListener('click', () => load(true));
    window.addEventListener('hashchange', highlight);
    load(false);
  }

  window.Market = { reload: load, site: () => (data ? data.site : 'https://stefanodipatti.github.io/vibe-deck/') };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
