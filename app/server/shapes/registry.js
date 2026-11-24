class Registry {
  constructor(kind) {
    this.kind = kind;
    this.items = new Map();
  }

  register(name, item) {
    if (this.items.has(name)) throw new Error(this.kind + ' "' + name + '" already registered');
    this.items.set(name, item);
    return item;
  }

  get(name) { return this.items.get(name) || null; }

  has(name) { return this.items.has(name); }

  names() { return Array.from(this.items.keys()); }
}

module.exports = Registry;
