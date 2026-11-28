const plugins = require('../plugins');
const config = require('../config');
const template = require('./template');
const translate = require('./translate');
const descriptors = require('../actions/descriptors');
const { shapes } = require('./shapes');
const { sources, resolve } = require('./sources');

function label(item, id) { return (item && item.label) || id; }

class CatalogBuilder {
  constructor() { this.out = {}; }

  shapes() {
    this.out.shapes = shapes.names().map(function (n) { return shapes.get(n).describe(); });
    return this;
  }

  sources() {
    const apps = config.apps();
    const list = sources.names().map(function (n) {
      const d = sources.get(n).describe();
      if (n === 'pc') {
        d.fields = d.fields.concat(Object.keys(apps).sort().map(function (id) {
          return { path: 'apps.' + id, label: label(apps[id], id) + ' aperta', type: 'boolean', unit: '' };
        }));
      }
      return Object.assign(d, { plugin: '' });
    });
    const loaded = plugins.load();
    Object.keys(loaded).sort().forEach(function (p) {
      const mod = loaded[p].module;
      const own = mod && mod.sources && typeof mod.sources === 'object' ? mod.sources : {};
      Object.keys(own).sort().forEach(function (name) {
        const src = resolve(p + '.' + name);
        if (src) list.push(Object.assign(src.describe(), { plugin: p }));
      });
    });
    this.out.sources = list;
    return this;
  }

  actions() {
    const handlers = require('../actions').HANDLERS;
    const info = plugins.actionDescriptions();
    this.out.actions = Object.keys(handlers).filter(function (t) { return descriptors.HIDDEN.indexOf(t) < 0; }).sort().map(function (t) {
      const own = info[t];
      const d = descriptors.describe(descriptors.BUILTIN[t] || (own && own.info ? own : null), t);
      return Object.assign(d, { plugin: own ? own.plugin : '' });
    });
    return this;
  }

  filters() {
    this.out.filters = template.describeFilters();
    return this;
  }

  icons() {
    const check = require('../check');
    const pictures = check.pictureNames();
    this.out.icons = Object.keys(check.iconNames() || {}).sort().map(function (n) { return { name: n, picture: pictures.indexOf(n) >= 0 }; });
    return this;
  }

  choices() {
    const apps = config.apps();
    const commands = config.commands();
    const os = config.currentOs();
    this.out.choices = {
      app: Object.keys(apps).sort().map(function (id) { return { value: id, label: label(apps[id], id) }; }),
      command: Object.keys(commands).sort().filter(function (id) { return !!commands[id][os] || !!commands[id].cmd; }).map(function (id) { return { value: id, label: label(commands[id], id) }; }),
      media: descriptors.MEDIA_COMMANDS
    };
    return this;
  }

  build() { return this.out; }
}

function catalog(lang) {
  return translate.translate(new CatalogBuilder().shapes().sources().actions().filters().icons().choices().build(), lang);
}

module.exports = { catalog: catalog, CatalogBuilder: CatalogBuilder };
