(function () {
  'use strict';
  const { api, toast } = window.Panel;
  const $ = (id) => document.getElementById(id);

  function render(s) {
    $('hk-state').textContent = s.installed ? 'COLLEGATO' : s.partial ? 'A METÀ' : 'NON COLLEGATO';
    $('hk-install').textContent = s.installed ? 'Ricollega' : 'Collega Claude Code';
    $('hk-remove').disabled = !s.installed && !s.partial;
    $('hk-file').textContent = s.file;
  }

  async function run(fn, done) {
    try { render(await fn()); if (done) toast(done, 'ok'); } catch (err) { toast(err.message, 'err'); }
  }

  function start() {
    $('hk-install').addEventListener('click', () => run(() => api('POST', '/api/control/claude-hooks/install'), 'Claude Code collegato: vale dalle prossime sessioni'));
    $('hk-remove').addEventListener('click', () => run(() => api('POST', '/api/control/claude-hooks/remove'), 'Claude Code scollegato'));
    run(() => api('GET', '/api/control/claude-hooks'));
  }

  window.ClaudeHooks = { reload: () => run(() => api('GET', '/api/control/claude-hooks')) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
