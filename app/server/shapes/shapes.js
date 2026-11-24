const Registry = require('./registry');
const template = require('./template');

const shapes = new Registry('shape');
const MAX_ITEMS = 12;
const MAX_COMMANDS = 50;
const LEVELS = ['ok', 'warn', 'hot'];

function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

function level(n, warn, hot) {
  if (n === null || n === undefined) return '';
  if (typeof hot === 'number' && n >= hot) return 'hot';
  if (typeof warn === 'number' && n >= warn) return 'warn';
  return 'ok';
}

function percent(n) { return n === null ? null : Math.max(0, Math.min(100, n)); }

function templatesIn(obj, out) {
  if (typeof obj === 'string') out.push(obj);
  else if (Array.isArray(obj)) obj.forEach(function (x) { templatesIn(x, out); });
  else if (isObject(obj)) Object.keys(obj).forEach(function (k) { templatesIn(obj[k], out); });
  return out;
}

function actionProblems(action, where) {
  if (!isObject(action) || typeof action.type !== 'string') return [where + ': azione senza "type"'];
  return [];
}

const LABEL = { name: 'label', label: 'Titolo', type: 'template' };
const ICON = { name: 'icon', label: 'Icona o illustrazione', type: 'icon', help: 'Fissa (es. sun) o dai dati: {{codice|map:icone}}' };
const SUB = { name: 'sub', label: 'Sottotitolo', type: 'template' };
const WARN = { name: 'warn', label: 'Giallo da', type: 'number' };
const HOT = { name: 'hot', label: 'Rosso da', type: 'number' };

const SHAPE_INFO = {
  value: {
    label: 'Numero grande',
    description: 'Un valore in grande con unità, sottotitolo e una barra colorata (es. CPU, temperatura, follower)',
    show: [LABEL, ICON, { name: 'value', label: 'Valore', type: 'template', required: true }, { name: 'unit', label: 'Unità', type: 'template' }, SUB,
      { name: 'bar', label: 'Barra (0-100)', type: 'template' }, WARN, HOT],
    actions: [{ name: 'tap', label: 'Al tocco' }]
  },
  bars: {
    label: 'Barre',
    description: 'Più righe "nome, barra, valore" (es. CPU, GPU e RAM insieme)',
    show: [LABEL, { name: 'rows', label: 'Righe', type: 'rows', required: true, item: [{ name: 'label', label: 'Nome', type: 'template' }, { name: 'value', label: 'Valore', type: 'template' }, { name: 'bar', label: 'Barra (0-100)', type: 'template' }, WARN, HOT] }],
    actions: [{ name: 'tap', label: 'Al tocco' }]
  },
  status: {
    label: 'Acceso / spento',
    description: 'Un pallino verde o grigio con un testo (es. app aperta, server raggiungibile, in diretta)',
    show: [LABEL, ICON, { name: 'on', label: 'Acceso quando', type: 'template', required: true }, { name: 'onText', label: 'Testo se acceso', type: 'template' },
      { name: 'offText', label: 'Testo se spento', type: 'template' }, SUB,
      { name: 'level', label: 'Colore (ok, warn, hot)', type: 'template', help: 'Es. {{stato|map:colori}}: verde, arancione o rosso' }],
    actions: [{ name: 'tap', label: 'Al tocco' }]
  },
  text: {
    label: 'Testo',
    description: 'Un testo che si aggiorna da solo (es. da quanto è acceso il PC, una nota)',
    show: [LABEL, ICON, { name: 'text', label: 'Testo', type: 'template', required: true }, SUB],
    actions: [{ name: 'tap', label: 'Al tocco' }]
  },
  buttons: {
    label: 'Pulsanti',
    description: 'Una griglia fino a 12 pulsanti, ognuno con la sua azione',
    show: [LABEL],
    actions: [{ name: 'buttons', label: 'Pulsanti', list: true, item: [{ name: 'label', label: 'Scritta', type: 'template', required: true }, { name: 'icon', label: 'Icona', type: 'icon' }, { name: 'color', label: 'Colore', type: 'text' }] }]
  },
  voice: {
    label: 'Comandi vocali',
    description: 'Microfono e testo: frasi collegate ad azioni, e un\'azione per tutto il resto con {{text}}',
    show: [LABEL],
    actions: [{ name: 'voice.commands', label: 'Comandi', list: true, item: [{ name: 'say', label: 'Frasi da dire', type: 'phrases', required: true }, { name: 'reply', label: 'Risposta', type: 'text' }] },
      { name: 'voice.action', label: 'Per tutto il resto ({{text}} = quello che hai detto)' }]
  },
  list: {
    label: 'Lista',
    description: 'Righe prese da una lista nei dati (es. previsioni, dischi, notizie); scorre, ogni riga si può toccare',
    show: [LABEL, { name: 'items', label: 'Lista', type: 'template', required: true, help: 'Es. {{risultati}}, oppure {{daily|zip}} per colonne parallele' },
      { name: 'item', label: 'Ogni riga', type: 'row', required: true, item: [{ name: 'icon', label: 'Icona', type: 'icon' }, { name: 'title', label: 'Titolo', type: 'template' },
        { name: 'sub', label: 'Sottotitolo', type: 'template' }, { name: 'right', label: 'A destra', type: 'template' }, { name: 'bar', label: 'Barra (0-100)', type: 'template' }, WARN, HOT] },
      { name: 'max', label: 'Righe al massimo', type: 'number', min: 1, max: 50, default: 20 }, { name: 'empty', label: 'Testo se vuota', type: 'text' }],
    actions: [{ name: 'tap', label: 'Al tocco di una riga ({{item.campo}})' }]
  },
  slider: {
    label: 'Cursore',
    description: 'Un valore da trascinare (es. volume): il PC riceve il numero scelto',
    show: [LABEL, ICON, { name: 'value', label: 'Valore attuale', type: 'template', required: true }, { name: 'min', label: 'Minimo', type: 'number', required: true },
      { name: 'max', label: 'Massimo', type: 'number', required: true }, { name: 'step', label: 'Passo', type: 'number', default: 1 }, { name: 'unit', label: 'Unità', type: 'template' }, SUB],
    actions: [{ name: 'set', label: 'Quando cambia ({{value}} = valore scelto)', required: true }]
  }
};

