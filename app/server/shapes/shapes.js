const Registry = require('./registry');
const template = require('./template');

const shapes = new Registry('shape');
const MAX_ITEMS = 12;
const MAX_COMMANDS = 50;

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

class Shape {
  constructor(name) { this.name = name; }

  validate(def) {
    const problems = [];
    if (def.show !== undefined && !isObject(def.show)) problems.push('"show" deve essere un oggetto');
    templatesIn(def.show || {}, []).forEach(function (t) { problems.push.apply(problems, template.check(t)); });
    if (def.tap !== undefined) problems.push.apply(problems, actionProblems(def.tap, '"tap"'));
    return problems.concat(this.check(def));
  }

  check() { return []; }

  view(def, data) {
    const v = new template.View(data);
    const show = def.show || {};
    return Object.assign({
      shape: this.name,
      label: v.text(show.label !== undefined ? show.label : def.name),
      icon: def.icon || '',
      tappable: !!def.tap
    }, this.fields(def, v, show));
  }

  fields() { return {}; }

  action(def) { return def.tap || null; }
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
    return { on: on, text: v.text(words !== undefined ? words : show.text), sub: v.text(show.sub) };
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

[new ValueShape(), new BarsShape(), new StatusShape(), new TextShape(), new ButtonsShape(), new VoiceShape()]
  .forEach(function (s) { shapes.register(s.name, s); });

module.exports = { shapes: shapes, Shape: Shape, level: level, normalize: normalize };
