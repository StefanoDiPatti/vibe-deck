const fs = require('fs');
const path = require('path');
const paths = require('../paths');
const log = require('../log');
const events = require('../events');
const { triggers } = require('./triggers');
const { reactions } = require('./reactions');

const MAX_RULES = 50;
const TICK_MS = 2000;
const ID_RE = /^[a-z0-9_-]{1,40}$/;
const PARAM_KEYS = ['app', 'name', 'field', 'op', 'value', 'at', 'page', 'title', 'message', 'command', 'url', 'id', 'keys'];

function bad(message) { return Object.assign(new Error(message), { code: 'BAD_REQUEST' }); }

function file() { return path.join(paths.DATA_DIR, 'rules.json'); }

function readRules() {
  try {
    const data = JSON.parse(fs.readFileSync(file(), 'utf8'));
    return Array.isArray(data.rules) ? data.rules : [];
  } catch (e) { return []; }
}

function writeRules(list) {
  fs.mkdirSync(paths.DATA_DIR, { recursive: true });
  const tmp = file() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ rules: list }, null, 2));
  fs.renameSync(tmp, file());
}

function pick(input) {
  const out = { type: String((input && input.type) || '') };
  PARAM_KEYS.forEach(function (k) {
    if (input && input[k] !== undefined && input[k] !== null) out[k] = typeof input[k] === 'number' ? input[k] : String(input[k]).slice(0, 400);
  });
  return out;
}

function cleanRule(input, index) {
  if (!input || typeof input !== 'object') throw bad('Regola ' + (index + 1) + ' non valida');
  const when = pick(input.when), then = pick(input.then);
  const t = triggers.get(when.type);
  const r = reactions.get(then.type);
  const label = 'Regola ' + (index + 1);
  if (!t) throw bad(label + ': scegli "Quando"');
  if (!r) throw bad(label + ': scegli "Allora"');
  const problems = t.validate(when).concat(r.validate(then));
  if (problems.length) throw bad(label + ': ' + problems.join(', '));
  const id = ID_RE.test(String(input.id || '')) ? input.id : 'r' + Date.now().toString(36) + index;
  const cooldown = Math.max(0, Math.min(86400, parseInt(input.cooldownSec, 10)));
  return {
    id: id,
    name: String(input.name || '').slice(0, 80),
    enabled: input.enabled !== false,
    when: when,
    then: then,
    cooldownSec: isNaN(cooldown) ? 10 : cooldown
  };
}

function clean(list) {
  if (!Array.isArray(list)) throw bad('Le regole devono essere una lista');
  if (list.length > MAX_RULES) throw bad('Al massimo ' + MAX_RULES + ' regole');
  const rules = list.map(cleanRule);
  const seen = {};
  rules.forEach(function (r, i) {
    if (seen[r.id]) r.id = r.id + '-' + i;
    seen[r.id] = true;
  });
  return rules;
}

class RulesEngine {
  constructor(bus) {
    this.bus = bus;
    this.memory = {};
    this.last = {};
    this.timer = null;
    this.off = null;
    this.busy = false;
  }

  start() {
    if (this.timer) return this;
    this.off = this.bus.subscribe(this.onEvent.bind(this));
    this.timer = setInterval(this.tick.bind(this), TICK_MS);
    if (this.timer.unref) this.timer.unref();
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.off) this.off();
    this.timer = null;
    this.off = null;
  }

  active(kind) {
    return readRules().filter(function (r) {
      const t = triggers.get(r.when.type);
      return r.enabled && t && t.kind === kind;
    });
  }

  async snapshot(rules) {
    const needs = {};
    rules.forEach(function (r) { triggers.get(r.when.type).needs.forEach(function (n) { needs[n] = true; }); });
    const snap = { now: Date.now() };
    if (needs.media) { try { snap.media = await require('../services/media').nowPlaying(); } catch (e) { snap.media = null; } }
    if (needs.apps) { try { snap.apps = await require('../services/apps').running(); } catch (e) { snap.apps = null; } }
    if (needs.system) { try { snap.system = require('../services/system').get(); } catch (e) { snap.system = null; } }
    if (needs.push) {
      snap.push = {};
      require('../webhooks').store.list().forEach(function (v) { snap.push[v.name] = v; });
    }
    return snap;
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const rules = this.active('state');
      if (!rules.length) return;
      const snap = await this.snapshot(rules);
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        const now = !!triggers.get(rule.when.type).test(rule.when, snap);
        const before = this.memory[rule.id];
        this.memory[rule.id] = now;
        if (now && before === false) await this.fire(rule);
      }
    } catch (e) {
      log.warn('rules', e.message);
    } finally { this.busy = false; }
  }

  onEvent(event) {
    if (event.type === 'notify' || event.type === 'goto' || event.type === 'rule') return;
    const self = this;
    this.active('event').forEach(function (rule) {
      if (triggers.get(rule.when.type).matches(rule.when, event)) self.fire(rule);
    });
  }

  async fire(rule, force) {
    const at = Date.now();
    const prev = this.last[rule.id];
    if (!force && prev && at - prev.at < rule.cooldownSec * 1000) return null;
    const reaction = reactions.get(rule.then.type);
    let result;
    try {
      const out = await reaction.run(rule.then);
      result = { at: at, ok: true, message: (out && out.message) || '' };
    } catch (e) {
      result = { at: at, ok: false, message: e.message };
      log.warn('rules', (rule.name || rule.id) + ': ' + e.message);
    }
    this.last[rule.id] = result;
    this.bus.publish('rule', { id: rule.id, ok: result.ok });
    return result;
  }
}

const engine = new RulesEngine(events.bus);

function describe() {
  const config = require('../config');
  const actions = require('../actions/descriptors');
  const apps = config.apps();
  const commands = config.commands();
  return {
    triggers: triggers.names().map(function (n) { return triggers.get(n).describe(); }),
    reactions: reactions.names().map(function (n) { return reactions.get(n).describe(); }),
    pages: config.dock().pages.map(function (p) { return { value: p.id, label: p.title }; }),
    apps: Object.keys(apps).sort().map(function (id) { return { value: id, label: apps[id].label || id }; }),
    commands: Object.keys(commands).sort().map(function (id) { return { value: id, label: commands[id].label || id }; }),
    media: actions.MEDIA_COMMANDS,
    ops: require('./triggers').OPS
  };
}

function list() {
  return readRules().map(function (r) { return Object.assign({}, r, { last: engine.last[r.id] || null }); });
}

function save(input) {
  const rules = clean(input);
  writeRules(rules);
  const ids = {};
  rules.forEach(function (r) { ids[r.id] = true; });
  Object.keys(engine.memory).forEach(function (k) { if (!ids[k]) delete engine.memory[k]; });
  return list();
}

async function test(id) {
  const rule = readRules().filter(function (r) { return r.id === id; })[0];
  if (!rule) throw bad('Regola sconosciuta');
  return engine.fire(rule, true);
}

module.exports = { engine: engine, RulesEngine: RulesEngine, describe: describe, list: list, save: save, test: test, clean: clean, MAX_RULES: MAX_RULES };
