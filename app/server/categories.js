class CategoryRegistry {
  constructor() { this.byId = {}; this.aliases = {}; this.order = []; }

  add(id, label, en, aliases) {
    this.byId[id] = { id: id, label: label, en: en };
    this.order.push(id);
    (aliases || []).forEach((a) => { this.aliases[a] = id; });
    return this;
  }

  normalize(value) {
    const v = String(value || '').toLowerCase();
    if (this.byId[v]) return v;
    return this.aliases[v] || '';
  }

  resolve(explicit, tags, page) {
    const direct = this.normalize(explicit);
    if (direct) return direct;
    const list = Array.isArray(tags) ? tags : [];
    for (let i = 0; i < list.length; i++) {
      const hit = this.normalize(list[i]);
      if (hit) return hit;
    }
    return this.normalize(PAGE_DEFAULTS[page]) || 'other';
  }

  list() {
    return this.order.map((id) => Object.assign({}, this.byId[id]));
  }
}

const PAGE_DEFAULTS = {
  MUSICA: 'music',
  HOME: 'system',
  GIOCHI: 'gaming',
  CLAUDE: 'ai',
  DEEPSEEK: 'ai',
  OLLAMA: 'ai',
  EMAIL: 'communication',
  DISCORD: 'communication',
  TODO: 'productivity',
  VIBER: 'developer',
  GITHUB: 'developer',
  SCHERMI: 'system',
  AUDIO: 'system',
  OBS: 'streaming',
  TWITCH: 'streaming',
  LOL: 'gaming'
};

const categories = new CategoryRegistry()
  .add('system', 'Sistema', 'System', ['pc', 'hardware'])
  .add('music', 'Musica', 'Music', ['audio'])
  .add('streaming', 'Streaming', 'Streaming', ['obs', 'twitch'])
  .add('gaming', 'Giochi', 'Gaming', ['games', 'game'])
  .add('developer', 'Sviluppo', 'Developer', ['dev', 'code'])
  .add('ai', 'Intelligenza artificiale', 'AI', ['llm', 'chat'])
  .add('communication', 'Comunicazione', 'Communication', ['mail', 'email', 'social'])
  .add('productivity', 'Produttività', 'Productivity', ['todo', 'notes'])
  .add('creative', 'Creatività', 'Creative', ['design', '3d'])
  .add('weather', 'Meteo', 'Weather', [])
  .add('finance', 'Finanza', 'Finance', ['crypto', 'markets'])
  .add('news', 'Notizie', 'News', [])
  .add('science', 'Scienza', 'Science', ['space'])
  .add('sport', 'Sport', 'Sport', ['f1'])
  .add('home', 'Casa', 'Smart home', ['smarthome', 'domotica'])
  .add('tools', 'Strumenti', 'Tools', ['links', 'voice', 'shortcuts'])
  .add('fun', 'Curiosità', 'Fun', ['deals'])
  .add('other', 'Altro', 'Other', []);

module.exports = { categories: categories, CategoryRegistry: CategoryRegistry, PAGE_DEFAULTS: PAGE_DEFAULTS };
