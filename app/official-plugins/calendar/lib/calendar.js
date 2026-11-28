'use strict';
const fs = require('fs');
const path = require('path');

const ics = require('./ics');

const DAY = 86400000;
const MAX_BYTES = 4 * 1024 * 1024;
const TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10000;
const DAYS_AHEAD = 14;
const MAX_EVENTS = 30;
const NAMES = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

function bad(message) { return Object.assign(new Error(message), { code: 'BAD_REQUEST' }); }

function settingsFile(ctx) { return path.join(ctx.dataDir, 'calendar.json'); }

function settings(ctx) {
  try {
    const s = JSON.parse(fs.readFileSync(settingsFile(ctx), 'utf8'));
    return { url: typeof s.url === 'string' ? s.url : '', file: typeof s.file === 'string' ? s.file : '' };
  } catch (e) { return { url: '', file: '' }; }
}

function configure(ctx, input) {
  input = input || {};
  const url = String(input.url || '').trim().replace(/^webcal:/i, 'https:');
  const file = String(input.file || '').trim();
  if (url && !/^https?:\/\/[^\s]+$/i.test(url)) throw bad('L\'indirizzo deve iniziare con https:// (o webcal://)');
  if (file && !path.isAbsolute(file)) throw bad('Il file deve avere un percorso completo');
  ctx.ensureDataDir();
  fs.writeFileSync(settingsFile(ctx), JSON.stringify({ url: url, file: file }, null, 2));
  cache = { key: '', at: 0, events: [], error: '' };
  return settings(ctx);
}

let cache = { key: '', at: 0, events: [], error: '' };

async function download(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'text/calendar, text/plain, */*' } });
    if (!res.ok) throw new Error('Il calendario ha risposto ' + res.status);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('Calendario troppo grande');
    return text;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Il calendario non risponde');
    throw e;
  } finally { clearTimeout(timer); }
}

async function load(ctx, fetcher) {
  const s = settings(ctx);
  const key = s.url + '|' + s.file;
  if (!s.url && !s.file) return { events: [], error: 'Nessun calendario collegato: aggiungi il link ICS nel pannello' };
  if (cache.key === key && Date.now() - cache.at < TTL_MS) return cache;
  try {
    let text;
    if (s.file) {
      if (fs.statSync(s.file).size > MAX_BYTES) throw new Error('Calendario troppo grande');
      text = fs.readFileSync(s.file, 'utf8');
    } else text = await (fetcher || download)(s.url);
    cache = { key: key, at: Date.now(), events: ics.parse(text), error: '' };
  } catch (e) {
    cache = { key: key, at: Date.now() - TTL_MS + 30000, events: cache.key === key ? cache.events : [], error: e.message };
  }
  return cache;
}

function pad(n) { return ('0' + n).slice(-2); }

function dayLabel(start, now) {
  const a = new Date(now), b = new Date(start);
  const diff = Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / DAY);
  if (diff === 0) return 'Oggi';
  if (diff === 1) return 'Domani';
  return NAMES[b.getDay()] + ' ' + b.getDate();
}

function shape(o, now) {
  const d = new Date(o.start);
  const time = o.allDay ? 'Tutto il giorno' : pad(d.getHours()) + ':' + pad(d.getMinutes());
  const running = !o.allDay && o.start <= now && o.end > now;
  return { title: o.title, location: o.location, start: o.start, end: o.end, allDay: o.allDay, day: dayLabel(o.start, now), time: time, running: running, inMin: Math.round((o.start - now) / 60000), when: dayLabel(o.start, now) + ' ' + time };
}

async function read(ctx, now, fetcher) {
  now = now || Date.now();
  const data = await load(ctx, fetcher);
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const upcoming = ics.expand(data.events, dayStart.getTime(), dayStart.getTime() + DAYS_AHEAD * DAY)
    .filter(function (o) { return o.allDay ? o.end > dayStart.getTime() : o.end > now || o.start >= now; })
    .slice(0, MAX_EVENTS).map(function (o) { return shape(o, now); });
  const next = upcoming.filter(function (e) { return !e.allDay || e.day !== 'Oggi'; })[0] || upcoming[0] || null;
  const today = upcoming.filter(function (e) { return e.day === 'Oggi'; });
  return { events: upcoming, next: next, hasNext: !!next, today: today.length, count: upcoming.length, error: data.error, configured: !data.error || data.error.indexOf('Nessun') !== 0 };
}

module.exports = { read: read, configure: configure, settings: settings, load: load, shape: shape };
