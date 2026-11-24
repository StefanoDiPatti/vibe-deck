(function () {
  'use strict';
  const { $, esc, icon, api, toast } = window.Panel;
  const refresh = () => window.Panel.refresh();
  const adopt = () => window.Panel.update(info);
  let info = null;

  window.Panel.card('games-card', `
    <div class="card-head">
      <div>
        <h2>Giochi</h2>
        <p class="hint">I pulsanti della pagina <b>GAMES</b>: scegli il file del gioco, dagli un nome e un'icona. Restano su questo PC (in <code>data/games.json</code>), non nel progetto. Aggiungi la pagina <b>GAMES</b> alla barra qui sopra.</p>
      </div>
      <span id="gm-count" class="pill"></span>
    </div>
    <div id="gm-list"></div>
    <div id="gm-add"></div>`);

  let gm = null;
  let gmKey = '';
  const gmChoiceKey = (c) => (!c ? 'none' : c.token ? 't:' + c.token : 'u:' + c.url);

  function renderGames() {
    const g = info.games;
    if (!g) return;
    $('gm-count').textContent = g.games.length ? g.games.length + (g.games.length === 1 ? ' GIOCO' : ' GIOCHI') : 'NESSUN GIOCO';
    $('gm-count').className = 'pill' + (g.games.length ? ' ok' : '');
    $('gm-list').innerHTML = g.games.map((x, i) =>
      '<div class="gm-row" data-gm="' + esc(x.id) + '">' +
        '<span class="gm-ico">' + (x.icon ? '<img src="' + esc(x.icon) + '" alt="">' : icon('gamepad')) + '</span>' +
        '<span class="txt"><span class="name">' + esc(x.label) + '</span>' +
          '<span class="desc' + (x.exists ? '' : ' err') + '" title="' + esc(x.path) + '">' + esc(x.exists ? x.path : 'File non trovato: ' + x.path) + '</span></span>' +
        '<button class="ibtn" type="button" data-gmact="up" title="Più a sinistra"' + (i ? '' : ' disabled') + '>↑</button>' +
        '<button class="ibtn" type="button" data-gmact="down" title="Più a destra"' + (i < g.games.length - 1 ? '' : ' disabled') + '>↓</button>' +
        '<button class="btn ghost small-btn" type="button" data-gmact="icon">Icona</button>' +
        '<button class="ibtn rm" type="button" data-gmact="remove" title="Togli" aria-label="Togli ' + esc(x.label) + '">' + icon('close') + '</button>' +
      '</div>'
    ).join('');
    renderGameForm();
  }

  function renderGameForm() {
    const key = gm ? [gm.mode, gm.id, gm.path, gm.iconToken, gm.searching, (gm.icons || []).length, gmChoiceKey(gm.chosen), gm.error || ''].join('|') : 'closed';
    if (key === gmKey) return;
    gmKey = key;
    if (!gm) {
      $('gm-add').innerHTML = '<button class="btn add-acc" type="button" data-gmact="pick">' + icon('add') + ' Aggiungi un gioco</button>' +
        '<p class="hint small">Si apre il selettore di file ' + (info.games.os === 'windows' ? 'di Windows' : 'del sistema') + ': scegli l\'eseguibile del gioco o il suo collegamento' +
        (info.games.os === 'windows' ? ' (.exe, .lnk, .url di Steam)' : ' (file .desktop, script o AppImage)') + '.</p>';
      return;
    }
    const cards = [];
    if (gm.iconToken) cards.push({ c: { token: gm.iconToken }, img: '/api/control/games/preview/' + encodeURIComponent(gm.iconToken), src: 'Dal file del gioco' });
    (gm.icons || []).forEach((x) => cards.push({ c: { url: x.url }, img: x.url, src: x.source, title: x.title }));
    const chosen = gmChoiceKey(gm.chosen);
    const grid = '<div class="gm-icons">' + cards.map((x) =>
      '<button type="button" class="gm-pick' + (gmChoiceKey(x.c) === chosen ? ' on' : '') + '" data-gmchoice="' + esc(JSON.stringify(x.c)) + '" title="' + esc((x.title ? x.title + ' · ' : '') + x.src) + '">' +
        '<img src="' + esc(x.img) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"><span>' + esc(x.src) + '</span></button>'
    ).join('') +
      '<button type="button" class="gm-pick none' + (chosen === 'none' ? ' on' : '') + '" data-gmchoice="null">' + icon('gamepad') + '<span>Nessuna</span></button>' +
    '</div>';
    const head = gm.mode === 'new'
      ? '<div class="ml-form"><div class="wide"><label>File del gioco</label><div class="gm-path">' + esc(gm.path) + '</div></div>' +
        '<div><label for="gm-label">Nome sul tablet</label><input id="gm-label" type="text" autocomplete="off" maxlength="40" value="' + esc(gm.label) + '"></div>' +
        '<div><label for="gm-proc">Processo del gioco (facoltativo)</label><input id="gm-proc" type="text" autocomplete="off" spellcheck="false" placeholder="' + esc(gm.process || 'nome del file') + '" value="' + esc(gm.procInput || '') + '"></div></div>' +
        '<p class="hint small">Il processo serve per il pallino verde e per riportare il gioco in primo piano. Se il file è un launcher (Battle.net, Riot, Game Center...) scrivi il nome del processo del gioco vero, senza .exe (più nomi separati da virgola).</p>'
      : '<p class="ml-help">Nuova icona per <b>' + esc(gm.label) + '</b>.</p>';
    $('gm-add').innerHTML = '<div class="gm-form">' + head +
      '<div class="gm-icons-head"><h3>Icona</h3>' +
        '<input id="gm-q" type="text" autocomplete="off" placeholder="Cerca sul web" value="' + esc(gm.query || gm.label) + '">' +
        '<button class="btn ghost small-btn" type="button" data-gmact="search"' + (gm.searching ? ' disabled' : '') + '>' + (gm.searching ? 'Cerco…' : 'Cerca icone') + '</button></div>' +
      grid +
      (gm.error ? '<p class="hint small err">' + esc(gm.error) + '</p>' : '') +
      '<p class="hint small">Proposte: l\'icona del file e le immagini del gioco su Steam, Wikipedia e Wikimedia Commons. L\'immagine scelta viene salvata su questo PC.</p>' +
      '<div class="row-actions"><button class="btn primary" type="button" data-gmact="save">' + (gm.mode === 'new' ? 'Aggiungi alla pagina GAMES' : 'Salva l\'icona') + '</button>' +
      '<button class="btn ghost" type="button" data-gmact="cancel">Annulla</button></div></div>';
  }

  async function searchGameIcons() {
    const q = ($('gm-q') && $('gm-q').value.trim()) || gm.label;
    if (!q) return;
    gm.query = q; gm.searching = true; gm.error = ''; renderGameForm();
    try {
      const r = await api('POST', '/api/control/games/search', { name: q });
      if (!gm) return;
      gm.icons = r.icons || [];
      if (!gm.icons.length) gm.error = 'Nessuna immagine trovata per "' + q + '": prova con un altro nome.';
      if (!gm.chosen && !gm.iconToken && gm.icons.length) gm.chosen = { url: gm.icons[0].url };
    } catch (e) { if (gm) gm.error = e.message; }
    if (gm) { gm.searching = false; renderGameForm(); }
  }

  async function gameAction(act, id, btn, el) {
    const keepInputs = () => { if (gm && $('gm-label')) { gm.label = $('gm-label').value; gm.procInput = $('gm-proc').value; } if (gm && $('gm-q')) gm.query = $('gm-q').value; };
    if (act === 'cancel') { gm = null; renderGameForm(); return; }
    if (act === 'search') { keepInputs(); searchGameIcons(); return; }
    if (act === 'choice') { keepInputs(); gm.chosen = JSON.parse(el.dataset.gmchoice); renderGameForm(); return; }
    if (btn) btn.disabled = true;
    try {
      if (act === 'pick') {
        toast('Si apre il selettore di file sul PC…', '');
        const r = await api('POST', '/api/control/games/pick', {});
        if (r.path) {
          gm = { mode: 'new', path: r.path, label: r.label || '', process: r.process || '', iconToken: r.iconToken || '', icons: [], chosen: r.iconToken ? { token: r.iconToken } : null };
          renderGameForm();
          searchGameIcons();
        }
      } else if (act === 'icon') {
        const g = info.games.games.find((x) => x.id === id);
        gm = { mode: 'icon', id: id, label: g ? g.label : '', icons: [], chosen: null };
        renderGameForm();
        searchGameIcons();
        api('POST', '/api/control/games/fileicon', { id: id }).then((r) => {
          if (gm && gm.id === id && r.token) { gm.iconToken = r.token; if (!gm.chosen) gm.chosen = { token: r.token }; renderGameForm(); }
        }).catch(() => {});
      } else if (act === 'save') {
        keepInputs();
        if (gm.mode === 'new') {
          info = await api('POST', '/api/control/games', { path: gm.path, label: gm.label, process: gm.procInput || '', icon: gm.chosen });
          toast(gm.label + ' aggiunto alla pagina GAMES', 'ok');
        } else {
          info = await api('POST', '/api/control/games/icon', { id: gm.id, icon: gm.chosen });
          toast('Icona cambiata', 'ok');
        }
        gm = null;
        adopt();
      } else if (act === 'remove') {
        const g = info.games.games.find((x) => x.id === id);
        if (!confirm('Togliere ' + (g ? g.label : 'il gioco') + ' dalla pagina GAMES?')) { if (btn) btn.disabled = false; return; }
        info = await api('POST', '/api/control/games/remove', { id: id });
        adopt();
      } else if (act === 'up' || act === 'down') {
        const ids = info.games.games.map((x) => x.id);
        const i = ids.indexOf(id), j = act === 'up' ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= ids.length) return;
        ids.splice(j, 0, ids.splice(i, 1)[0]);
        info = await api('POST', '/api/control/games/order', { ids: ids });
        adopt();
      }
    } catch (e) {
      if (gm && act === 'save') { gm.error = e.message; renderGameForm(); }
      toast(e.message, 'err');
    }
    if (btn) btn.disabled = false;
  }
  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-gmchoice]');
    if (c) { gameAction('choice', '', null, c); return; }
    const b = e.target.closest('[data-gmact]');
    if (!b) return;
    const row = b.closest('[data-gm]');
    gameAction(b.dataset.gmact, row ? row.dataset.gm : '', b);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && e.target.id === 'gm-q') { e.preventDefault(); gameAction('search'); }
  });

  window.Panel.register((next) => { info = next; renderGames(); });
})();
