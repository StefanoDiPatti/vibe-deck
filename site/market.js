(function () {
  'use strict';

  const { esc, icon, panelLink, tagLabel } = window.Site;
  const DEFAULT_INDEX = 'https://raw.githubusercontent.com/StefanoDiPatti/vibe-deck-plugins/main/index.json';
  const params = new URLSearchParams(location.search);
  const INDEX = params.get('index') || DEFAULT_INDEX;
  const $ = (id) => document.getElementById(id);
  const teaser = document.body.dataset.market === 'teaser';

  const state = { packs: [], items: [], tag: '', q: '' };

  class Item {
    constructor(raw, origin) {
      Object.assign(this, raw);
      this.origin = origin;
      this.tags = Array.isArray(raw.tags) ? raw.tags : [];
      this.reads = (raw.permissions && raw.permissions.http) || [];
    }
    get official() { return this.origin === 'official'; }
    text() { return [this.name, this.description, this.author, this.id].concat(this.tags.map(tagLabel), this.tags).join(' ').toLowerCase(); }
    matches(q, tag) { return (!tag || this.tags.indexOf(tag) >= 0) && (!q || this.text().indexOf(q) >= 0); }
    action() {
      if (this.official) return { href: panelLink('pack=' + this.id), label: this.type === 'pack' ? 'Turn on' : 'Turn on', title: 'Already included in Vibe Deck: opens your control panel to turn it on' };
      return { href: panelLink('install=' + this.id), label: this.type === 'pack' ? 'Install pack' : 'Install', title: 'Opens your control panel to confirm' };
    }
  }

  function badges(p, children) {
    const out = [];
    if (p.official) out.push('<span class="badge off">Included in Vibe Deck</span>');
    if (p.type === 'pack') out.push('<span class="badge">' + children.length + ' plugins</span>');
    if (p.widgets) out.push('<span class="badge">' + p.widgets + ' widget' + (p.widgets === 1 ? '' : 's') + '</span>');
    if (p.pages) out.push('<span class="badge">' + p.pages + ' page' + (p.pages === 1 ? '' : 's') + '</span>');
    if (p.platforms && p.platforms.length === 1) out.push('<span class="badge">' + esc(p.platforms[0] === 'windows' ? 'Windows only' : 'Linux only') + '</span>');
    p.tags.forEach((t) => out.push('<button type="button" class="badge tagb" data-tag="' + esc(t) + '">#' + esc(tagLabel(t)) + '</button>'));
    p.reads.forEach((h) => out.push('<span class="badge net" title="Reads data from this site">reads ' + esc(h) + '</span>'));
    return '<div class="badges">' + out.join('') + '</div>';
  }

  function card(p, big) {
    const children = p.type === 'pack' ? p.includes.map(find).filter(Boolean) : [];
    const act = p.action();
    return '<article class="card' + (big ? ' pack' : '') + '" data-id="' + esc(p.id) + '" data-origin="' + p.origin + '">' +
      '<div class="card-top"><span class="card-ico">' + icon(p.icon || (p.type === 'pack' ? 'apps' : 'cube')) + '</span><div><h3>' + esc(p.name) + '</h3>' +
      '<div class="meta">' + (p.author ? 'by ' + esc(p.author) : '') + (p.version ? ' · v' + esc(p.version) : '') + '</div></div></div>' +
      '<p>' + esc(p.description) + '</p>' +
      (children.length ? '<ul class="incl">' + children.map((c) => '<li><span class="mini-ico">' + icon(c.icon || 'cube') + '</span>' + esc(c.name) + '</li>').join('') + '</ul>' : '') +
      badges(p, children) +
      '<a class="btn primary" data-act="install" href="' + esc(act.href) + '" title="' + esc(act.title) + '">' + esc(act.label) + '</a>' +
    '</article>';
  }

  function find(id) { return state.items.filter((x) => x.id === id)[0] || null; }

  function renderTags() {
    const box = $('tags');
    if (!box) return;
    const count = {};
    state.items.concat(state.packs).forEach((p) => p.tags.forEach((t) => { count[t] = (count[t] || 0) + 1; }));
    const all = Object.keys(count).sort((a, b) => count[b] - count[a] || a.localeCompare(b));
    box.innerHTML = ['', ...all].map((t) => '<button type="button" class="tag" data-tag="' + esc(t) + '" aria-pressed="' + (t === state.tag) + '">' +
      (t ? esc(tagLabel(t)) + ' <small>' + count[t] + '</small>' : 'All') + '</button>').join('');
  }

  function render() {
    const q = state.q;
    const packs = state.packs.filter((p) => p.matches(q, state.tag));
    const items = state.items.filter((p) => p.matches(q, state.tag));
    $('packs').innerHTML = (teaser ? packs.slice(0, 6) : packs).map((p) => card(p, true)).join('') || '<p class="small">No pack matches.</p>';
    if ($('cards')) $('cards').innerHTML = items.map((p) => card(p, false)).join('') || '<p class="small">Nothing found.</p>';
    if ($('market-state')) {
      $('market-state').textContent = items.length + ' of ' + state.items.length + ' plugins · ' + packs.length + ' packs' +
        (q || state.tag ? ' match' : '') + ' · Install opens the control panel of your deck (Vibe Deck must be running on this PC)';
    }
  }

  function setTag(t, jump) {
    state.tag = t;
    renderTags();
    render();
    const top = $('browse');
    if (jump && top && !teaser) top.scrollIntoView({ block: 'start' });
  }

  async function getJson(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function load() {
    let official = [];
    let market = { plugins: [], packs: [] };
    const errors = [];
    try { official = (await getJson('data/official.json')).plugins || []; } catch (e) { errors.push('official plugins: ' + e.message); }
    try { market = await getJson(INDEX); } catch (e) { errors.push('market: ' + e.message); }
    const off = official.map((p) => new Item(p, 'official'));
    const mk = (market.plugins || []).map((p) => new Item(p, 'market'));
    const mkPacks = (market.packs || []).map((p) => new Item(Object.assign({ type: 'pack' }, p), 'market'));
    state.items = off.filter((p) => p.type !== 'pack').concat(mk).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    state.packs = off.filter((p) => p.type === 'pack').concat(mkPacks);
    state.packs.forEach((p) => {
      if (!p.widgets) p.widgets = p.includes.map(find).filter(Boolean).reduce((n, c) => n + (c.widgets || 0), 0);
      if (!p.reads.length) p.includes.map(find).filter(Boolean).forEach((c) => c.reads.forEach((h) => { if (p.reads.indexOf(h) < 0) p.reads.push(h); }));
    });
    renderTags();
    render();
    if (errors.length && $('market-state')) $('market-state').textContent = 'Part of the market could not be loaded (' + errors.join('; ') + '). Try again later.';
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tag]');
    if (!t) return;
    const fromCard = t.classList.contains('tagb');
    setTag(fromCard && t.dataset.tag === state.tag ? '' : t.dataset.tag, fromCard);
  });
  if ($('q')) $('q').addEventListener('input', () => { state.q = $('q').value.trim().toLowerCase(); render(); });
  const pre = params.get('tag');
  if (pre) state.tag = pre;
  window.Site.deckSetting($('deck'));
  load();
})();
