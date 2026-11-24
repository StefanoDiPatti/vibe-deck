(function () {
  'use strict';
  const { esc, icon, api, toast } = window.Panel;
  const $ = (id) => document.getElementById(id);
  const SITE = 'https://stefanodipatti.github.io/vibe-deck/';

  const SHAPES = { value: 'Numero grande', bars: 'Barre', status: 'Acceso / spento', text: 'Testo', buttons: 'Pulsanti', voice: 'Comandi vocali', list: 'Lista', slider: 'Cursore' };
  const SOURCES = { pc: 'dati del PC', static: 'dati scritti nel widget', http: 'internet', file: 'un file del PC', command: 'un comando del PC' };

  let data = null;
  let restartNeeded = false;

  function hostOf(url) { try { return new URL(url).host; } catch (e) { return ''; } }

  function decodeWidget(text) {
    try {
      const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
      const w = JSON.parse(decodeURIComponent(escape(atob(b64 + '==='.slice((b64.length + 3) % 4)))));
      return w && w.def && typeof w.def === 'object' && !Array.isArray(w.def) ? w : null;
    } catch (e) { return null; }
  }

  function slug(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }

  function actionsOf(def) {
    const out = [];
    if (def.tap) out.push(def.tap);
    if (def.set) out.push(def.set);
    (def.buttons || []).forEach((b) => b && b.action && out.push(b.action));
    ((def.voice || {}).commands || []).forEach((c) => c && c.action && out.push(c.action));
    return out;
  }

  class Dialog {
    constructor() {
      this.el = $('confirm-dlg');
      this.onOk = null;
      $('cd-cancel').addEventListener('click', () => this.close());
      $('cd-ok').addEventListener('click', async () => {
        if (!this.onOk) return this.close();
        $('cd-ok').disabled = true;
        try { await this.onOk(); this.close(); } catch (e) { toast(e.message, 'err'); } finally { $('cd-ok').disabled = false; }
      });
      this.el.addEventListener('close', () => { if (/^#(install|pack|widget)=/.test(location.hash)) history.replaceState(null, '', location.pathname); });
    }
    open(opts) {
      $('cd-title').textContent = opts.title;
      $('cd-body').innerHTML = opts.html;
      $('cd-ok').textContent = opts.ok || 'OK';
      $('cd-ok').hidden = !opts.onOk && !opts.ok;
      $('cd-ok').disabled = !!opts.disabled;
      $('cd-cancel').textContent = opts.onOk ? 'Annulla' : 'Chiudi';
      this.onOk = opts.onOk || null;
      if (!this.el.open) this.el.showModal();
    }
    close() { if (this.el.open) this.el.close(); }
  }

  let dialog = null;

  function hostsHtml(list) {
    return list.length
      ? '<p class="cd-net">Legge dati da internet: ' + list.map((h) => '<code>' + esc(h) + '</code>').join(', ') + '</p>'
      : '<p class="hint small">Non legge niente da internet.</p>';
  }

  async function askInstall(id) {
    dialog.open({ title: 'Market', html: '<p class="hint">Carico "' + esc(id) + '" dal market…</p>' });
    let e;
    try { e = await api('GET', '/api/control/market/entry?id=' + encodeURIComponent(id)); } catch (err) {
      dialog.open({ title: 'Non trovato', html: '<p class="hint err">' + esc(err.message) + '</p>' });
      return;
    }
    const isPack = e.type === 'pack';
    const hosts = [];
    (isPack ? e.plugins : [e]).forEach((p) => ((p.permissions && p.permissions.http) || []).forEach((h) => { if (hosts.indexOf(h) < 0) hosts.push(h); }));
    const head = '<div class="cd-top"><span class="mk-ico">' + icon(e.icon || 'apps') + '</span><div><b>' + esc(e.name || e.id) + '</b>' +
      '<div class="hint small">' + (e.author ? 'di ' + esc(e.author) + ' · ' : '') + (isPack ? 'pack di ' + e.plugins.length + ' plugin' : 'v' + esc(e.version)) + '</div></div></div>' +
      '<p>' + esc(e.description || '') + '</p>';
    const list = isPack ? '<ul class="cd-list">' + e.plugins.map((p) => '<li><b>' + esc(p.name || p.id) + '</b> ' +
      (p.state === 'installed' ? '<span class="pill ok">GIÀ INSTALLATO</span>' : p.state === 'update' ? '<span class="pill warn">AGGIORNA A ' + esc(p.version) + '</span>' : '') +
      '<span class="hint small"> ' + esc(p.description || '') + '</span></li>').join('') + '</ul>' : '';
    let ok = isPack ? 'Installa il pack' : 'Installa';
    let note = '';
    let blocked = false;
    if (!e.compatible) { blocked = true; note = '<p class="hint err">Serve una versione più nuova di Vibe Deck.</p>'; }
    else if (e.state === 'official') { blocked = true; note = '<p class="hint">È già nella dock come plugin ufficiale.</p>'; }
    else if (e.state === 'local') { blocked = true; note = '<p class="hint err">Hai già un tuo plugin con questo nome: rinominalo o toglilo prima.</p>'; }
    else if (e.state === 'installed') { blocked = true; note = '<p class="hint">Già installato: niente da fare.</p>'; }
    else if (e.state === 'update') { ok = 'Aggiorna a ' + e.version; note = '<p class="hint">Hai la ' + esc(e.installedVersion) + '.</p>'; }
    else if (e.state === 'partial') { ok = 'Installa quelli che mancano'; }
    dialog.open({
      title: isPack ? 'Installare questo pack?' : 'Installare questo plugin?',
      html: head + list + hostsHtml(hosts) + note + '<p class="hint small">Solo JSON, controllato con l\'impronta del market. Poi aggiungi i widget dalla scheda HOME.</p>',
      ok: blocked ? '' : ok,
      onOk: blocked ? null : async () => {
        const r = await api('POST', '/api/control/market/install', { id: id });
        toast(isPack ? 'Pack installato: ' + (e.name || id) + (r.installed && r.installed.length ? ' (' + r.installed.length + ' plugin)' : '') : 'Installato: ' + (e.name || id) + ' ' + r.version, 'ok');
        await load();
        window.Panel.refresh();
      }
    });
  }

  function officialPack(id) {
    return data && (data.packs.filter((p) => p.id === id)[0] || data.plugins.filter((p) => p.id === id)[0]);
  }

  async function askPack(id) {
    if (!data) await load();
    const p = officialPack(id);
    if (!p) { dialog.open({ title: 'Non trovato', html: '<p class="hint err">"' + esc(id) + '" non è un pack ufficiale di questa dock.</p>' }); return; }
    const items = p.plugins || [p];
    const on = items.every((x) => x.on);
    dialog.open({
      title: on ? 'Pack già acceso' : 'Accendere questo pack?',
      html: '<div class="cd-top"><span class="mk-ico">' + icon(p.icon || 'apps') + '</span><div><b>' + esc(p.name) + '</b><div class="hint small">pack ufficiale, già incluso in Vibe Deck</div></div></div>' +
        '<p>' + esc(p.description || '') + '</p>' +
        (p.plugins ? '<ul class="cd-list">' + p.plugins.map((x) => '<li><b>' + esc(x.name) + '</b> ' + (x.on ? '<span class="pill ok">ACCESO</span>' : '') + '<span class="hint small"> ' + esc(x.description) + '</span></li>').join('') + '</ul>' : ''),
      ok: on ? '' : 'Accendi',
      onOk: on ? null : () => doSwitch(id, true)
    });
  }

  async function askWidget(raw) {
    const w = decodeWidget(raw);
    if (!w) { dialog.open({ title: 'Widget non valido', html: '<p class="hint err">Il link non contiene un widget leggibile.</p>' }); return; }
    const def = w.def;
    const id = slug(w.id || def.name);
    const src = def.source || { type: 'static' };
    const host = src.type === 'http' ? hostOf(src.url) : '';
    let mine = [];
    try { mine = await api('GET', '/api/control/widgets'); } catch (e) { mine = []; }
    const exists = mine.some((x) => x.plugin === 'miei' && x.id === id);
    let problems = [];
    try { problems = (await api('POST', '/api/control/shapes/preview', { plugin: 'miei', def: def, id: id || 'anteprima', allowHost: !!host })).problems; } catch (e) { problems = [e.message]; }
    if (!id) problems.unshift('il widget non ha un nome');
    const warn = [];
    const acts = actionsOf(def);
    if (acts.some((a) => a.type === 'command')) warn.push('Un tocco esegue un comando del PC: controlla che sia uno dei tuoi.');
    if (acts.some((a) => a.type === 'launch' || a.type === 'focus')) warn.push('Un tocco apre un\'app del PC.');
    if (src.type === 'command' || src.type === 'file') warn.push('Legge ' + SOURCES[src.type] + '.');
    dialog.open({
      title: exists ? 'Sostituire il tuo widget?' : 'Aggiungere questo widget?',
      html: '<div class="cd-top"><span class="mk-ico">' + icon(def.icon || 'apps') + '</span><div><b>' + esc(def.name || id) + '</b><div class="hint small">' +
        (def.author ? 'di ' + esc(def.author) + ' · ' : '') + esc(SHAPES[def.shape] || def.shape || '?') + ' · dati da ' + esc(SOURCES[src.type] || src.type) + '</div></div></div>' +
        (def.description ? '<p>' + esc(def.description) + '</p>' : '') +
        hostsHtml(host ? [host] : []) +
        warn.map((t) => '<p class="cd-net">' + esc(t) + '</p>').join('') +
        (problems.length ? '<ul class="cd-problems">' + problems.map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>' : '') +
        '<p class="hint small">Resta solo su questo PC, in <code>plugins/miei/</code>. Poi aggiungilo dalla scheda HOME.</p>',
      ok: problems.length ? '' : exists ? 'Sostituisci' : 'Aggiungi ai miei widget',
      onOk: problems.length ? null : async () => {
        await api('POST', '/api/control/widgets', { plugin: 'miei', id: id, def: def, allowHost: !!host, overwrite: exists });
        toast('Widget aggiunto: ' + (def.name || id) + '. Lo trovi in "Aggiungi un widget" della HOME', 'ok');
        await load();
        window.Panel.refresh();
      }
    });
  }

  async function doSwitch(id, on) {
    const r = await api('POST', '/api/control/plugins/switch', { id: id, on: on });
    if (r.restart) restartNeeded = true;
    toast((on ? 'Acceso: ' : 'Spento: ') + (officialPack(id) ? officialPack(id).name : id), 'ok');
    await load();
    window.Panel.refresh();
  }

  async function restart() {
    try {
      const r = await api('POST', '/api/control/restart', {});
      if (!r.restarting) { toast('Riavvia la dock dall\'icona (Riavvia)', 'err'); return; }
      toast('Riavvio la dock…', 'ok');
      restartNeeded = false;
      const until = Date.now() + 30000;
      await new Promise((res) => setTimeout(res, 1500));
      while (Date.now() < until) {
        try { await api('GET', '/api/control/installed'); location.reload(); return; } catch (e) { await new Promise((res) => setTimeout(res, 700)); }
      }
    } catch (e) { toast(e.message, 'err'); }
  }

  function switchBtn(id, on, label) {
    return '<button class="btn ' + (on ? 'ghost' : 'primary') + ' small-btn" type="button" data-sw="' + esc(id) + '" data-on="' + (on ? '0' : '1') + '">' + esc(label || (on ? 'Spegni' : 'Accendi')) + '</button>';
  }

  function render() {
    if (!data) return;
    const packs = data.packs.map((p) => '<div class="mk-row" data-pack="' + esc(p.id) + '"><span class="mk-ico">' + icon(p.icon || 'apps') + '</span>' +
      '<span class="txt"><span class="name">' + esc(p.name) + '</span><span class="desc">' + esc(p.description) + '</span>' +
      '<span class="mk-tags">' + p.plugins.map((x) => '<button type="button" class="mk-tag sw' + (x.on ? ' on' : '') + '" data-sw="' + esc(x.id) + '" data-on="' + (x.on ? '0' : '1') + '" title="' + (x.on ? 'Spegni ' : 'Accendi ') + esc(x.name) + '">' + esc(x.name) + '</button>').join('') + '</span></span>' +
      '<span class="pill ' + (p.state === 'on' ? 'ok' : p.state === 'partial' ? 'warn' : '') + '">' + (p.state === 'on' ? 'ACCESO' : p.state === 'partial' ? 'IN PARTE' : 'SPENTO') + '</span>' +
      switchBtn(p.id, p.state === 'on', p.state === 'on' ? 'Spegni' : 'Accendi tutto') + '</div>').join('');
    const singles = data.plugins.filter((p) => p.available).map((p) => '<div class="mk-row"><span class="mk-ico">' + icon(p.icon || 'apps') + '</span>' +
      '<span class="txt"><span class="name">' + esc(p.name) + '</span><span class="desc">' + esc(p.description) + '</span></span>' +
      '<span class="pill ' + (p.on ? 'ok' : '') + '">' + (p.on ? 'ACCESO' : 'SPENTO') + '</span>' + switchBtn(p.id, p.on) + '</div>').join('');
    const market = data.market.map((p) => '<div class="mk-row"><span class="mk-ico">' + icon('apps') + '</span>' +
      '<span class="txt"><span class="name">' + esc(p.name) + ' <small>' + esc(p.version) + (p.author ? ' · di ' + esc(p.author) : '') + '</small></span><span class="desc">' + esc(p.description) + '</span>' +
      '<span class="mk-tags">' + (p.widgets ? '<span class="mk-tag">' + p.widgets + ' widget</span>' : '') + ((p.permissions && p.permissions.http) || []).map((h) => '<span class="mk-tag net">legge da ' + esc(h) + '</span>').join('') + '</span></span>' +
      '<button class="btn ghost small-btn" type="button" data-rm-market="' + esc(p.id) + '">Togli</button></div>').join('');
    const mine = data.mine.map((w) => '<div class="mk-row"><span class="mk-ico">' + icon(w.icon || 'apps') + '</span>' +
      '<span class="txt"><span class="name">' + esc(w.name) + (w.author ? ' <small>di ' + esc(w.author) + '</small>' : '') + '</span><span class="desc' + (w.problems.length ? ' err' : '') + '">' + esc(w.problems.length ? w.problems[0] : w.key) + '</span></span>' +
      '<button class="btn ghost small-btn" type="button" data-rm-widget="' + esc(w.plugin + '/' + w.id) + '" data-name="' + esc(w.name) + '">Togli</button></div>').join('');
    $('in-restart').hidden = !restartNeeded;
    $('in-restart-btn').hidden = !data.canRestart;
    $('in-packs').innerHTML = packs + singles;
    $('in-market').innerHTML = market || '<p class="hint small">Niente dal market, per ora. <a href="' + esc((data.site || SITE) + 'market.html') + '" target="_blank" rel="noopener">Sfoglia il market</a>.</p>';
    $('in-mine').innerHTML = mine || '<p class="hint small">Nessun widget tuo. <a href="' + esc((data.site || SITE) + 'create.html') + '" target="_blank" rel="noopener">Creane uno sul sito</a>.</p>';
    $('in-count').textContent = (data.market.length + data.mine.length) + ' INSTALLATI';
  }

  async function load() {
    try { data = await api('GET', '/api/control/installed'); render(); } catch (e) { $('in-packs').innerHTML = '<p class="hint err">' + esc(e.message) + '</p>'; }
  }

  function route() {
    const m = /^#(install|pack|widget)=([A-Za-z0-9_-]+)$/.exec(location.hash);
    if (!m) return;
    if (m[1] === 'install') askInstall(m[2]);
    else if (m[1] === 'pack') askPack(m[2]);
    else askWidget(m[2]);
  }

  function start() {
    if (!$('installed-card')) return;
    dialog = new Dialog();
    $('installed-card').addEventListener('click', async (e) => {
      const sw = e.target.closest('[data-sw]');
      const rmM = e.target.closest('[data-rm-market]');
      const rmW = e.target.closest('[data-rm-widget]');
      try {
        if (sw) await doSwitch(sw.dataset.sw, sw.dataset.on === '1');
        else if (rmM) {
          if (!window.confirm('Togliere "' + rmM.dataset.rmMarket + '"? I suoi widget spariscono anche dalla HOME.')) return;
          await api('POST', '/api/control/market/remove', { id: rmM.dataset.rmMarket });
          toast('Tolto', 'ok'); await load(); window.Panel.refresh();
        } else if (rmW) {
          if (!window.confirm('Togliere il widget "' + rmW.dataset.name + '"? Se è nella HOME, sparisce anche da lì.')) return;
          const parts = rmW.dataset.rmWidget.split('/');
          await api('DELETE', '/api/control/widgets/' + encodeURIComponent(parts[0]) + '/' + encodeURIComponent(parts[1]));
          toast('Widget tolto', 'ok'); await load(); window.Panel.refresh();
        }
      } catch (err) { toast(err.message, 'err'); }
    });
    $('in-restart-btn').addEventListener('click', restart);
    window.addEventListener('hashchange', route);
    load().then(route);
  }

  window.Installed = { reload: load };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
