const Registry = require('./registry');

const sources = new Registry('source');

class Source {
  constructor(name, minEvery) {
    this.name = name;
    this.minEvery = minEvery;
  }
  validate() { return []; }
  async read() { return {}; }
  every(def) {
    const want = parseInt(def.every, 10);
    return Math.max(this.minEvery, isNaN(want) ? 5 : want);
  }
}

class StaticSource extends Source {
  constructor() { super('static', 60); }
  validate(src) {
    return src.data !== undefined && (typeof src.data !== 'object' || src.data === null) ? ['"source.data" deve essere un oggetto o una lista'] : [];
  }
  async read(src) { return src.data === undefined ? {} : src.data; }
}

class PcSource extends Source {
  constructor() { super('pc', 2); }
  async read() {
    const system = require('../services/system').get() || {};
    let apps = {};
    try { apps = await require('../services/apps').running(); } catch (e) { apps = {}; }
    return Object.assign({}, system, { apps: apps || {} });
  }
}

sources.register('static', new StaticSource());
sources.register('pc', new PcSource());

class SourceCache {
  constructor() { this.entries = new Map(); }

  read(key, source, def) {
    const now = Date.now();
    const hit = this.entries.get(key);
    const ttl = source.every(def) * 1000;
    if (hit && hit.pending) return hit.pending;
    if (hit && now - hit.at < ttl) return Promise.resolve(hit.data);
    const pending = Promise.resolve().then(function () { return source.read(def.source, def); });
    this.entries.set(key, { at: hit ? hit.at : 0, data: hit ? hit.data : null, pending: pending });
    const self = this;
    return pending.then(function (data) {
      self.entries.set(key, { at: Date.now(), data: data, pending: null });
      return data;
    }, function (e) {
      self.entries.delete(key);
      throw e;
    });
  }

  clear() { this.entries.clear(); }
}

module.exports = { sources: sources, Source: Source, SourceCache: SourceCache };