class Shape {
  constructor(name) { this.name = name; }

  describe() {
    const i = SHAPE_INFO[this.name] || {};
    return { name: this.name, label: i.label || this.name, description: i.description || '', show: i.show || [], actions: i.actions || [] };
  }

  validate(def) {
    const problems = [];
    if (def.show !== undefined && !isObject(def.show)) problems.push('"show" deve essere un oggetto');
    if (def.maps !== undefined && (!isObject(def.maps) || Object.keys(def.maps).some(function (k) { return !isObject(def.maps[k]); }))) {
      problems.push('"maps" deve essere un oggetto di tabelle, es. { "meteo": { "0": "Sereno" } }');
    }
    templatesIn(def.show || {}, []).forEach(function (t) { problems.push.apply(problems, template.check(t)); });
    if (def.tap !== undefined) problems.push.apply(problems, actionProblems(def.tap, '"tap"'));
    return problems.concat(this.check(def));
  }

  check() { return []; }

  view(def, data) {
    const v = new template.View(data, { maps: def.maps || {} });
    const show = def.show || {};
    return Object.assign({
      shape: this.name,
      label: v.text(show.label !== undefined ? show.label : def.name),
      icon: def.icon || '',
      glyph: v.text(show.icon),
      tappable: !!def.tap
    }, this.fields(def, v, show));
  }

  fields() { return {}; }

  action(def) { return def.tap || null; }

  scope(def, data) { return data; }
}

const MAX_ROWS = 50;

