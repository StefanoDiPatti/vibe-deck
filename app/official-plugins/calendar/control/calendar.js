(function () {
  'use strict';
  const { $, api, toast } = window.Panel;

  window.Panel.card('calendar-card', `
    <div class="card-head">
      <div>
        <h2>Calendario</h2>
        <p class="hint">Incolla il link <b>ICS</b> del calendario (Google Calendar: Impostazioni del calendario &gt; <i>Indirizzo segreto in formato iCal</i>; Apple, Outlook e Nextcloud hanno un link simile) oppure il percorso di un file <code>.ics</code> sul PC. Poi metti i widget <b>Next event</b> e <b>Agenda</b> in una pagina. Il link è un segreto: resta solo su questo PC.</p>
      </div>
      <span id="cal-status" class="pill"></span>
    </div>
    <div class="cal-form">
      <label>Link ICS <input id="cal-url" type="text" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"></label>
      <label>Oppure file <input id="cal-file" type="text" placeholder="/home/io/calendario.ics"></label>
      <button id="cal-save" class="btn primary" type="button">Salva e prova</button>
    </div>
    <p id="cal-msg" class="hint small"></p>`);

  let filled = false;

  function render(info) {
    const c = info.calendar;
    if (!c) return;
    if (!filled) { $('cal-url').value = c.url; $('cal-file').value = c.file; filled = true; }
    $('cal-status').textContent = c.url || c.file ? 'COLLEGATO' : 'DA COLLEGARE';
    $('cal-status').className = 'pill ' + (c.url || c.file ? 'ok' : '');
  }

  $('cal-save').addEventListener('click', async () => {
    try {
      window.Panel.update(await api('POST', '/api/control/calendar', { url: $('cal-url').value, file: $('cal-file').value }));
      const t = await api('POST', '/api/control/calendar/test');
      $('cal-msg').textContent = t.error ? t.error : t.count + ' eventi nei prossimi giorni' + (t.next ? ', il prossimo: ' + t.next.title + ' (' + t.next.when + ')' : '');
      $('cal-msg').className = 'hint small' + (t.error ? ' err' : '');
      toast(t.error ? 'Calendario non letto' : 'Calendario collegato', t.error ? 'err' : 'ok');
    } catch (e) { toast(e.message, 'err'); }
  });

  window.Panel.register(render);
})();
