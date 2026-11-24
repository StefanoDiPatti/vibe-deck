(function () {
  'use strict';
  const { esc, icon, api, toast } = window.Panel;
  const $ = (id) => document.getElementById(id);

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
      this.editing = false;
      this.allowHost = false;
      this.fields = [];
      this.focus = null;
    }
    on(fn) { this.listeners.push(fn); }
    emit(kind) { this.listeners.forEach((fn) => fn(kind)); }
    set(path, value, kind) {
      setAt(this.def, path, value);
      if (path === 'name' && !this.editing) this.id = slug(value);
      this.emit(kind || 'value');
    }
    load(def, plugin, id) {
      this.def = JSON.parse(JSON.stringify(def));
      this.plugin = plugin;
      this.id = id;
      this.editing = true;
      this.fields = [];
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
      const input = trackFocus(h('input', { type: 'text', list: 'ed-icons', placeholder: 'es. sun, cpu', value: value || '', oninput: (e) => { set(e.target.value || undefined); swatch.innerHTML = icon(e.target.value); } }));
      const swatch = h('span', { class: 'ed-swatch', html: icon(value) });
      return h('span', { class: 'ed-icon' }, [input, swatch]);
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
        type: 'button', class: 'ed-shape' + (s.name === state.def.shape ? ' on' : ''), 'data-shape': s.name,
        onclick: () => { if (s.name !== state.def.shape) state.changeShape(s.name); }
      }, [h('b', { text: s.label }), h('span', { text: s.description })]));
    });
  }

  function sourcesFor() {
    return catalog.sources.filter((s) => !s.plugin || s.plugin === state.plugin);
  }

  function chipsFor(fields, prefix) {
    return fields.map((f) => {
      const insert = f.hint || '{{' + (prefix || '') + f.path + '}}';
      const chip = h('button', {
        type: 'button', class: 'ed-chip', title: insert,
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
    if (src.type === 'http') {
      box.appendChild(h('label', { class: 'ed-field check' }, [
        h('input', { type: 'checkbox', checked: state.allowHost, onchange: (e) => { state.allowHost = e.target.checked; schedulePreview(); } }),
        h('span', { text: 'Consenti a questo widget di leggere il sito dell\'indirizzo (lo aggiungo ai permessi del plugin)' })
      ]));
    }
    const known = info && info.fields && info.fields.length ? info.fields : state.fields;
    const tools = h('div', { class: 'ed-fields-head' }, [
      h('span', { class: 'ed-label', text: known.length ? 'Dati disponibili: tocca un campo di testo, poi un dato' : 'Dati disponibili' }),
      info && info.sample ? h('button', { type: 'button', class: 'btn ghost small-btn', 'data-ed': 'sample', text: 'Prova la fonte', onclick: sample }) : null
    ]);
    box.appendChild(tools);
    box.appendChild(h('div', { class: 'ed-chips', id: 'ed-fields' }, known.length ? chipsFor(known) : [h('span', { class: 'ed-help', text: info && info.sample ? 'Premi "Prova la fonte" per vedere quali dati arrivano.' : 'Nessun dato.' })]));
  }

  async function sample() {
    const btn = document.querySelector('[data-ed="sample"]');
    if (btn) btn.disabled = true;
    try {
      const src = state.def.source;
      const r = await api('POST', '/api/control/shapes/sample', { plugin: state.plugin, source: src, allowHost: state.allowHost });
      state.fields = r.fields;
      $('ed-sample').textContent = r.preview;
      renderSource();
      toast(r.fields.length + ' dati trovati', 'ok');
    } catch (e) {
      toast(e.message, 'err');
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
      h('label', { class: 'ed-field' }, [h('span', { class: 'ed-label', text: 'Altezza (celle)' }), sel('h', 6)]),
      h('label', { class: 'ed-field' }, [h('span', { class: 'ed-label', text: 'Plugin dove salvarlo' }),
        h('input', { type: 'text', value: state.plugin, 'data-ed': 'plugin', disabled: state.editing, oninput: (e) => { state.plugin = e.target.value.trim(); schedulePreview(); } })])
    ]));
    $('ed-id').textContent = state.id ? state.plugin + '/' + state.id : '';
    $('ed-title').textContent = state.editing ? 'Modifica: ' + (state.def.name || state.id) : 'Nuovo widget';
  }

  function renderAll() {
    if (!catalog) return;
    renderShapes();
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
    async run() {
      const seq = ++this.seq;
      let r;
      try {
        r = await api('POST', '/api/control/shapes/preview', { plugin: state.plugin || DEFAULT_PLUGIN, def: state.def, id: state.id || 'anteprima', allowHost: state.allowHost });
      } catch (e) {
        r = { problems: [e.message], view: null };
      }
      if (seq !== this.seq) return;
      const box = $('ed-problems');
      box.innerHTML = r.problems.length ? r.problems.map((p) => '<li>' + esc(p) + '</li>').join('') : '';
      $('ed-state').textContent = r.problems.length ? r.problems.length + (r.problems.length === 1 ? ' PROBLEMA' : ' PROBLEMI') : 'PRONTO';
      $('ed-state').className = 'pill ' + (r.problems.length ? 'warn' : 'ok');
      $('ed-save').disabled = !!r.problems.length || !state.id;
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
      const theme = window.DockTheme ? window.DockTheme.get() : 'classic';
      this.frame.contentWindow.postMessage({ type: 'shape-preview', view: view, w: width, h: height, theme: theme }, location.origin);
    }
  }

  let preview = null;
  function schedulePreview() { if (preview) preview.schedule(); }

  async function save() {
    try {
      const r = await api('POST', '/api/control/widgets', { plugin: state.plugin || DEFAULT_PLUGIN, id: state.id, def: state.def, allowHost: state.allowHost, overwrite: state.editing });
      toast((r.created ? 'Widget creato: ' : 'Widget aggiornato: ') + (state.def.name || r.id) + '. Lo trovi in "Aggiungi un widget" della HOME', 'ok');
      state.plugin = r.plugin;
      state.editing = true;
      await loadMine();
      window.Panel.refresh();
      renderMeta();
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  function propose(w) {
    const json = JSON.stringify({ plugin: w.plugin, id: w.id, def: w.def });
    const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const site = window.Market ? window.Market.site() : 'https://stefanodipatti.github.io/vibe-deck/';
    window.open(site + 'submit.html#w=' + b64, '_blank', 'noopener');
  }

  async function loadMine() {
    let list = [];
    try { list = await api('GET', '/api/control/widgets'); } catch (e) { list = []; }
    const box = $('ed-mine');
    box.innerHTML = list.length ? '' : '<p class="hint small">Nessun widget creato finora.</p>';
    list.forEach((w) => {
      const def = w.def || {};
      box.appendChild(h('div', { class: 'ed-mine-row', 'data-key': w.key }, [
        h('span', { class: 'ed-mine-ico', html: icon(def.icon || (def.show && def.show.icon && def.show.icon.indexOf('{{') < 0 ? def.show.icon : '') || 'apps') }),
        h('span', { class: 'txt' }, [h('span', { class: 'name', text: def.name || w.id }),
          h('span', { class: 'desc' + (w.problems.length ? ' err' : ''), text: w.problems.length ? w.problems[0] : w.key })]),
        h('button', { class: 'btn ghost small-btn', type: 'button', 'data-act': 'propose', text: 'Proponi al market', title: 'Apre la pagina del market con questo widget: decidi tu se proporlo o tenerlo solo per te', onclick: () => propose(w) }),
        h('button', { class: 'btn ghost small-btn', type: 'button', 'data-act': 'edit', text: 'Modifica', onclick: () => { state.load(def, w.plugin, w.id); window.scrollTo({ top: $('editor-card').offsetTop - 10, behavior: 'smooth' }); } }),
        h('button', {
          class: 'ibtn rm', type: 'button', title: 'Elimina', html: icon('trash'),
          onclick: async () => {
            if (!window.confirm('Eliminare il widget "' + (def.name || w.id) + '"? Se è nella HOME, sparisce anche da lì.')) return;
            try { await api('DELETE', '/api/control/widgets/' + encodeURIComponent(w.plugin) + '/' + encodeURIComponent(w.id)); toast('Widget eliminato', 'ok'); await loadMine(); window.Panel.refresh(); } catch (e) { toast(e.message, 'err'); }
          }
        })
      ]));
    });
  }

  function applyJson() {
    try {
      const def = JSON.parse($('ed-json').value);
      if (!def || typeof def !== 'object' || Array.isArray(def)) throw new Error('Serve un oggetto JSON');
      state.def = def;
      if (!state.editing) state.id = slug(def.name);
      state.emit('structure');
      toast('JSON applicato', 'ok');
    } catch (e) {
      toast('JSON non valido: ' + e.message, 'err');
    }
  }

  async function start() {
    const card = $('editor-card');
    if (!card) return;
    try { catalog = await api('GET', '/api/control/catalog'); } catch (e) { $('ed-shapes').innerHTML = '<p class="hint err">' + esc(e.message) + '</p>'; return; }
    $('ed-icons').innerHTML = catalog.icons.map((i) => '<option value="' + esc(i.name) + '">' + (i.picture ? 'illustrazione' : 'icona') + '</option>').join('');
    preview = new Preview($('ed-frame'));
    $('ed-frame').src = '/shape-preview.html';
    state.on((kind) => {
      if (kind === 'structure') renderAll();
      else { renderJson(false); $('ed-id').textContent = state.id ? state.plugin + '/' + state.id : ''; schedulePreview(); }
    });
    $('ed-save').addEventListener('click', save);
    $('ed-new').addEventListener('click', () => { state.reset(); renderAll(); });
    $('ed-json-apply').addEventListener('click', applyJson);
    window.addEventListener('storage', schedulePreview);
    const pick = $('theme-pick');
    if (pick) pick.addEventListener('click', () => setTimeout(() => preview && preview.last && preview.post(preview.last), 50));
    renderAll();
    loadMine();
  }

  window.WidgetEditor = { state: state, reload: start };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