class ListShape extends Shape {
  constructor() { super('list'); }
  check(def) {
    const show = def.show || {};
    const problems = [];
    if (typeof show.items !== 'string') problems.push('"show.items" deve indicare la lista, es. "{{elenco}}"');
    if (!isObject(show.item)) problems.push('"show.item" deve dire cosa mostrare per ogni riga: { "title", "sub", "right", "bar" }');
    if (show.max !== undefined && !(show.max >= 1 && show.max <= MAX_ROWS)) problems.push('"show.max" deve essere tra 1 e ' + MAX_ROWS);
    return problems;
  }
  rows(def, v) {
    const show = def.show || {};
    const list = v.value(show.items);
    return Array.isArray(list) ? list.slice(0, show.max || 20) : [];
  }
  fields(def, v, show) {
    const item = show.item;
    const self = this;
    return {
      tappable: false,
      rowTap: !!def.tap,
      empty: v.text(show.empty !== undefined ? show.empty : 'Niente da mostrare'),
      items: this.rows(def, v).map(function (row, index) {
        const r = v.child(self.rowScope(v.data, row, index));
        const bar = item.bar !== undefined ? percent(r.number(item.bar)) : null;
        return {
          icon: r.text(item.icon),
          title: r.text(item.title),
          sub: r.text(item.sub),
          right: r.text(item.right),
          bar: bar,
          level: level(bar !== null ? bar : r.number(item.level), item.warn, item.hot)
        };
      })
    };
  }
  rowScope(data, row, index) { return { item: row, index: index, root: data }; }
  scope(def, data, index) {
    const list = this.rows(def, new template.View(data, { maps: def.maps || {} }));
    return this.rowScope(data, list[index], index);
  }
}

class SliderShape extends Shape {
  constructor() { super('slider'); }
  check(def) {
    const show = def.show || {};
    const problems = [];
    if (show.value === undefined) problems.push('"show.value" mancante');
    if (typeof show.min !== 'number' || typeof show.max !== 'number' || show.min >= show.max) problems.push('"show.min" e "show.max" devono essere numeri, min < max');
    if (show.step !== undefined && !(show.step > 0)) problems.push('"show.step" deve essere maggiore di 0');
    problems.push.apply(problems, actionProblems(def.set, '"set"'));
    return problems;
  }
  fields(def, v, show) {
    return {
      tappable: false,
      value: v.number(show.value),
      min: show.min,
      max: show.max,
      step: show.step || 1,
      unit: v.text(show.unit),
      sub: v.text(show.sub)
    };
  }
  action(def) { return def.set || null; }
  clamp(def, raw) {
    const show = def.show;
    const step = show.step || 1;
    const n = Number(raw);
    if (isNaN(n)) return null;
    const snapped = Math.round((n - show.min) / step) * step + show.min;
    return Math.max(show.min, Math.min(show.max, Math.round(snapped * 1000) / 1000));
  }
  scope(def, data, value) { return Object.assign({}, data, { value: value }); }
}

class ValueShape extends Shape {
  constructor() { super('value'); }
  fields(def, v, show) {
    const bar = show.bar !== undefined ? percent(v.number(show.bar)) : null;
    const measured = show.level !== undefined ? v.number(show.level) : bar !== null ? bar : v.number(show.value);
    return {
      value: v.text(show.value),
      unit: v.text(show.unit),
      sub: v.text(show.sub),
      bar: bar,
      level: level(measured, show.warn, show.hot)
    };
  }
}

class BarsShape extends Shape {
  constructor() { super('bars'); }
  check(def) {
    const rows = (def.show || {}).rows;
    if (!Array.isArray(rows) || !rows.length) return ['"show.rows" deve essere una lista di righe'];
    if (rows.length > MAX_ITEMS) return ['al massimo ' + MAX_ITEMS + ' righe'];
    return rows.some(function (r) { return !isObject(r); }) ? ['ogni riga di "show.rows" deve essere un oggetto'] : [];
  }
  fields(def, v, show) {
    return {
      rows: show.rows.map(function (r) {
        const bar = r.bar !== undefined ? percent(v.number(r.bar)) : null;
        return { label: v.text(r.label), value: v.text(r.value), bar: bar, level: level(bar !== null ? bar : v.number(r.value), r.warn, r.hot) };
      })
    };
  }
}

