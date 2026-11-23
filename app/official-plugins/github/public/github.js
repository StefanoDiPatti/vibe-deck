(function () {
  'use strict';
  var H = Widgets.helpers, el = H.el, header = H.header, setHtml = H.setHtml, smallBtn = H.smallBtn, level = H.level, dictation = H.dictation, guideHtml = H.guideHtml, setText = D.setText;

  var GIT_GUIDE = [
    { title: 'IL TUO FLUSSO: UNA MODIFICA DALL\'INIZIO ALLA FINE', note: 'Nella cartella del progetto (es. vibe-deck), in PowerShell o nel terminale di VS Code.', items: [
      ['git checkout main', 'Torna sul ramo principale.'],
      ['git pull', 'Scarica da GitHub le novità (anche quelle fatte dall\'altro PC). Fallo sempre prima di iniziare.'],
      ['git checkout -b feature/nome', 'Crea un branch nuovo per la modifica e ci entra. Nomi tipo feature/..., fix/..., docs/...'],
      ['git status', 'Mostra cosa è cambiato: file modificati, nuovi, pronti per il commit.'],
      ['git add .', 'Prepara per il commit tutte le modifiche della cartella (git add nomefile per uno solo).'],
      ['git commit -m "cosa ho fatto"', 'Salva un punto nella storia, con una frase che spiega la modifica.'],
      ['git push -u origin feature/nome', 'Manda il branch su GitHub. La prima volta con -u, poi basta git push.'],
      ['gh pr create', 'Apre la pull request su GitHub (ti chiede titolo e descrizione). Si può fare anche dal sito.'],
      ['gh pr merge --merge --delete-branch', 'Unisce la pull request in main e cancella il branch. Solo quando sei convinto.', 'warn'],
      ['git checkout main  +  git pull', 'Torni su main aggiornato, pronto per la prossima modifica.']
    ] },
    { title: 'GUARDARE (NON CAMBIA NIENTE)', items: [
      ['git status', 'Su che branch sei e cosa è cambiato.'],
      ['git diff', 'Le righe modificate e non ancora preparate con git add.'],
      ['git diff --staged', 'Le righe già preparate, che finiranno nel prossimo commit.'],
      ['git log --oneline -10', 'Gli ultimi 10 commit, uno per riga.'],
      ['git log --oneline --graph --all', 'La storia di tutti i branch come un albero.'],
      ['git show <commit>', 'Cosa è cambiato in un commit (il codice tipo 5a703aa che vedi nel log).'],
      ['git branch -a', 'Tutti i branch: i tuoi locali e quelli su GitHub (remotes/origin/...).'],
      ['git remote -v', 'A quale repository GitHub è collegata la cartella.'],
      ['git blame <file>', 'Chi e quando ha cambiato ogni riga di un file.']
    ] },
    { title: 'BRANCH', items: [
      ['git branch', 'Elenco dei branch locali; quello con * è il tuo.'],
      ['git switch <nome>', 'Passa a un altro branch (uguale a git checkout <nome>).'],
      ['git switch -c <nome>', 'Crea un branch e ci entra (uguale a git checkout -b).'],
      ['git merge <altro>', 'Porta nel branch attuale le modifiche di un altro branch.', 'warn'],
      ['git branch -d <nome>', 'Cancella un branch locale già unito. Se non è unito git si rifiuta: bene così.'],
      ['git push origin --delete <nome>', 'Cancella il branch su GitHub.', 'warn']
    ] },
    { title: 'SINCRONIZZARE CON GITHUB', items: [
      ['git fetch', 'Scarica le novità senza toccare i tuoi file: dopo puoi guardarle con git log.'],
      ['git pull', 'Scarica e unisce le novità nel branch attuale (fetch + merge).'],
      ['git pull --rebase', 'Come pull, ma mette i tuoi commit locali dopo quelli arrivati: storia più lineare.'],
      ['git push', 'Manda i tuoi commit su GitHub.'],
      ['git clone <url>', 'Scarica un repository la prima volta (es. sul PC Linux).']
    ] },
    { title: 'ANNULLARE E METTERE DA PARTE', note: 'In rosso i comandi che buttano via lavoro: usali solo se sei sicuro.', items: [
      ['git restore --staged <file>', 'Toglie un file da quelli preparati per il commit. Le modifiche restano.'],
      ['git stash', 'Mette da parte le modifiche non salvate e pulisce la cartella (es. per cambiare branch).'],
      ['git stash pop', 'Riprende le modifiche messe da parte.'],
      ['git commit --amend', 'Corregge l\'ultimo commit (messaggio o file dimenticati). Solo se non l\'hai ancora pushato.', 'warn'],
      ['git revert <commit>', 'Crea un commit nuovo che annulla uno vecchio. Sicuro anche dopo il push.'],
      ['git reset --soft HEAD~1', 'Annulla l\'ultimo commit ma tiene le modifiche, pronte da ricommitare.', 'warn'],
      ['git restore <file>', 'Butta via le modifiche non salvate di un file. Non si recuperano.', 'danger'],
      ['git reset --hard', 'Butta via TUTTE le modifiche non salvate e torna all\'ultimo commit. Non si recuperano.', 'danger'],
      ['git push --force', 'Sovrascrive il branch su GitHub con il tuo. Può cancellare lavoro di altri o dell\'altro PC.', 'danger']
    ] },
    { title: 'PRIMA VOLTA SU UN PC', items: [
      ['git config --global user.name "Nome"', 'Il nome che compare nei commit.'],
      ['git config --global user.email "mail"', 'La mail dei commit (quella di GitHub).'],
      ['gh auth login', 'Collega il terminale al tuo account GitHub (serve per gh pr e per il push).'],
      ['git init', 'Trasforma una cartella in un repository git (solo per progetti nuovi).']
    ] }
  ];

  Widgets.register('github', function (root, tile, app) {
    D.addClass(root, 'w-gh');
    var refreshBtn = smallBtn('', 'refresh', function () { load(true); });
    var guideBtn = smallBtn('COMANDI GIT', 'terminal', function () { showGuide(!guideOn); });
    var tools = el('span', 'gh-tools');
    tools.appendChild(guideBtn); tools.appendChild(refreshBtn);
    var title = header(root, 'GITHUB', tools);
    var totals = el('div', 'gh-totals', '');
    var list = el('div', 'w-list scroll');
    var guide = el('div', 'w-list scroll gg hidden');
    guide.innerHTML = guideHtml(GIT_GUIDE);
    root.appendChild(totals); root.appendChild(list); root.appendChild(guide);
    var guideOn = false;
    function showGuide(on) {
      guideOn = on;
      D.store.set('gh:guide', on);
      D.toggleClass(guide, 'hidden', !on);
      D.toggleClass(list, 'hidden', on);
      D.toggleClass(totals, 'hidden', on);
      D.toggleClass(refreshBtn, 'hidden', on);
      D.toggleClass(guideBtn, 'on', on);
      guideBtn.innerHTML = Icons.html(on ? 'github' : 'terminal') + '<span>' + (on ? 'REPOSITORY' : 'COMANDI GIT') + '</span>';
      if (on) guide.scrollTop = 0;
      setText(title, on ? 'COMANDI GIT' : 'GITHUB' + (data && !data.authenticated ? ' (senza token)' : ''));
    }
    var timer = null, data = null;

    function ci(r) {
      if (!r.ci) return '<span class="badge none">CI —</span>';
      if (r.ci.status !== 'completed') return '<span class="badge run">CI …</span>';
      if (r.ci.conclusion === 'success') return '<span class="badge good">CI ✓</span>';
      if (r.ci.conclusion === 'failure') return '<span class="badge bad">CI ✗</span>';
      return '<span class="badge none">CI ' + D.esc(r.ci.conclusion || '?') + '</span>';
    }
    function deploy(r) {
      var d = r.deploy;
      if (!d) return '';
      var cls = d.status !== 'completed' ? 'run' : d.conclusion === 'success' ? 'good' : d.conclusion === 'failure' ? 'bad' : 'none';
      var mark = d.status !== 'completed' ? '…' : d.conclusion === 'success' ? '✓' : d.conclusion === 'failure' ? '✗' : '–';
      return '<span class="badge ' + cls + '" data-what="deploy" title="' + D.esc(d.name) + '">DEPLOY ' + mark + '</span>';
    }

    function render() {
      list.innerHTML = '';
      if (!data) return;
      if (!guideOn) setText(title, 'GITHUB' + (data.authenticated ? '' : ' (senza token)'));
      setText(totals, data.error ? data.error :
        'PR aperte ' + data.totals.prs + '   ·   Issue ' + data.totals.issues + (data.totals.failing ? '   ·   CI falliti ' + data.totals.failing : '') +
        (data.totals.deployFailing ? '   ·   Deploy falliti ' + data.totals.deployFailing : ''));
      D.toggleClass(totals, 'err', !!data.error);
      for (var i = 0; i < data.repos.length; i++) {
        var r = data.repos[i];
        var row = el('div', 'gh-row');
        if (r.error) {
          row.innerHTML = '<div class="gh-name">' + D.esc(r.full) + '</div><div class="gh-msg err">' + D.esc(r.error) + '</div>';
        } else {
          row.setAttribute('data-repo', r.full);
          row.innerHTML =
            '<div class="gh-badges">' +
              '<span class="badge pr" data-what="pulls">PR ' + r.prs + '</span>' +
              '<span class="badge is" data-what="issues">ISSUE ' + r.issues + '</span>' +
              '<span data-what="actions">' + ci(r) + '</span>' + deploy(r) +
            '</div>' +
            '<div class="gh-name">' + D.esc(r.name) + (r.private ? ' <span class="gh-priv">privato</span>' : '') + '</div>' +
            '<div class="gh-msg">' + (r.commit ? '<span class="notr">' + D.esc(r.commit.message) + '</span> <span class="gh-when">· ' + D.esc(D.ago(r.commit.date)) + '</span>' : '') + '</div>';
          bindRow(row, r.full);
        }
        list.appendChild(row);
      }
    }
    function bindRow(row, full) {
      D.bindTap(row, {
        scrollable: true,
        onTap: function (target) {
          var w = D.closestAttr(target, 'data-what', row);
          D.api.post('/api/plugins/github/open', { repo: full, what: w ? w.getAttribute('data-what') : 'repo' }, function (err, res) {
            app.toast(err ? err.message : res.message, err ? 'err' : 'ok');
          });
        }
      });
    }
    function load(force) {
      D.addClass(refreshBtn, 'spin');
      D.api.get('/api/plugins/github' + (force ? '?refresh=1' : ''), function (err, d) {
        D.removeClass(refreshBtn, 'spin');
        if (err) { setText(totals, err.message); D.addClass(totals, 'err'); return; }
        data = d;
        render();
      }, 30000);
    }
    showGuide(!!D.store.get('gh:guide', false));
    load(false);
    timer = D.every(60000, 300000, function () { load(false); });
    return { update: function () {}, resize: function () {}, destroy: function () { D.stop(timer); } };
  });
})();
