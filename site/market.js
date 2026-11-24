(function () {
  'use strict';

  const DEFAULT_INDEX = 'https://raw.githubusercontent.com/StefanoDiPatti/vibe-deck-plugins/main/index.json';
  const PANEL = 'http://127.0.0.1:8787/control';
  const params = new URLSearchParams(location.search);
  const INDEX = params.get('index') || DEFAULT_INDEX;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (window.Icons && Icons.html(n)) || (window.Icons && Icons.html('apps')) || '';

  let plugins = [];
  let tag = '';

  function card(p) {
    const reads = (p.permissions && p.permissions.http) || [];
    const count = [p.widgets ? p.widgets + ' widget' + (p.widgets === 1 ? '' : 's') : '', p.pages ? p.pages + ' page' + (p.pages === 1 ? '' : 's') : ''].filter(Boolean);
    return '<article class="card" data-id="' + esc(p.id) + '">' +
      '<div class="card-top"><span class="card-ico">' + icon(p.icon) + '</span><div><h3>' + esc(p.name) + '</h3>' +
      '<div class="meta">' + esc(p.author || '') + ' · v' + esc(p.version) + '</div></div></div>' +
      '<p>' + esc(p.description) + '</p>' +
      '<div class="badges">' + count.map((c) => '<span class="badge">' + c + '</span>').join('') +
      (p.tags || []).map((t) => '<span class="badge">#' + esc(t) + '</span>').join('') +
      reads.map((h) => '<span class="badge net" title="This plugin reads data from this site">reads ' + esc(h) + '</span>').join('') + '</div>' +
      '<a class="btn primary" href="' + PANEL + '#market-card&install=' + encodeURIComponent(p.id) + '" title="Opens the market in the control panel of your deck">Install</a>' +
    '</article>';
  }

  function render() {
    const q = $('q').value.trim().toLowerCase();
    const shown = plugins.filter((p) => (!tag || (p.tags || []).indexOf(tag) >= 0) &&
      (!q || (p.name + ' ' + p.description + ' ' + (p.tags || []).join(' ')).toLowerCase().indexOf(q) >= 0));
    $('cards').innerHTML = shown.map(card).join('');
    $('market-state').textContent = shown.length
      ? shown.length + ' of ' + plugins.length + ' plugins · Install opens your control panel (Vibe Deck must be running on this PC)'
      : 'Nothing found.';
  }

  function renderTags() {
    const all = [];
    plugins.forEach((p) => (p.tags || []).forEach((t) => { if (all.indexOf(t) < 0) all.push(t); }));
    all.sort();
    $('tags').innerHTML = ['', ...all].map((t) => '<button type="button" class="tag" data-tag="' + esc(t) + '" aria-pressed="' + (t === tag) + '">' + (t ? '#' + esc(t) : 'All') + '</button>').join('');
  }

  async function load() {
    try {
      const res = await fetch(INDEX, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      plugins = (data.plugins || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
      renderTags();
      render();
    } catch (e) {
      $('market-state').textContent = 'The market could not be loaded (' + e.message + '). Try again later.';
    }
  }

  $('q').addEventListener('input', render);
  $('tags').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tag]');
    if (!b) return;
    tag = b.dataset.tag;
    renderTags();
    render();
  });
  load();
})();
