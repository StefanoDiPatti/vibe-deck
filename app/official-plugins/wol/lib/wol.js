'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const dgram = require('dgram');

const MAC_RE = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;
const NAME_MAX = 40;
const MAX_DEVICES = 30;
const PORT = 9;

function bad(message) { return Object.assign(new Error(message), { code: 'BAD_REQUEST' }); }

function file(ctx) { return path.join(ctx.dataDir, 'devices.json'); }

function normalizeMac(mac) {
  const text = String(mac || '').trim();
  if (!MAC_RE.test(text)) throw bad('Indirizzo MAC non valido: deve essere come 00:1A:2B:3C:4D:5E');
  return text.replace(/-/g, ':').toLowerCase();
}

function list(ctx) {
  try {
    const data = JSON.parse(fs.readFileSync(file(ctx), 'utf8'));
    return Array.isArray(data) ? data.filter(function (d) { return d && typeof d.name === 'string' && MAC_RE.test(String(d.mac)); }) : [];
  } catch (e) { return []; }
}

function save(ctx, devices) {
  ctx.ensureDataDir();
  fs.writeFileSync(file(ctx) + '.tmp', JSON.stringify(devices, null, 2));
  fs.renameSync(file(ctx) + '.tmp', file(ctx));
}

function add(ctx, input) {
  input = input || {};
  const name = String(input.name || '').trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
  if (!name) throw bad('Dai un nome al dispositivo');
  const mac = normalizeMac(input.mac);
  const devices = list(ctx).filter(function (d) { return d.name.toLowerCase() !== name.toLowerCase(); });
  if (devices.length >= MAX_DEVICES) throw bad('Al massimo ' + MAX_DEVICES + ' dispositivi');
  devices.push({ name: name, mac: mac });
  devices.sort(function (a, b) { return a.name.localeCompare(b.name); });
  save(ctx, devices);
  return devices;
}

function remove(ctx, name) {
  const devices = list(ctx);
  const left = devices.filter(function (d) { return d.name !== name; });
  if (left.length === devices.length) throw bad('Dispositivo non trovato: ' + name);
  save(ctx, left);
  return left;
}

function packet(mac) {
  const bytes = Buffer.from(normalizeMac(mac).replace(/:/g, ''), 'hex');
  return Buffer.concat([Buffer.alloc(6, 0xff)].concat(new Array(16).fill(bytes)));
}

function broadcasts() {
  const out = ['255.255.255.255'];
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (n) {
    (nets[n] || []).forEach(function (a) {
      if (a.family !== 'IPv4' || a.internal || !a.netmask) return;
      const ip = a.address.split('.').map(Number), mask = a.netmask.split('.').map(Number);
      const b = ip.map(function (x, i) { return (x | (~mask[i] & 255)) & 255; }).join('.');
      if (out.indexOf(b) < 0) out.push(b);
    });
  });
  return out;
}

function send(buf, targets) {
  return new Promise(function (resolve, reject) {
    const sock = dgram.createSocket('udp4');
    let left = targets.length, sent = 0, lastError = null;
    const done = function () { sock.close(); if (sent) resolve(sent); else reject(lastError || new Error('Nessuna rete raggiungibile')); };
    sock.on('error', function (e) { lastError = e; try { sock.close(); } catch (x) { return; } reject(e); });
    sock.bind(0, function () {
      sock.setBroadcast(true);
      targets.forEach(function (t) {
        sock.send(buf, PORT, t, function (e) {
          if (e) lastError = e; else sent++;
          if (--left === 0) done();
        });
      });
    });
  });
}

async function wake(ctx, who, transport) {
  const key = String(who || '').trim();
  if (!key) throw bad('Scegli un dispositivo');
  const hit = list(ctx).filter(function (d) { return d.name.toLowerCase() === key.toLowerCase(); })[0];
  const mac = hit ? hit.mac : normalizeMac(key);
  const targets = broadcasts();
  const sent = await (transport || send)(packet(mac), targets);
  return { message: 'Segnale di sveglia mandato a ' + (hit ? hit.name : mac), sent: sent };
}

module.exports = { list: list, add: add, remove: remove, wake: wake, packet: packet, broadcasts: broadcasts, normalizeMac: normalizeMac, MAC_RE: MAC_RE };
