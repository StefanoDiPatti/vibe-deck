const Registry = require('../shapes/registry');

const reactions = new Registry('reaction');

const DELEGATED = {
  launch: { label: 'Apri o chiudi un\'app', params: [{ name: 'app', label: 'App', type: 'app', required: true }] },
  media: { label: 'Musica e volume', params: [{ name: 'command', label: 'Comando', type: 'select', required: true, options: 'media' }] },
  open_url: { label: 'Apri un indirizzo', params: [{ name: 'url', label: 'Indirizzo', type: 'text', required: true }] },
  command: { label: 'Esegui un comando consentito', params: [{ name: 'id', label: 'Comando', type: 'command', required: true }] },
  hotkey: { label: 'Premi una scorciatoia', params: [{ name: 'keys', label: 'Tasti (es. WIN+D)', type: 'text', required: true }] },
  'homeassistant.tap': { label: 'Casa: accendi o spegni un dispositivo', params: [{ name: 'entity', label: 'Dispositivo (es. light.salotto)', type: 'text', required: true }] },
  'homeassistant.webhook': { label: 'Chiama un indirizzo web (webhook)', params: [{ name: 'url', label: 'Indirizzo', type: 'text', required: true }, { name: 'body', label: 'Corpo (facoltativo)', type: 'text' }] },
  'wol.wake': { label: 'Sveglia un dispositivo (Wake-on-LAN)', params: [{ name: 'device', label: 'Nome o MAC', type: 'text', required: true }] }
};

class Reaction {
  constructor(type, info) { this.type = type; this.info = info; }
  describe() { return { type: this.type, label: this.info.label, params: this.info.params || [] }; }
  validate() { return []; }
  async run() { return { message: null }; }
  available() { return true; }
}

class GotoPage extends Reaction {
  constructor() { super('goto', { label: 'Apri una pagina sul tablet', params: [{ name: 'page', label: 'Pagina', type: 'page', required: true }] }); }
  validate(p) { return p.page ? [] : ['scegli una pagina']; }
  async run(p) { return require('../webhooks').goto(p.page); }
}

class Notify extends Reaction {
  constructor() {
    super('notify', { label: 'Mostra una notifica sul tablet', params: [{ name: 'title', label: 'Titolo', type: 'text' }, { name: 'message', label: 'Messaggio', type: 'text', required: true }] });
  }
  validate(p) { return p.message || p.title ? [] : ['scrivi un messaggio']; }
  async run(p) { return require('../webhooks').notify({ title: p.title, message: p.message, kind: 'info' }); }
}

class Delegate extends Reaction {
  available() { return !!require('../actions').HANDLERS[this.type]; }
  validate(p) {
    return this.info.params.filter(function (x) { return x.required && (p[x.name] === undefined || p[x.name] === ''); }).map(function (x) { return 'manca: ' + x.label; });
  }
  async run(p) {
    const action = { type: this.type };
    this.info.params.forEach(function (x) { if (p[x.name] !== undefined) action[x.name] = p[x.name]; });
    if (this.type === 'hotkey') action.keys = String(p.keys).split('+').map(function (k) { return k.trim().toUpperCase(); }).filter(Boolean);
    return require('../actions').execute(action);
  }
}

[new GotoPage(), new Notify()].forEach(function (r) { reactions.register(r.type, r); });
Object.keys(DELEGATED).forEach(function (t) { reactions.register(t, new Delegate(t, DELEGATED[t])); });

module.exports = { reactions: reactions };
