const Registry = require('../shapes/registry');

const triggers = new Registry('trigger');

const OPS = [
  { value: 'gt', label: 'maggiore di' },
  { value: 'lt', label: 'minore di' },
  { value: 'eq', label: 'uguale a' },
  { value: 'ne', label: 'diverso da' },
  { value: 'has', label: 'contiene' }
];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const NAME_RE = /^[a-z0-9_-]{1,40}$/;

class Trigger {
  constructor(type, info) {
    this.type = type;
    this.info = info;
  }

  describe() {
    return { type: this.type, kind: this.kind, label: this.info.label, description: this.info.description, params: this.info.params || [] };
  }

  validate() { return []; }
}

class StateTrigger extends Trigger {
  get kind() { return 'state'; }
  get needs() { return this.info.needs || []; }
  test() { return false; }
}

class EventTrigger extends Trigger {
  get kind() { return 'event'; }
  matches() { return false; }
}

function compare(op, actual, wanted) {
  if (actual === undefined || actual === null) return false;
  if (op === 'has') return String(actual).toLowerCase().indexOf(String(wanted).toLowerCase()) >= 0;
  const a = Number(actual), w = Number(wanted);
  const numeric = isFinite(a) && isFinite(w) && String(actual).trim() !== '' && String(wanted).trim() !== '';
  if (op === 'gt') return numeric && a > w;
  if (op === 'lt') return numeric && a < w;
  const same = numeric ? a === w : String(actual) === String(wanted);
  return op === 'eq' ? same : !same;
}

function dig(obj, pathText) {
  return String(pathText || '').split('.').filter(Boolean).reduce(function (o, k) { return o && typeof o === 'object' ? o[k] : undefined; }, obj);
}

class MusicPlaying extends StateTrigger {
  constructor() { super('music_playing', { label: 'La musica parte', description: 'Quando un brano va in riproduzione', needs: ['media'] }); }
  test(p, snap) { return !!(snap.media && snap.media.active && String(snap.media.status || '').toLowerCase() === 'playing'); }
}

class AppOpen extends StateTrigger {
  constructor() { super('app_open', { label: 'Si apre un\'app', description: 'Quando un\'app tra quelle controllate dalla dock si apre', needs: ['apps'], params: [{ name: 'app', label: 'App', type: 'app', required: true }] }); }
  validate(p) { return p.app ? [] : ['scegli un\'app']; }
  test(p, snap) { return !!(snap.apps && snap.apps[p.app]); }
}

class AppClosed extends StateTrigger {
  constructor() { super('app_closed', { label: 'Si chiude un\'app', description: 'Quando un\'app tra quelle controllate dalla dock si chiude', needs: ['apps'], params: [{ name: 'app', label: 'App', type: 'app', required: true }] }); }
  validate(p) { return p.app ? [] : ['scegli un\'app']; }
  test(p, snap) { return !!snap.apps && p.app in snap.apps && !snap.apps[p.app]; }
}

class CpuAbove extends StateTrigger {
  constructor() { super('cpu_above', { label: 'La CPU supera una soglia', description: 'Quando l\'uso della CPU passa sopra la percentuale scelta', needs: ['system'], params: [{ name: 'value', label: 'Percentuale', type: 'number', min: 1, max: 100, required: true, default: 90 }] }); }
  validate(p) { return isFinite(Number(p.value)) ? [] : ['serve una percentuale']; }
  test(p, snap) { return !!(snap.system && snap.system.cpu && Number(snap.system.cpu.usage) > Number(p.value)); }
}

class PushCompare extends StateTrigger {
  constructor() {
    super('push_compare', {
      label: 'Un valore inviato cambia',
      description: 'Quando un valore mandato con il webhook push soddisfa la condizione',
      needs: ['push'],
      params: [
        { name: 'name', label: 'Nome del valore', type: 'text', required: true },
        { name: 'field', label: 'Campo (vuoto = value)', type: 'text' },
        { name: 'op', label: 'Condizione', type: 'select', required: true, options: OPS },
        { name: 'value', label: 'Valore', type: 'text', required: true }
      ]
    });
  }
  validate(p) {
    const out = [];
    if (!NAME_RE.test(String(p.name || ''))) out.push('nome del valore non valido');
    if (!OPS.some(function (o) { return o.value === p.op; })) out.push('scegli la condizione');
    if (p.value === undefined || p.value === '') out.push('serve un valore');
    return out;
  }
  test(p, snap) {
    const hit = snap.push && snap.push[p.name];
    if (!hit) return false;
    const body = hit.value && typeof hit.value === 'object' ? hit.value : { value: hit.value };
    return compare(p.op, dig(body, p.field || 'value'), p.value);
  }
}

class TimeOfDay extends StateTrigger {
  constructor() { super('time_of_day', { label: 'A un\'ora precisa', description: 'Ogni giorno all\'ora scelta', params: [{ name: 'at', label: 'Ora (HH:MM)', type: 'text', required: true, default: '09:00' }] }); }
  validate(p) { return TIME_RE.test(String(p.at || '')) ? [] : ['l\'ora deve essere HH:MM']; }
  test(p, snap) {
    const d = new Date(snap.now);
    const hh = ('0' + d.getHours()).slice(-2), mm = ('0' + d.getMinutes()).slice(-2);
    return hh + ':' + mm === p.at;
  }
}

class NamedEvent extends EventTrigger {
  constructor(type, info, fixed) {
    super(type, info);
    this.fixed = fixed || '';
  }
  validate(p) { return this.fixed || NAME_RE.test(String(p.name || '')) ? [] : ['nome dell\'evento non valido']; }
  matches(p, event) { return event.type === 'event' && event.name === (this.fixed || p.name); }
}

[
  new MusicPlaying(), new AppOpen(), new AppClosed(), new CpuAbove(), new PushCompare(), new TimeOfDay(),
  new NamedEvent('claude_waiting', { label: 'Claude ti aspetta', description: 'Claude Code ha bisogno di te (serve il gancio di Claude Code, vedi Permessi di Claude Code)' }, 'claude-waiting'),
  new NamedEvent('claude_done', { label: 'Claude ha finito', description: 'Claude Code ha finito il lavoro (serve il gancio di Claude Code)' }, 'claude-done'),
  new NamedEvent('webhook_event', { label: 'Arriva un evento webhook', description: 'Quando uno script chiama /hook/<chiave>/event/<nome>', params: [{ name: 'name', label: 'Nome dell\'evento', type: 'text', required: true }] })
].forEach(function (t) { triggers.register(t.type, t); });

module.exports = { triggers: triggers, compare: compare, OPS: OPS, StateTrigger: StateTrigger, EventTrigger: EventTrigger };