class StatusShape extends Shape {
  constructor() { super('status'); }
  check(def) { return (def.show || {}).on === undefined ? ['"show.on" serve per sapere se è acceso'] : []; }
  fields(def, v, show) {
    const on = !!v.value(show.on);
    const words = on ? show.onText : show.offText;
    const lvl = show.level !== undefined ? v.text(show.level) : '';
    return { on: on, text: v.text(words !== undefined ? words : show.text), sub: v.text(show.sub), level: LEVELS.indexOf(lvl) >= 0 ? lvl : '' };
  }
}

class TextShape extends Shape {
  constructor() { super('text'); }
  check(def) { return (def.show || {}).text === undefined ? ['"show.text" mancante'] : []; }
  fields(def, v, show) { return { text: v.text(show.text), sub: v.text(show.sub) }; }
}

class ButtonsShape extends Shape {
  constructor() { super('buttons'); }
  check(def) {
    const list = def.buttons;
    if (!Array.isArray(list) || !list.length) return ['"buttons" deve essere una lista di pulsanti'];
    if (list.length > MAX_ITEMS) return ['al massimo ' + MAX_ITEMS + ' pulsanti'];
    const problems = [];
    list.forEach(function (b, i) {
      if (!isObject(b)) { problems.push('pulsante ' + (i + 1) + ' non valido'); return; }
      problems.push.apply(problems, actionProblems(b.action, 'pulsante ' + (i + 1)));
    });
    return problems;
  }
  fields(def, v) {
    return {
      tappable: false,
      buttons: def.buttons.map(function (b) { return { label: v.text(b.label), icon: b.icon || '', sub: v.text(b.sub), color: b.color || '' }; })
    };
  }
  action(def, index) {
    const b = def.buttons[index];
    return b ? b.action : null;
  }
}

function normalize(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

class VoiceShape extends Shape {
  constructor() { super('voice'); }
  check(def) {
    const voice = def.voice;
    if (!isObject(voice)) return ['"voice" mancante'];
    const problems = [];
    const commands = voice.commands === undefined ? [] : voice.commands;
    if (!Array.isArray(commands)) return ['"voice.commands" deve essere una lista'];
    if (commands.length > MAX_COMMANDS) problems.push('al massimo ' + MAX_COMMANDS + ' comandi vocali');
    commands.forEach(function (c, i) {
      const where = 'comando vocale ' + (i + 1);
      if (!isObject(c) || !Array.isArray(c.say) || !c.say.length || c.say.some(function (s) { return !normalize(s); })) problems.push(where + ': "say" deve elencare almeno una frase');
      else problems.push.apply(problems, actionProblems(c.action, where));
    });
    if (voice.action !== undefined) problems.push.apply(problems, actionProblems(voice.action, '"voice.action"'));
    if (!commands.length && voice.action === undefined) problems.push('servono "voice.commands" o "voice.action"');
    return problems;
  }
  fields(def, v) {
    const voice = def.voice;
    const commands = voice.commands || [];
    return {
      tappable: false,
      placeholder: v.text(voice.placeholder || (commands.length ? 'Di\' un comando…' : 'Scrivi o detta…')),
      hints: commands.slice(0, 6).map(function (c) { return String(c.say[0]); })
    };
  }
  action() { return null; }
  resolve(def, said) {
    const heard = normalize(said);
    if (!heard) return null;
    let best = null;
    (def.voice.commands || []).forEach(function (c) {
      c.say.forEach(function (phrase) {
        const p = normalize(phrase);
        const hit = (' ' + heard + ' ').indexOf(' ' + p + ' ') >= 0;
        if (hit && (!best || p.length > best.length)) best = { length: p.length, command: c };
      });
    });
    if (best) return { action: best.command.action, reply: best.command.reply || '' };
    if (def.voice.action) return { action: template.deep(def.voice.action, { text: String(said).trim() }), reply: def.voice.reply || '' };
    return null;
  }
}

[new ValueShape(), new BarsShape(), new StatusShape(), new TextShape(), new ButtonsShape(), new VoiceShape(), new ListShape(), new SliderShape()]
  .forEach(function (s) { shapes.register(s.name, s); });

module.exports = { shapes: shapes, Shape: Shape, level: level, normalize: normalize };
