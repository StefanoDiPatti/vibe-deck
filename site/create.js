(function () {
  'use strict';
  const { esc, icon } = window.Site;
  const $ = (id) => document.getElementById(id);
  const core = window.ShapesCore;
  const DRAFT_KEY = 'vd-draft';
  const AUTHOR_KEY = 'vd-author';
  const REPO = 'https://github.com/StefanoDiPatti/vibe-deck-plugins';
  const FAKE_PC = {
    cpu: { usage: 37, temp: 54, cores: 8, model: 'Ryzen 7 5800X' }, ram: { usage: 48, usedGb: 7.7, totalGb: 16 },
    gpu: { name: 'GeForce RTX 3070', usage: 21, temp: 47, memUsedGb: 2.1, memTotalGb: 8 },
    net: { downMbps: 12.4, upMbps: 1.8, name: 'Wi-Fi' }, uptimeSeconds: 93784, hostname: 'MY-PC'
  };

  let toastTimer = null;
  function toast(text, kind) {
    const t = $('toast');
    t.textContent = text;
    t.className = 'show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, 3200);
  }

  const DEFAULT_PLUGIN = 'miei';
  const TYPE_NAMES = { number: 'numero', text: 'testo', boolean: 'sì / no', list: 'lista', columns: 'colonne', object: 'gruppo', empty: 'vuoto' };
  const CELL_W = 200;
  const CELL_H = 135;
  const GAP = 8;
  const PREVIEW_DELAY = 350;

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    Object.keys(attrs || {}).forEach((k) => {
      const v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    [].concat(children || []).forEach((c) => { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }

  function getAt(obj, path) {
    return path.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
  }
  function setAt(obj, path, value) {
    const keys = path.split('.');
    let o = obj;
    keys.slice(0, -1).forEach((k, i) => {
      if (o[k] === null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      o = o[k];
    });
    const last = keys[keys.length - 1];
    if (value === undefined || value === '') {
      if (Array.isArray(o)) o[last] = ''; else delete o[last];
    } else {
      o[last] = value;
    }
  }

  function slug(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }

  const STARTERS = {
    value: { show: { label: '', value: '' } },
    bars: { show: { label: '', rows: [{ label: '', value: '', bar: '' }] } },
    status: { show: { label: '', on: '', onText: 'Acceso', offText: 'Spento' } },
    text: { show: { label: '', text: '' } },
    buttons: { show: { label: '' }, buttons: [{ label: 'UNO', action: { type: 'media', command: 'play_pause' } }], source: { type: 'static', data: {} } },
    voice: { show: { label: '' }, voice: { commands: [{ say: ['pausa'], action: { type: 'media', command: 'play_pause' } }] }, source: { type: 'static', data: {} } },
    list: { show: { label: '', items: '', item: { title: '' } }, size: { w: 3, h: 2 } },
    slider: { show: { label: '', value: '', min: 0, max: 100, step: 1 }, set: { type: '' } }
  };

  class EditorState {
    constructor() {
      this.listeners = [];
      this.reset();
    }
    reset() {
      this.def = { name: '', shape: 'value', source: { type: 'pc' }, every: 5, show: { label: '', value: '' }, size: { w: 2, h: 1 } };
      this.plugin = DEFAULT_PLUGIN;
      this.id = '';
      this.fields = [];
      this.focus = null;
      this.slot = null;
      this.dragging = null;
      this.data = {};
    }
    on(fn) { this.listeners.push(fn); }
    emit(kind) { this.listeners.forEach((fn) => fn(kind)); }
    set(path, value, kind) {
      setAt(this.def, path, value);
      if (path === 'name') this.id = slug(value);
      this.emit(kind || 'value');
    }
    load(def, id) {
      this.def = JSON.parse(JSON.stringify(def));
      this.id = id || slug(def.name);
      this.fields = [];
      this.data = {};
      this.emit('structure');
    }
    changeShape(shape) {
      const keep = { name: this.def.name, description: this.def.description, icon: this.def.icon, source: this.def.source, every: this.def.every, size: this.def.size };
      const starter = JSON.parse(JSON.stringify(STARTERS[shape] || { show: {} }));
      this.def = Object.assign({ shape: shape }, keep, starter, starter.source ? {} : { source: keep.source });
      if (starter.size) this.def.size = starter.size;
      this.emit('structure');
    }
  }

  const state = new EditorState();
  let catalog = null;

  function choices(kind) { return (catalog && catalog.choices && catalog.choices[kind]) || []; }

  function trackFocus(input) {
    input.addEventListener('focus', () => { state.focus = input; });
    return input;
  }

  const Controls = {
    text(p, value, set) { return h('input', { type: 'text', value: value === undefined ? '' : String(value), oninput: (e) => set(e.target.value) }); },
    template(p, value, set) {
      return trackFocus(h('input', { type: 'text', class: 'tpl', placeholder: 'Testo e {{campi}}', value: value === undefined ? '' : String(value), oninput: (e) => set(e.target.value) }));
    },
    url(p, value, set) { return Controls.template(p, value, set); },
    path(p, value, set) { return Controls.template(p, value, set); },
    number(p, value, set) {
      return h('input', { type: 'number', value: value === undefined ? '' : value, min: p.min, max: p.max, oninput: (e) => set(e.target.value === '' ? undefined : Number(e.target.value)) });
    },
    boolean(p, value, set) { return h('input', { type: 'checkbox', checked: !!value, onchange: (e) => set(e.target.checked || undefined) }); },
    select(p, value, set, options) {
      const opts = options || p.options || [];
      return h('select', { onchange: (e) => set(e.target.value === '' ? undefined : e.target.value) },
        [h('option', { value: '', text: p.required ? 'Scegli…' : '—' })].concat(opts.map((o) =>
          h('option', { value: String(o.value), text: o.label, selected: String(o.value) === String(value === undefined ? (p.default === undefined ? '' : p.default) : value) }))));
    },
    app(p, value, set) { return Controls.select(p, value, set, choices('app')); },
    command(p, value, set) { return Controls.select(p, value, set, choices('command')); },
    keys(p, value, set) {
      return h('input', {
        type: 'text', placeholder: 'es. CTRL+SHIFT+ESC', value: Array.isArray(value) ? value.join('+') : '',
        oninput: (e) => set(e.target.value.split('+').map((s) => s.trim().toUpperCase()).filter(Boolean))
      });
    },
    key(p, value, set) { return h('input', { type: 'text', placeholder: 'es. F5', value: value || '', oninput: (e) => set(e.target.value.trim().toUpperCase() || undefined) }); },
    icon(p, value, set) {
      const grid = h('div', { class: 'ed-icongrid', hidden: true, role: 'listbox', 'aria-label': 'Icone' });
      const fill = () => {
        const q = input.value.trim().toLowerCase();
        const list = ((catalog && catalog.icons) || []).filter((i) => !q || i.name.indexOf(q) >= 0 || i.name === input.value);
        grid.innerHTML = list.length ? list.map((i) => '<button type="button" class="ed-ic' + (i.name === input.value ? ' on' : '') + '" data-icon="' + esc(i.name) + '" title="' + esc(i.name) + '">' + icon(i.name) + '<small>' + esc(i.name) + '</small></button>').join('') : '<p class="small">Nessuna icona con "' + esc(q) + '"</p>';
      };
      const choose = (name) => { input.value = name; set(name || undefined); swatch.innerHTML = icon(name); grid.hidden = true; };
      const input = trackFocus(h('input', { type: 'text', placeholder: 'es. sun, cpu', value: value || '', autocomplete: 'off',
        onfocus: () => { fill(); grid.hidden = false; },
        oninput: (e) => { set(e.target.value || undefined); swatch.innerHTML = icon(e.target.value); fill(); grid.hidden = false; },
        onkeydown: (e) => { if (e.key === 'Escape') grid.hidden = true; } }));
      const swatch = h('button', { type: 'button', class: 'ed-swatch', title: 'Scegli un\'icona', html: icon(value), onclick: () => { fill(); grid.hidden = !grid.hidden; } });
      grid.addEventListener('mousedown', (e) => e.preventDefault());
      grid.addEventListener('click', (e) => { const b = e.target.closest('[data-icon]'); if (b) choose(b.dataset.icon); });
      input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== swatch) grid.hidden = true; }, 150));
      return h('span', { class: 'ed-icon' }, [input, swatch, grid]);
    },
    json(p, value, set) {
      const ta = h('textarea', { rows: 4, spellcheck: 'false' });
      ta.value = value === undefined ? '' : JSON.stringify(value, null, 1);
      ta.addEventListener('input', () => {
        try { set(ta.value.trim() ? JSON.parse(ta.value) : undefined); ta.classList.remove('bad'); } catch (e) { ta.classList.add('bad'); }
      });
      return ta;
    },
    actions(p, value, set) { return Controls.json(p, value, set); },
    phrases(p, value, set) {
      return h('input', { type: 'text', placeholder: 'frase uno, frase due', value: Array.isArray(value) ? value.join(', ') : '', oninput: (e) => set(e.target.value.split(',').map((s) => s.trim()).filter(Boolean)) });
    }
  };

  function field(p, path) {
    const make = Controls[p.type] || Controls.text;
    const ctl = make(p, getAt(state.def, path), (v) => state.set(path, v));
    return h('label', { class: 'ed-field' + (p.type === 'boolean' ? ' check' : ''), 'data-path': path }, [
      h('span', { class: 'ed-label', text: p.label + (p.required ? ' *' : '') }),
      ctl,
      p.help ? h('span', { class: 'ed-help', text: p.help }) : null
    ]);
  }

  class ActionEditor {
    constructor(path, label, required) {
      this.path = path;
      this.label = label;
      this.required = required;
    }
    render() {
      const current = getAt(state.def, this.path) || {};
      const list = catalog.actions || [];
      const pick = h('select', {
        onchange: (e) => {
          state.set(this.path, e.target.value ? { type: e.target.value } : undefined, 'structure');
        }
      }, [h('option', { value: '', text: this.required ? 'Scegli un\'azione…' : 'Nessuna azione' })].concat(list.map((a) =>
        h('option', { value: a.type, text: a.label + (a.plugin ? ' · ' + a.plugin : ''), selected: a.type === current.type }))));
      const info = list.find((a) => a.type === current.type);
      const params = info ? info.params.map((p) => field(p, this.path + '.' + p.name)) : [];
      return h('div', { class: 'ed-action' }, [
        h('div', { class: 'ed-label', text: this.label }), pick,
        info && info.description ? h('div', { class: 'ed-help', text: info.description }) : null,
        h('div', { class: 'ed-params' }, params)
      ]);
    }
  }

  function listEditor(path, item, withAction, addLabel, starter) {
    const rows = getAt(state.def, path) || [];
    const box = h('div', { class: 'ed-list' });
    rows.forEach((row, i) => {
      const p = path + '.' + i;
      box.appendChild(h('div', { class: 'ed-item' }, [
        h('div', { class: 'ed-item-head' }, [
          h('span', { text: '#' + (i + 1) }),
          h('button', { class: 'ibtn rm', type: 'button', title: 'Togli', html: icon('close'), onclick: () => { rows.splice(i, 1); state.emit('structure'); } })
        ]),
        h('div', { class: 'ed-grid' }, item.map((q) => field(q, p + '.' + q.name))),
        withAction ? new ActionEditor(p + '.action', 'Azione', true).render() : null
      ]));
    });
    box.appendChild(h('button', {
      class: 'btn ghost small-btn', type: 'button', text: addLabel,
      onclick: () => { setAt(state.def, path + '.' + rows.length, JSON.parse(JSON.stringify(starter))); state.emit('structure'); }
    }));
    return box;
  }

  function shapeInfo() { return catalog.shapes.find((s) => s.name === state.def.shape); }

  function renderShapes() {
    $('ed-shapes').innerHTML = '';
    catalog.shapes.forEach((s) => {
      $('ed-shapes').appendChild(h('button', {
        type: 'button', class: 'ed-shape' + (s.name === state.def.shape ? ' on' : ''), 'data-shape': s.name, draggable: 'true', title: s.description,
        ondragstart: (e) => startDrag(e, { kind: 'shape', name: s.name }),
        ondragend: endDrag,
        onclick: () => { if (s.name !== state.def.shape) state.changeShape(s.name); }
      }, [h('b', { text: s.label }), h('span', { text: s.description })]));
    });
  }

  function sourcesFor() {
    return catalog.sources.filter((s) => !s.plugin);
  }

  function chipsFor(fields, prefix) {
    return fields.map((f) => {
      const insert = f.hint || '{{' + (prefix || '') + f.path + '}}';
      const chip = h('button', {
        type: 'button', class: 'ed-chip', title: insert, draggable: 'true',
        ondragstart: (e) => startDrag(e, { kind: 'data', insert: insert, label: f.label || f.path, type: f.type, unit: f.unit || '' }),
        ondragend: endDrag,
        onclick: () => insertTemplate(insert)
      }, [h('b', { text: f.label || f.path }), h('span', { text: f.type === 'list' || f.type === 'columns' ? (f.type === 'columns' ? 'colonne' : 'lista') + ' · ' + f.count : (f.sample !== undefined && f.sample !== '' ? f.sample : f.unit || TYPE_NAMES[f.type] || f.type) })]);
      const sub = f.item && f.item.length ? h('div', { class: 'ed-subchips' }, chipsFor(f.item, 'item.')) : null;
      return sub ? h('div', { class: 'ed-chipgroup' }, [chip, sub]) : chip;
    });
  }

  function insertTemplate(text) {
    const input = state.focus;
    if (!input || !document.body.contains(input)) { toast('Prima tocca un campo di testo qui sotto, poi scegli il dato', 'err'); return; }
    const start = input.selectionStart === null ? input.value.length : input.selectionStart;
    const end = input.selectionEnd === null ? input.value.length : input.selectionEnd;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    input.dispatchEvent(new Event('input'));
    input.focus();
    input.setSelectionRange(start + text.length, start + text.length);
  }

  function renderSource() {
    const box = $('ed-source');
    box.innerHTML = '';
    const src = state.def.source || { type: 'static' };
    const list = sourcesFor();
    const info = list.find((s) => s.type === src.type) || list[0];
    box.appendChild(h('label', { class: 'ed-field' }, [
      h('span', { class: 'ed-label', text: 'Fonte dei dati' }),
      h('select', {
        'data-ed': 'source',
        onchange: (e) => { state.fields = []; state.set('source', { type: e.target.value }, 'structure'); }
      }, list.map((s) => h('option', { value: s.type, text: s.label + (s.plugin ? ' · ' + s.plugin : ''), selected: s.type === src.type })))
    ]));
    if (info && info.description) box.appendChild(h('p', { class: 'ed-help', text: info.description }));
    const grid = h('div', { class: 'ed-grid' }, (info ? info.params : []).map((p) => field(p, 'source.' + p.name)));
    grid.appendChild(field({ name: 'every', label: 'Aggiorna ogni (secondi)', type: 'number', min: info ? info.minEvery : 1, help: info ? 'Minimo ' + info.minEvery + ' s' : '' }, 'every'));
    box.appendChild(grid);
    if (src.type === 'http') box.appendChild(h('p', { class: 'ed-help', text: 'The deck asks you to allow this site when you add the widget. The address must answer in JSON, without keys or passwords.' }));
    if (src.type === 'file' || src.type === 'command') box.appendChild(h('p', { class: 'ed-help warn', text: 'This reads your PC: the preview here uses empty data, and the widget can\'t go in the market as it is.' }));
    const known = info && info.fields && info.fields.length ? info.fields : state.fields;
    const tools = h('div', { class: 'ed-fields-head' }, [
      h('span', { class: 'ed-label', text: known.length ? 'Dati disponibili: tocca un campo di testo, poi un dato' : 'Dati disponibili' }),
      h('button', { type: 'button', class: 'btn ghost small-btn', 'data-ed': 'sample', text: src.type === 'http' ? 'Try the address' : 'Show sample data', onclick: sample })
    ]);
    box.appendChild(tools);
    box.appendChild(h('div', { class: 'ed-chips', id: 'ed-fields' }, known.length ? chipsFor(known) : [h('span', { class: 'ed-help', text: src.type === 'http' ? 'Press "Try the address" to see which data arrive.' : 'Press "Show sample data".' })]));
  }

  function fakeFrom(fields) {
    const out = {};
    fields.forEach((f) => {
      const v = f.type === 'number' ? (f.unit === '%' ? 42 : 7) : f.type === 'boolean' ? true : f.type === 'list' ? [] : 'Sample';
      setAt(out, f.path, v);
    });
    return out;
  }

  function dataFor(src) {
    const info = catalog.sources.find((s) => s.type === src.type);
    if (src.type === 'static') return src.data === undefined ? {} : src.data;
    if (src.type === 'pc') return Object.assign(JSON.parse(JSON.stringify(FAKE_PC)), { apps: fakeFrom((info.fields || []).filter((f) => /^apps\./.test(f.path))).apps || {} });
    if (src.type === 'http') return state.data[src.url] || {};
    return info && info.fields && info.fields.length ? fakeFrom(info.fields) : {};
  }

  async function sample() {
    const btn = document.querySelector('[data-ed="sample"]');
    const src = state.def.source || {};
    if (src.type !== 'http') {
      const data = dataFor(src);
      state.fields = core.fields.fieldsOf(data);
      $('ed-sample').textContent = JSON.stringify(data, null, 1).slice(0, 2000);
      renderSource();
      schedulePreview();
      return;
    }
    if (!/^https?:\/\//.test(src.url || '')) { toast('Write the address first', 'err'); return; }
    if (/\{\{/.test(src.url)) { toast('The address has {{fields}}: try it on your deck', 'err'); return; }
    if (btn) btn.disabled = true;
    try {
      const res = await fetch(src.url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('the site answered ' + res.status);
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch (e) { data = { text: text.trim(), lines: text.trim().split(/\r?\n/) }; }
      state.data[src.url] = data;
      state.fields = core.fields.fieldsOf(data);
      $('ed-sample').textContent = JSON.stringify(data).slice(0, 2000);
      renderSource();
      schedulePreview();
      toast(state.fields.length + ' fields found', 'ok');
    } catch (e) {
      toast(/Failed to fetch|NetworkError|Load failed/i.test(e.message) ? 'This site does not let a web page read it (CORS): the preview stays empty here, it works on your deck' : 'Could not read it: ' + e.message, 'err');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function renderShow() {
    const box = $('ed-show');
    box.innerHTML = '';
    const info = shapeInfo();
    info.show.forEach((p) => {
      if (p.type === 'rows') {
        box.appendChild(h('div', { class: 'ed-block' }, [h('div', { class: 'ed-label', text: p.label }),
          listEditor('show.' + p.name, p.item, false, 'Aggiungi una riga', { label: '', value: '' })]));
      } else if (p.type === 'row') {
        box.appendChild(h('div', { class: 'ed-block' }, [h('div', { class: 'ed-label', text: p.label }),
          h('div', { class: 'ed-grid' }, p.item.map((q) => field(q, 'show.' + p.name + '.' + q.name)))]));
      } else {
        box.appendChild(field(p, 'show.' + p.name));
      }
    });
  }

  function renderActions() {
    const box = $('ed-actions');
    box.innerHTML = '';
    shapeInfo().actions.forEach((a) => {
      if (a.list) {
        const starter = a.name === 'buttons' ? { label: 'NUOVO', action: { type: '' } } : { say: [], action: { type: '' } };
        box.appendChild(h('div', { class: 'ed-block' }, [h('div', { class: 'ed-label', text: a.label }),
          listEditor(a.name, a.item, true, a.name === 'buttons' ? 'Aggiungi un pulsante' : 'Aggiungi un comando', starter)]));
      } else {
        box.appendChild(new ActionEditor(a.name, a.label, a.required).render());
      }
    });
  }

  function renderMeta() {
    const box = $('ed-meta');
    box.innerHTML = '';
    const size = state.def.size || {};
    const sel = (name, max) => h('select', { 'data-ed': 'size-' + name, onchange: (e) => state.set('size.' + name, Number(e.target.value)) },
      Array.from({ length: max }, (_, i) => h('option', { value: i + 1, text: String(i + 1), selected: (size[name] || (name === 'w' ? 2 : 1)) === i + 1 })));
    box.appendChild(h('div', { class: 'ed-grid' }, [
      field({ name: 'name', label: 'Nome (nel catalogo della HOME)', type: 'text', required: true }, 'name'),
      field({ name: 'description', label: 'Descrizione', type: 'text' }, 'description'),
      field({ name: 'icon', label: 'Icona nel catalogo', type: 'icon' }, 'icon'),
      h('label', { class: 'ed-field' }, [h('span', { class: 'ed-label', text: 'Larghezza (celle)' }), sel('w', 8)]),
      h('label', { class: 'ed-field' }, [h('span', { class: 'ed-label', text: 'Altezza (celle)' }), sel('h', 6)])
    ]));
    $('ed-id').textContent = state.id ? 'miei/' + state.id : '';
    $('ed-title').textContent = state.def.name ? state.def.name : 'New widget';
  }


  const DROP_TYPES = ['template', 'text', 'url', 'path', 'icon'];
  let paletteFilter = '';

  function startDrag(e, payload) {
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copy';
    document.body.classList.add('ed-dragging');
    state.dragging = payload;
  }

  function endDrag() {
    document.body.classList.remove('ed-dragging');
    state.dragging = null;
    document.querySelectorAll('.ed-over').forEach((n) => n.classList.remove('ed-over'));
  }

  function readDrop(e) {
    try { return JSON.parse(e.dataTransfer.getData('text/plain')); } catch (x) { return state.dragging || null; }
  }

  function renderPaletteActions() {
    const box = $('ed-palette-actions');
    const q = paletteFilter.trim().toLowerCase();
    const list = (catalog.actions || []).filter((a) => !q || a.label.toLowerCase().indexOf(q) >= 0 || a.type.indexOf(q) >= 0 || (a.description || '').toLowerCase().indexOf(q) >= 0);
    box.innerHTML = '';
    list.forEach((a) => {
      box.appendChild(h('button', {
        type: 'button', class: 'ed-act', draggable: 'true', 'data-action': a.type, title: a.description || a.type,
        ondragstart: (e) => startDrag(e, { kind: 'action', type: a.type, label: a.label }),
        ondragend: endDrag,
        onclick: () => applyAction(null, { type: a.type, label: a.label })
      }, [h('span', { text: a.label }), a.plugin ? h('small', { text: a.plugin }) : null]));
    });
    if (!list.length) box.appendChild(h('span', { class: 'ed-help', text: 'No action matches.' }));
  }

  function slotsFor(info) {
    const slots = [];
    (info.show || []).forEach((p) => {
      if (p.type === 'rows') slots.push({ kind: 'rows', path: 'show.' + p.name, label: p.label });
      else if (p.type === 'row') (p.item || []).forEach((q) => { if (DROP_TYPES.indexOf(q.type) >= 0) slots.push({ kind: 'field', path: 'show.' + p.name + '.' + q.name, label: q.label }); });
      else if (DROP_TYPES.indexOf(p.type) >= 0) slots.push({ kind: 'field', path: 'show.' + p.name, label: p.label });
    });
    (info.actions || []).forEach((a) => {
      if (a.list) slots.push({ kind: 'actions-list', path: a.name, label: a.label });
      else slots.push({ kind: 'action', path: a.name, label: a.label });
    });
    return slots;
  }

  function slotText(slot) {
    const v = getAt(state.def, slot.path);
    if (slot.kind === 'action') {
      if (!v || !v.type) return '';
      const a = (catalog.actions || []).find((x) => x.type === v.type);
      return a ? a.label : v.type;
    }
    if (slot.kind === 'rows' || slot.kind === 'actions-list') return Array.isArray(v) && v.length ? v.length + (v.length === 1 ? ' item' : ' items') : '';
    return v === undefined || v === null ? '' : String(v);
  }

  function propertyInput(path) {
    return document.querySelector('#editor-card .ed-props [data-path="' + path + '"] input, #editor-card .ed-props [data-path="' + path + '"] textarea, #editor-card .ed-props [data-path="' + path + '"] select');
  }

  function focusSlot(slot) {
    state.slot = slot.path;
    let target = null;
    if (slot.kind === 'action') target = document.querySelector('#ed-actions .ed-action select');
    else if (slot.kind === 'field') target = propertyInput(slot.path);
    else target = document.querySelector(slot.kind === 'rows' ? '#ed-show .ed-block' : '#ed-actions .ed-block');
    if (target && target.scrollIntoView) target.scrollIntoView({ block: 'nearest' });
    if (target && target.focus && slot.kind === 'field') target.focus();
    document.querySelectorAll('.ed-slot').forEach((n) => n.classList.toggle('on', n.dataset.slot === slot.path));
  }

  function applyData(slot, d) {
    if (slot.kind === 'rows') {
      const rows = getAt(state.def, slot.path) || [];
      const isPct = d.type === 'number' && d.unit === '%';
      setAt(state.def, slot.path + '.' + rows.length, Object.assign({ label: d.label, value: d.insert }, isPct ? { bar: d.insert } : {}));
      state.emit('structure');
      return true;
    }
    if (slot.kind !== 'field') { toast('Drop data on a text slot', 'err'); return false; }
    if (/item\./.test(d.insert) && !/\.item\./.test('.' + slot.path + '.')) { toast('This piece belongs inside a list row', 'err'); return false; }
    state.set(slot.path, d.insert, 'structure');
    return true;
  }

  function applyAction(slot, a) {
    const info = shapeInfo();
    const target = slot || slotsFor(info).find((s) => (s.kind === 'action' || s.kind === 'actions-list') && (s.path === state.slot || !state.slot));
    const chosen = target || slotsFor(info).find((s) => s.kind === 'action' || s.kind === 'actions-list');
    if (!chosen) { toast('This shape has no action', 'err'); return false; }
    if (chosen.kind === 'actions-list') {
      const rows = getAt(state.def, chosen.path) || [];
      const row = chosen.path === 'buttons' ? { label: 'NEW', action: { type: a.type } } : { say: [], action: { type: a.type } };
      setAt(state.def, chosen.path + '.' + rows.length, row);
      state.emit('structure');
      return true;
    }
    state.set(chosen.path, { type: a.type }, 'structure');
    return true;
  }

  function dropOnSlot(slot, payload) {
    if (!payload) return;
    if (payload.kind === 'data') applyData(slot, payload);
    else if (payload.kind === 'action') applyAction(slot, payload);
    else if (payload.kind === 'shape') toast('Drop shapes on the preview', 'err');
  }

  function renderSlots() {
    const box = $('ed-slots');
    if (!box || !catalog) return;
    const info = shapeInfo();
    if (!info) return;
    box.innerHTML = '';
    slotsFor(info).forEach((slot) => {
      const text = slotText(slot);
      const clear = text && slot.kind !== 'rows' && slot.kind !== 'actions-list'
        ? h('button', { type: 'button', class: 'clear', title: 'Empty this slot', 'aria-label': 'Empty this slot', text: '×', onclick: (e) => { e.stopPropagation(); state.set(slot.path, slot.kind === 'action' ? undefined : '', 'structure'); } }) : null;
      const el = h('div', {
        class: 'ed-slot' + (text ? '' : ' empty') + (state.slot === slot.path ? ' on' : ''), 'data-slot': slot.path, role: 'button', tabindex: '0',
        title: slot.label,
        onclick: () => focusSlot(slot),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusSlot(slot); } },
        ondragover: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; el.classList.add('over'); },
        ondragleave: () => el.classList.remove('over'),
        ondrop: (e) => { e.preventDefault(); el.classList.remove('over'); dropOnSlot(slot, readDrop(e)); endDrag(); }
      }, [h('b', { text: slot.label }), h('span', { text: text || (slot.kind === 'rows' ? 'drop data to add a row' : slot.kind === 'actions-list' ? 'drop an action to add one' : slot.kind === 'action' ? 'drop an action' : 'drop data') }), clear]);
      box.appendChild(el);
    });
  }

  function setupFrameDrop() {
    const frame = $('ed-frame');
    const wrap = h('div', { class: 'ed-frame-wrap' });
    frame.parentNode.insertBefore(wrap, frame);
    wrap.appendChild(frame);
    const cover = h('div', {
      class: 'ed-dropcover', title: 'Drop a shape here',
      ondragover: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; cover.classList.add('over'); },
      ondragleave: () => cover.classList.remove('over'),
      ondrop: (e) => {
        e.preventDefault();
        cover.classList.remove('over');
        const d = readDrop(e);
        if (d && d.kind === 'shape' && d.name !== state.def.shape) state.changeShape(d.name);
        else if (d && d.kind === 'data') { const first = slotsFor(shapeInfo()).find((s) => s.kind === 'field' && !getAt(state.def, s.path)); if (first) dropOnSlot(first, d); else toast('Drop it on one of the slots below', 'err'); }
        else if (d && d.kind === 'action') applyAction(null, d);
        endDrag();
      }
    }, [h('span', { text: 'Drop here' })]);
    wrap.appendChild(cover);
  }

  function renderAll() {
    if (!catalog) return;
    renderShapes();
    renderPaletteActions();
    renderSlots();
    renderSource();
    renderShow();
    renderActions();
    renderMeta();
    renderJson(true);
    schedulePreview();
  }

  function renderJson(force) {
    const ta = $('ed-json');
    if (force || document.activeElement !== ta) ta.value = JSON.stringify(state.def, null, 2);
  }

  class Preview {
    constructor(frame) {
      this.frame = frame;
      this.timer = null;
      this.ready = false;
      this.last = null;
      this.seq = 0;
      window.addEventListener('message', (e) => {
        if (e.origin === location.origin && e.data && e.data.type === 'shape-preview-ready') { this.ready = true; if (this.last) this.post(this.last); }
      });
    }
    schedule() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.run(), PREVIEW_DELAY);
    }
    run() {
      const r = compute();
      const box = $('ed-problems');
      box.innerHTML = r.problems.length ? r.problems.map((p) => '<li>' + esc(p) + '</li>').join('') : '';
      $('ed-state').textContent = r.problems.length ? r.problems.length + (r.problems.length === 1 ? ' PROBLEM' : ' PROBLEMS') : 'READY';
      $('ed-state').className = 'pill ' + (r.problems.length ? 'warn' : 'ok');
      finish.update(r.problems);
      saveDraft();
      if (r.view) this.post(r.view);
    }
    post(view) {
      this.last = view;
      const size = state.def.size || {};
      const w = size.w || 2, hh = size.h || 1;
      const room = this.frame.clientWidth - 16;
      const cellW = Math.min(CELL_W, (room - (w - 1) * GAP) / w);
      const width = Math.round(w * cellW + (w - 1) * GAP);
      const height = Math.round(hh * CELL_H + (hh - 1) * GAP);
      this.frame.style.height = (height + 16) + 'px';
      if (!this.ready) return;
      const theme = $('ed-theme') ? $('ed-theme').value : 'classic';
      this.frame.contentWindow.postMessage({ type: 'shape-preview', view: view, w: width, h: height, theme: theme }, location.origin);
    }
  }

  function compute() {
    const def = state.def;
    const problems = [];
    if (typeof def.name !== 'string' || !def.name.trim()) problems.push('"name" mancante: dagli un nome (passo 5)');
    const shape = core.shapes.shapes.get(def.shape);
    if (!shape) return { problems: problems.concat(['forma sconosciuta "' + def.shape + '"']), view: null };
    const src = def.source && typeof def.source === 'object' ? def.source : { type: 'static' };
    const info = catalog.sources.find((x) => x.type === src.type);
    if (!info) problems.push('fonte sconosciuta "' + src.type + '"');
    if (src.type === 'http' && !/^https?:\/\/[^\s/]+/.test(src.url || '')) problems.push('scrivi l\'indirizzo da leggere (https://…)');
    if (src.type === 'command' && !src.id) problems.push('scegli il comando');
    if (src.type === 'file' && !src.path) problems.push('scrivi il file da leggere (dentro data/)');
    problems.push.apply(problems, shape.validate(def));
    let view = null;
    try {
      view = Object.assign(shape.view(Object.assign({}, def, { id: state.id || 'anteprima', source: src }), dataFor(src)), { every: Math.max(info ? info.minEvery : 1, parseInt(def.every, 10) || 5) });
    } catch (e) {
      view = { shape: def.shape, label: def.name || '', icon: def.icon || '', error: e.message };
    }
    return { problems: problems, view: view };
  }

  let preview = null;
  function schedulePreview() { if (preview) preview.schedule(); }

  function saveDraft() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state.def)); } catch (e) { } }

  function hostOf(url) { try { return new URL(url).host; } catch (e) { return ''; } }

  function marketWarnings(def) {
    const out = [];
    const src = def.source || {};
    if (src.type === 'file' || src.type === 'command') out.push('It reads a file or a command of your PC: other people don\'t have it.');
    const acts = [];
    if (def.tap) acts.push(def.tap);
    if (def.set) acts.push(def.set);
    (def.buttons || []).forEach((b) => b && b.action && acts.push(b.action));
    ((def.voice || {}).commands || []).forEach((c) => c && c.action && acts.push(c.action));
    if (acts.some((a) => a.type === 'command')) out.push('A tap runs a command of your PC: commands can\'t go in the market.');
    if (acts.some((a) => a.type === 'launch' || a.type === 'focus')) out.push('A tap opens one of your apps: it works only for people with the same app.');
    if (acts.some((a) => a.type === 'open_path')) out.push('A tap opens a file or folder of your PC.');
    const text = JSON.stringify(def);
    if (/[A-Za-z]:\\\\Users\\\\|\/home\/[a-z]/.test(text)) out.push('It contains a path of your PC: remove it before sharing.');
    if (/(api[_-]?key|token|password|secret)=/i.test(text)) out.push('The address seems to contain a key or a password: never share it.');
    return out;
  }

  class Finish {
    constructor() {
      this.problems = [];
      $('fin-author').value = (function () { try { return localStorage.getItem(AUTHOR_KEY) || ''; } catch (e) { return ''; } })();
      $('fin-author').addEventListener('input', () => { try { localStorage.setItem(AUTHOR_KEY, $('fin-author').value.trim()); } catch (e) { } this.update(this.problems); });
      $('fin-local').addEventListener('click', () => this.local());
      $('fin-market').addEventListener('click', () => this.market());
    }
    update(problems) {
      this.problems = problems;
      const ok = !problems.length && !!state.id;
      $('fin-local').disabled = !ok;
      $('fin-market').disabled = !ok || !$('fin-author').value.trim();
      const warn = ok ? marketWarnings(state.def) : [];
      $('fin-warn').innerHTML = warn.map((t) => '<p class="warn-box">' + esc(t) + '</p>').join('');
      $('fin-hint').textContent = !ok ? 'Fix the problems shown next to the preview first.' : !$('fin-author').value.trim() ? 'Write your name (or nickname) to propose it to the market: it is shown as the author.' : '';
    }
    def() {
      const author = $('fin-author').value.trim();
      return Object.assign({}, state.def, author ? { author: author } : {});
    }
    local() {
      const link = window.Site.panelLink('widget=' + window.Site.encode({ id: state.id, def: this.def() }));
      window.open(link, '_blank', 'noopener');
      toast('Opening your control panel: confirm there to add the widget', 'ok');
    }
    market() {
      const def = this.def();
      const q = new URLSearchParams({
        template: 'widget.yml', title: 'Widget: ' + (def.name || state.id), name: def.name || state.id,
        author: def.author || '', description: def.description || '', widget: JSON.stringify(def, null, 2)
      });
      window.open(REPO + '/issues/new?' + q.toString(), '_blank', 'noopener');
    }
  }

  let finish = null;

  function applyJson() {
    try {
      const def = JSON.parse($('ed-json').value);
      if (!def || typeof def !== 'object' || Array.isArray(def)) throw new Error('a JSON object is needed');
      state.load(def, slug(def.name));
      toast('JSON applied', 'ok');
    } catch (e) {
      toast('Invalid JSON: ' + e.message, 'err');
    }
  }

  function fromHash() {
    const m = /(?:^#|&)w=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!m) return null;
    const w = window.Site.decode(m[1]);
    return w && w.def && typeof w.def === 'object' && !Array.isArray(w.def) ? w : null;
  }

  async function start() {
    try {
      const res = await fetch('data/catalog.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      catalog = await res.json();
    } catch (e) { $('ed-shapes').innerHTML = '<p class="small">The editor could not load (' + esc(e.message) + ').</p>'; return; }
    setupFrameDrop();
    preview = new Preview($('ed-frame'));
    $('ed-action-search').addEventListener('input', (e) => { paletteFilter = e.target.value; renderPaletteActions(); });
    finish = new Finish();
    $('ed-frame').src = 'preview/index.html';
    state.on((kind) => {
      if (kind === 'structure') renderAll();
      else { renderJson(false); renderSlots(); $('ed-id').textContent = state.id ? 'miei/' + state.id : ''; schedulePreview(); }
    });
    $('ed-new').addEventListener('click', () => { if (!window.confirm('Start a new widget? The current one is lost.')) return; state.reset(); renderAll(); });
    $('ed-json-apply').addEventListener('click', applyJson);
    $('ed-theme').addEventListener('change', () => { if (preview && preview.last) preview.post(preview.last); });
    const shared = fromHash();
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { draft = null; }
    window.addEventListener('hashchange', () => {
      const w = fromHash();
      if (!w) return;
      state.load(w.def, w.id);
      history.replaceState(null, '', location.pathname);
    });
    if (shared) { state.load(shared.def, shared.id); history.replaceState(null, '', location.pathname); }
    else if (draft && typeof draft === 'object' && draft.shape) state.load(draft, slug(draft.name));
    else renderAll();
  }

  window.WidgetEditor = { state: state, compute: () => compute() };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
