const MEDIA_COMMANDS = [
  { value: 'play_pause', label: 'Play / pausa' },
  { value: 'next', label: 'Brano successivo' },
  { value: 'previous', label: 'Brano precedente' },
  { value: 'stop', label: 'Stop' },
  { value: 'volume_up', label: 'Volume su (sistema)' },
  { value: 'volume_down', label: 'Volume giù (sistema)' },
  { value: 'mute', label: 'Muto (sistema)' },
  { value: 'app_volume_up', label: 'Volume su (app della musica)' },
  { value: 'app_volume_down', label: 'Volume giù (app della musica)' },
  { value: 'app_mute', label: 'Muto (app della musica)' },
  { value: 'shuffle', label: 'Casuale' },
  { value: 'repeat', label: 'Ripeti' }
];

const FOCUS = { name: 'focus', label: 'Prima porta in primo piano', type: 'app', help: 'Facoltativo: l\'app che deve ricevere i tasti' };

const BUILTIN = {
  launch: {
    label: 'Apri o chiudi un\'app',
    description: 'Avvia un\'app di apps.json; se l\'app è "toggle" e già aperta, la chiude',
    params: [{ name: 'app', label: 'App', type: 'app', required: true }]
  },
  media: {
    label: 'Musica e volume',
    description: 'Comandi della musica in riproduzione e volume del PC',
    params: [{ name: 'command', label: 'Comando', type: 'select', required: true, options: MEDIA_COMMANDS }]
  },
  hotkey: {
    label: 'Scorciatoia da tastiera',
    description: 'Preme insieme più tasti, es. CTRL + SHIFT + ESC',
    params: [{ name: 'keys', label: 'Tasti', type: 'keys', required: true }, FOCUS]
  },
  key: {
    label: 'Un tasto',
    description: 'Preme un tasto, anche più volte',
    params: [{ name: 'key', label: 'Tasto', type: 'key', required: true }, { name: 'repeat', label: 'Quante volte', type: 'number', min: 1, max: 50, default: 1 }, FOCUS]
  },
  text: {
    label: 'Scrivi un testo',
    description: 'Scrive il testo sul PC come se fosse digitato',
    params: [{ name: 'value', label: 'Testo', type: 'template', required: true }, FOCUS]
  },
  focus: {
    label: 'Porta in primo piano',
    description: 'Mostra la finestra di un\'app già aperta',
    params: [{ name: 'app', label: 'App', type: 'app', required: true }]
  },
  open_url: {
    label: 'Apri un indirizzo',
    description: 'Apre un sito o un link di un\'app (https, mailto, steam, spotify, vscode, obsidian, discord)',
    params: [{ name: 'url', label: 'Indirizzo', type: 'template', required: true, help: 'Usa {{campo|url}} per mettere un testo dentro un link' }]
  },
  open_path: {
    label: 'Apri file o cartella',
    description: 'Apre un file o una cartella del PC',
    params: [{ name: 'path', label: 'Percorso', type: 'template', required: true }]
  },
  command: {
    label: 'Comando consentito',
    description: 'Esegue un comando di commands.json',
    params: [{ name: 'id', label: 'Comando', type: 'command', required: true }]
  },
  wait: {
    label: 'Aspetta',
    description: 'Pausa dentro una sequenza',
    params: [{ name: 'ms', label: 'Millisecondi', type: 'number', min: 0, max: 10000, required: true }]
  },
  macro: {
    label: 'Sequenza di azioni',
    description: 'Più azioni una dopo l\'altra (al massimo 50)',
    params: [
      { name: 'steps', label: 'Passi', type: 'actions', required: true },
      { name: 'doneMessage', label: 'Messaggio alla fine', type: 'text' }
    ]
  }
};

const HIDDEN = ['shell'];

const PARAM_TYPES = ['text', 'template', 'number', 'boolean', 'select', 'keys', 'key', 'app', 'command', 'actions', 'json', 'icon', 'url', 'path'];

function cleanParams(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(function (p) {
    return p && typeof p.name === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(p.name) && PARAM_TYPES.indexOf(p.type) >= 0;
  }).map(function (p) {
    const out = { name: p.name, label: typeof p.label === 'string' ? p.label : p.name, type: p.type };
    ['help', 'required', 'min', 'max', 'default'].forEach(function (k) { if (p[k] !== undefined) out[k] = p[k]; });
    if (p.type === 'select' && Array.isArray(p.options)) {
      out.options = p.options.filter(function (o) { return o && o.value !== undefined; }).map(function (o) {
        return { value: o.value, label: typeof o.label === 'string' ? o.label : String(o.value) };
      });
    }
    return out;
  });
}

function describe(info, type) {
  const i = info || {};
  return {
    type: type,
    label: typeof i.label === 'string' && i.label ? i.label : type,
    description: typeof i.description === 'string' ? i.description : '',
    params: cleanParams(i.params),
    described: !!info
  };
}

module.exports = { BUILTIN: BUILTIN, HIDDEN: HIDDEN, PARAM_TYPES: PARAM_TYPES, MEDIA_COMMANDS: MEDIA_COMMANDS, cleanParams: cleanParams, describe: describe };
