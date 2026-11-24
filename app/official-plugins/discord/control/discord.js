(function () {
  'use strict';
  const { $, esc, icon, api, toast } = window.Panel;
  const refresh = () => window.Panel.refresh();
  const adopt = () => window.Panel.update(info);
  let info = null;

  window.Panel.card('discord-card', `
    <div class="card-head">
      <div>
        <h2>Discord</h2>
        <p class="hint">Server, canali vocali, chi c'è in stanza e mute dal tablet. Aggiungi la pagina <b>DISCORD</b> alla barra qui sopra.</p>
      </div>
      <span id="dc-status" class="pill">…</span>
    </div>
    <div id="dc-body"></div>`);

  let dcKey = '';
  let editing = false;
  function renderDiscord() {
    const d = info.discord;
    const pill = $('dc-status');
    const body = $('dc-body');
    const map = {
      ready: ['COLLEGATO', 'ok'], setup: ['DA CONFIGURARE', ''], unauthorized: ['DA AUTORIZZARE', 'warn'],
      offline: ['DISCORD CHIUSO', 'bad'], connecting: ['IN ATTESA…', 'warn']
    };
    const st = map[d.status] || [d.status, ''];
    pill.textContent = st[0];
    pill.className = 'pill ' + st[1];
    const key = [d.status, d.configured, d.message, d.authError, d.media, d.user && d.user.id, editing].join('|');
    if (key === dcKey) return;
    dcKey = key;
    if (editing) { renderSetup(true); return; }

    if (d.status === 'ready') {
      body.innerHTML =
        '<div class="me">' + (d.user && d.user.avatar ? '<img alt="" src="' + esc(d.user.avatar) + '">' : '') +
        '<div><div class="who">' + esc(d.user ? d.user.name : '') + '</div><div class="hint">Il tablet può vedere i tuoi server e gestire la voce' + (d.media ? ', la webcam e il Go Live.' : '.') + '</div></div></div>' +
        (d.media ? '' : '<div class="err-box warn-box">Per i pulsanti <b>CAM</b> e <b>LIVE</b> serve un permesso in più: premi <b>Riautorizza</b> e conferma su Discord.</div>') +
        '<div class="row-actions">' +
          (d.media ? '' : '<button class="btn discord" id="dc-reauth" type="button">Riautorizza</button>') +
          '<button class="btn ghost" id="dc-logout" type="button">Scollega</button></div>';
      if ($('dc-reauth')) $('dc-reauth').onclick = () => run('/api/control/discord/authorize');
      $('dc-logout').onclick = async () => {
        if (!confirm('Scollegare Discord dalla dock?')) return;
        info = await api('POST', '/api/control/discord/logout'); adopt();
      };
      return;
    }
    if (d.configured && (d.status === 'unauthorized' || d.status === 'offline' || d.status === 'connecting')) {
      const msg = d.status === 'offline'
        ? 'Apri Discord su questo PC: la dock si collega da sola.'
        : d.status === 'connecting'
          ? 'Guarda la finestra di Discord: c\'è una richiesta da <b>autorizzare</b>.'
          : 'Manca l\'autorizzazione: premi il pulsante e conferma nella finestra di Discord.';
      body.innerHTML = '<p class="hint">' + msg + '</p>' +
        (d.authError || (d.status === 'offline' && d.message) ? '<div class="err-box">' + esc(d.authError || d.message) + '</div>' : '') +
        '<div class="row-actions">' +
          (d.status !== 'connecting' ? '<button class="btn discord" id="dc-auth" type="button">Autorizza su Discord</button>' : '') +
          '<button class="btn ghost" id="dc-edit" type="button">Cambia credenziali</button>' +
        '</div>';
      if ($('dc-auth')) $('dc-auth').onclick = () => run('/api/control/discord/authorize');
      $('dc-edit').onclick = () => { editing = true; renderDiscord(); };
      return;
    }
    renderSetup(false);
  }

  function renderSetup(editing) {
    const d = info.discord;
    $('dc-body').innerHTML =
      '<ol class="steps">' +
        '<li>Apri il <a href="https://discord.com/developers/applications" target="_blank" rel="noopener">Developer Portal di Discord</a> e premi <b>New Application</b> (nome a piacere, es. "Vibe Deck").</li>' +
        '<li>Vai in <b>OAuth2</b>: copia il <b>Client ID</b> e premi <b>Reset Secret</b> per avere il <b>Client Secret</b>.</li>' +
        '<li>Sempre in OAuth2, sotto <b>Redirects</b> premi <b>Add Redirect</b>, scrivi <code>' + esc(d.redirect) + '</code> (esatto, senza barra finale) e premi <b>Save Changes</b> in basso. Senza questo Discord risponde "missing redirect_uri".</li>' +
        '<li>Incolla qui sotto e premi <b>Collega</b>: Discord ti chiede di autorizzare la dock.</li>' +
      '</ol>' +
      '<div class="form">' +
        '<div><label for="dc-id">Client ID</label><input id="dc-id" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" value="' + esc(d.clientId) + '"></div>' +
        '<div><label for="dc-secret">Client Secret</label><input id="dc-secret" type="password" autocomplete="off" spellcheck="false" placeholder="' + (d.hasSecret && !editing ? 'già salvato' : '') + (d.hasSecret && editing ? 'lascia vuoto per tenere quello salvato' : '') + '"></div>' +
        '<button class="btn discord" id="dc-go" type="button">Collega</button>' +
      '</div>' +
      '<p class="hint small">Le credenziali restano su questo PC, cifrate in <code>data/discord.json</code>.</p>' +
      ((d.authError || d.message) && d.status !== 'setup' ? '<div class="err-box">' + esc(d.authError || d.message) + '</div>' : '');
    $('dc-go').onclick = () => run('/api/control/discord', { clientId: $('dc-id').value, clientSecret: $('dc-secret').value });
  }

  async function run(url, body) {
    const btns = document.querySelectorAll('#dc-body .btn');
    btns.forEach((b) => { b.disabled = true; });
    info.discord.status = 'connecting';
    $('dc-status').textContent = 'IN ATTESA…';
    $('dc-status').className = 'pill warn';
    toast('Conferma la richiesta nella finestra di Discord', '');
    try {
      info = await api('POST', url, body);
      editing = false;
      dcKey = '';
      adopt();
      toast('Discord collegato', 'ok');
    } catch (e) {
      toast(e.message, 'err');
      btns.forEach((b) => { b.disabled = false; });
      dcKey = '';
      refresh();
    }
  }

  window.Panel.register((next) => { info = next; renderDiscord(); });
})();
