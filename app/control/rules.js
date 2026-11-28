(function () {
  'use strict';
  const { esc, api, toast } = window.Panel;
  const $ = (id) => document.getElementById(id);

  let options = null;
  let rules = [];
  let saved = '';

  const triggerOf = (t) => options.triggers.find((x) => x.type === t);
  const reactionOf = (t) => options.reactions.find((x) => x.type === t);
  const snapshot = () => JSON.stringify(rules.map((r) => ({ id: r.id, name: r.name, enabled: r.enabled, when: r.when, then: r.then, cooldownSec: r.cooldownSec })));
  const dirty = () => snapshot() !== saved;

  function choices(p) {
    if (p.type === 'app') return options.apps;
    if (p.type === 'page') return options.pages;
    if (p.type === 'command') return options.commands;
    if (p.options === 'media') return options.media;
    return Array.isArray(p.options) ? p.options : null;
  }

  function field(p, values, where, i) {
    const list = choices(p);
    const v = values[p.name] === undefined ? (p.default === undefined ? '' : p.default) : values[p.name];
    const attrs = ' data-ru="' + where + '" data-i="' + i + '" data-p="' + esc(p.name) + '" title="' + esc(p.label) + '"';
    if (list) {
      return '<select' + attrs + '><option value="">' + esc(p.label) + '…</option>' +
        list.map((o) => '<option value="' + esc(o.value) + '"' + (String(o.value) === String(v) ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') + '</select>';
    }
    return '<input type="' + (p.type === 'number' ? 'number' : 'text') + '"' + attrs + ' placeholder="' + esc(p.label) + '" value="' + esc(v) + '">';
  }

  function part(label, where, list, current, i) {
    const def = (where === 'when' ? triggerOf : reactionOf)(current.type);
    return '<div class="ru-part"><b>' + label + '</b><select data-ru="' + where + '" data-i="' + i + '" data-p="type">' +
      '<option value="">Scegli…</option>' + list.map((x) => '<option value="' + esc(x.type) + '"' + (x.type === current.type ? ' selected' : '') + '>' + esc(x.label) + '</option>').join('') + '</select>' +
      (def ? def.params.map((p) => field(p, current, where, i)).join('') : '') + '</div>';
  }

  function lastLine(r) {
    if (!r.last) return '';
    const when = new Date(r.last.at).toLocaleTimeString();
    return '<span class="ru-last' + (r.last.ok ? '' : ' err') + '">Ultima volta: ' + esc(when) + (r.last.ok ? ' (ok)' : ' — ' + esc(r.last.message)) + '</span>';
  }

  function render() {
    if (!options) return;
    $('ru-count').textContent = rules.length + (rules.length === 1 ? ' regola' : ' regole');
    $('ru-list').innerHTML = rules.length ? rules.map((r, i) =>
      '<div class="ru-row' + (r.enabled ? '' : ' off') + '">' +
      '<label><input type="checkbox" data-ru="rule" data-i="' + i + '" data-p="enabled"' + (r.enabled ? ' checked' : '') + '> attiva</label>' +
      '<div class="ru-body">' + part('Quando', 'when', options.triggers, r.when, i) + part('Allora', 'then', options.reactions, r.then, i) +
      '<div class="ru-part"><b>Pausa</b><input type="number" min="0" max="86400" data-ru="rule" data-i="' + i + '" data-p="cooldownSec" value="' + esc(r.cooldownSec) + '"> secondi tra due scatti ' +
      '<input type="text" data-ru="rule" data-i="' + i + '" data-p="name" placeholder="Nome (facoltativo)" value="' + esc(r.name) + '"></div>' + lastLine(r) + '</div>' +
      '<div class="ru-side"><button class="btn small-btn" type="button" data-ru-test="' + i + '">Prova</button><button class="btn small-btn" type="button" data-ru-del="' + i + '">Togli</button></div></div>').join('')
      : '<p class="ru-empty">Nessuna regola. Parti da un esempio qui sotto o da "Nuova regola".</p>';
    $('ru-save').disabled = !dirty();
  }

  function blank() { return { id: '', name: '', enabled: true, when: { type: '' }, then: { type: '' }, cooldownSec: 10 }; }

  function pageLike(re) {
    const hit = options.pages.find((p) => re.test(p.value) || re.test(p.label));
    return hit ? hit.value : '';
  }

  function add(rule) { rules.push(Object.assign(blank(), rule)); render(); }

  function setValue(el) {
    const i = +el.dataset.i;
    const r = rules[i];
    const key = el.dataset.p;
    if (el.dataset.ru === 'rule') {
      r[key] = el.type === 'checkbox' ? el.checked : key === 'cooldownSec' ? Math.max(0, parseInt(el.value, 10) || 0) : el.value;
      return render();
    }
    if (key === 'type') {
      r[el.dataset.ru] = { type: el.value };
      return render();
    }
    r[el.dataset.ru][key] = el.type === 'number' && el.value !== '' ? Number(el.value) : el.value;
    $('ru-save').disabled = !dirty();
  }

  async function load() {
    const d = await api('GET', '/api/control/rules');
    options = d.options;
    rules = d.rules;
    saved = snapshot();
    render();
  }

  async function guarded(fn) {
    try { await fn(); } catch (err) { toast(err.message, 'err'); }
  }

  function start() {
    $('ru-list').addEventListener('change', (e) => { if (e.target.dataset && e.target.dataset.ru) setValue(e.target); });
    $('ru-list').addEventListener('input', (e) => { const t = e.target; if (t.dataset && t.dataset.ru && t.type !== 'checkbox' && t.tagName !== 'SELECT' && t.dataset.p !== 'cooldownSec') setValue(t); });
    $('ru-list').addEventListener('click', (e) => {
      const del = e.target.closest('[data-ru-del]');
      const tst = e.target.closest('[data-ru-test]');
      if (del) { rules.splice(+del.dataset.ruDel, 1); render(); }
      else if (tst) guarded(async () => {
        const r = rules[+tst.dataset.ruTest];
        if (dirty()) throw new Error('Salva le regole prima di provarle');
        const out = await api('POST', '/api/control/rules/test', { id: r.id });
        toast(out && out.ok ? 'Regola eseguita' : 'Non riuscita: ' + (out && out.message), out && out.ok ? 'ok' : 'err');
        await load();
      });
    });
    $('ru-add').addEventListener('click', () => add({}));
    $('ru-claude').addEventListener('click', () => add({ name: 'Claude ti aspetta', when: { type: 'claude_waiting' }, then: { type: 'goto', page: pageLike(/claude/i) }, cooldownSec: 30 }));
    $('ru-music').addEventListener('click', () => add({ name: 'Parte la musica', when: { type: 'music_playing' }, then: { type: 'goto', page: pageLike(/music|media/i) }, cooldownSec: 60 }));
    $('ru-save').addEventListener('click', () => guarded(async () => {
      const d = await api('POST', '/api/control/rules', { rules: rules });
      options = d.options; rules = d.rules; saved = snapshot(); render();
      toast('Regole salvate', 'ok');
    }));
    load().catch((err) => toast(err.message, 'err'));
  }

  window.Rules = { reload: load };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
