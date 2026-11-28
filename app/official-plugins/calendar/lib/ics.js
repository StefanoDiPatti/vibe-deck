'use strict';

const DAY = 86400000;
const MAX_OCCURRENCES = 1500;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function unfold(text) {
  return String(text || '').replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function unescapeText(v) {
  return String(v || '').replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
}

function parseLine(line) {
  const colon = line.indexOf(':');
  if (colon < 0) return null;
  const head = line.slice(0, colon).split(';');
  const params = {};
  head.slice(1).forEach(function (p) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  });
  return { name: head[0].toUpperCase(), params: params, value: line.slice(colon + 1) };
}

function parseDate(value, params) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(value || '').trim());
  if (!m) return null;
  const allDay = !m[4] || (params && params.VALUE === 'DATE');
  if (m[7]) return { at: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)), allDay: false };
  return { at: new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime(), allDay: allDay };
}

function parseRule(text) {
  const out = {};
  String(text || '').split(';').forEach(function (p) {
    const eq = p.indexOf('=');
    if (eq > 0) out[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  });
  return out;
}

function parse(text) {
  const events = [];
  let cur = null;
  unfold(text).forEach(function (raw) {
    const l = parseLine(raw);
    if (!l) return;
    if (l.name === 'BEGIN' && l.value === 'VEVENT') { cur = { exdates: [] }; return; }
    if (l.name === 'END' && l.value === 'VEVENT') {
      if (cur && cur.start) events.push(cur);
      cur = null;
      return;
    }
    if (!cur) return;
    if (l.name === 'SUMMARY') cur.title = unescapeText(l.value);
    else if (l.name === 'LOCATION') cur.location = unescapeText(l.value);
    else if (l.name === 'STATUS') cur.status = l.value.toUpperCase();
    else if (l.name === 'DTSTART') { const d = parseDate(l.value, l.params); if (d) { cur.start = d.at; cur.allDay = d.allDay; } }
    else if (l.name === 'DTEND') { const d = parseDate(l.value, l.params); if (d) cur.end = d.at; }
    else if (l.name === 'DURATION') {
      const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(l.value);
      if (m) cur.duration = (+(m[1] || 0) * 7 + +(m[2] || 0)) * DAY + (+(m[3] || 0)) * 3600000 + (+(m[4] || 0)) * 60000;
    } else if (l.name === 'RRULE') cur.rule = parseRule(l.value);
    else if (l.name === 'EXDATE') l.value.split(',').forEach(function (v) { const d = parseDate(v, l.params); if (d) cur.exdates.push(d.at); });
  });
  return events.filter(function (e) { return e.status !== 'CANCELLED'; }).map(function (e) {
    const span = e.end !== undefined ? e.end - e.start : e.duration !== undefined ? e.duration : (e.allDay ? DAY : 0);
    return { title: e.title || '(senza titolo)', location: e.location || '', start: e.start, span: Math.max(0, span), allDay: !!e.allDay, rule: e.rule || null, exdates: e.exdates };
  });
}

function addMonths(ms, n) {
  const d = new Date(ms);
  const day = d.getDate();
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1, d.getHours(), d.getMinutes(), d.getSeconds());
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  if (day > last) return null;
  r.setDate(day);
  return r.getTime();
}

function occurrences(ev, from, to) {
  const out = [];
  const rule = ev.rule;
  const push = function (at) {
    if (ev.exdates.indexOf(at) >= 0) return;
    if (at + ev.span >= from && at <= to) out.push({ title: ev.title, location: ev.location, start: at, end: at + ev.span, allDay: ev.allDay });
  };
  if (!rule || !rule.FREQ) { push(ev.start); return out; }
  const interval = Math.max(1, parseInt(rule.INTERVAL, 10) || 1);
  const count = parseInt(rule.COUNT, 10) || 0;
  const until = rule.UNTIL ? (parseDate(rule.UNTIL) || {}).at : Infinity;
  const startDate = new Date(ev.start);
  let made = 0, guard = 0;
  const take = function (at) {
    if (at < ev.start) return true;
    if (at > until || (count && made >= count)) return false;
    made++;
    push(at);
    return at <= to;
  };
  if (rule.FREQ === 'DAILY') {
    for (let i = 0; guard++ < MAX_OCCURRENCES; i += interval) {
      const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i, startDate.getHours(), startDate.getMinutes(), startDate.getSeconds()).getTime();
      if (!take(d)) break;
    }
  } else if (rule.FREQ === 'WEEKLY') {
    const days = (rule.BYDAY ? rule.BYDAY.split(',').map(function (x) { return WEEKDAYS.indexOf(x.slice(-2)); }).filter(function (x) { return x >= 0; }) : [startDate.getDay()]).sort();
    const monday = startDate.getDate() - startDate.getDay();
    for (let w = 0; guard++ < MAX_OCCURRENCES; w += interval) {
      let stop = false;
      for (let k = 0; k < days.length; k++) {
        const d = new Date(startDate.getFullYear(), startDate.getMonth(), monday + w * 7 + days[k], startDate.getHours(), startDate.getMinutes(), startDate.getSeconds()).getTime();
        if (!take(d)) { stop = true; break; }
      }
      if (stop) break;
    }
  } else if (rule.FREQ === 'MONTHLY' || rule.FREQ === 'YEARLY') {
    const step = rule.FREQ === 'YEARLY' ? 12 * interval : interval;
    for (let m = 0; guard++ < MAX_OCCURRENCES; m += step) {
      const at = addMonths(ev.start, m);
      if (at === null) continue;
      if (!take(at)) break;
    }
  } else push(ev.start);
  return out;
}

function expand(events, from, to) {
  const all = [];
  events.forEach(function (ev) { occurrences(ev, from, to).forEach(function (o) { all.push(o); }); });
  return all.sort(function (a, b) { return a.start - b.start || a.title.localeCompare(b.title); });
}

module.exports = { parse: parse, expand: expand, parseDate: parseDate };
