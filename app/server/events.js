const MAX_EVENTS = 50;
const MAX_AGE_MS = 10 * 60 * 1000;

class EventBus {
  constructor() {
    this.seq = 0;
    this.queue = [];
    this.listeners = [];
  }

  publish(type, payload) {
    const event = Object.assign({}, payload || {}, { seq: ++this.seq, type: type, at: Date.now() });
    this.queue.push(event);
    if (this.queue.length > MAX_EVENTS) this.queue.shift();
    this.listeners.slice().forEach(function (fn) {
      try { fn(event); } catch (e) { return; }
    });
    return event;
  }

  subscribe(fn) {
    this.listeners.push(fn);
    const bus = this;
    return function () { bus.listeners = bus.listeners.filter(function (f) { return f !== fn; }); };
  }

  since(seq) {
    const limit = Date.now() - MAX_AGE_MS;
    return this.queue.filter(function (e) { return e.seq > seq && e.at >= limit; });
  }

  reset() {
    this.seq = 0;
    this.queue = [];
    this.listeners = [];
  }
}

const TABLET_TYPES = ['notify', 'goto'];

function forTablet(bus, since) {
  const asked = parseInt(since, 10);
  if (isNaN(asked)) return { seq: bus.seq, list: [] };
  const list = bus.since(asked).filter(function (e) { return TABLET_TYPES.indexOf(e.type) >= 0; });
  return { seq: bus.seq, list: list.map(function (e) { return { seq: e.seq, type: e.type, title: e.title, message: e.message, kind: e.kind, page: e.page }; }) };
}

module.exports = { bus: new EventBus(), EventBus: EventBus, forTablet: forTablet, TABLET_TYPES: TABLET_TYPES };
