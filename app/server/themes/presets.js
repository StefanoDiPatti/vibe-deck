'use strict';
const { registry } = require('./styles');

const EXTRA = [
  { id: 'nord', name: 'Nordico', palette: { bg: '#2e3440', surface: '#3b4252', raised: '#434c5e', line: '#4c566a', text: '#eceff4', muted: '#a3acbb', accent: '#88c0d0', ok: '#a3be8c', warn: '#ebcb8b', err: '#bf616a' } },
  { id: 'dracula', name: 'Dracula', palette: { bg: '#21222c', surface: '#282a36', raised: '#343746', line: '#44475a', text: '#f8f8f2', muted: '#8b93b8', accent: '#bd93f9', ok: '#50fa7b', warn: '#f1fa8c', err: '#ff5555' } },
  { id: 'forest', name: 'Foresta', palette: { bg: '#0f1712', surface: '#17231b', raised: '#1e2d23', line: '#2b3d31', text: '#e4efe6', muted: '#8fa595', accent: '#4cc38a', ok: '#7bd88f', warn: '#e0b04a', err: '#e5675b' } },
  { id: 'sunset', name: 'Tramonto', palette: { bg: '#17111c', surface: '#221a29', raised: '#2c2134', line: '#3d2e47', text: '#f3e9f1', muted: '#a593a8', accent: '#ff7a59', ok: '#5fd38d', warn: '#ffc857', err: '#ff4f6d' } },
  { id: 'solar', name: 'Solarizzato chiaro', palette: { bg: '#eee8d5', surface: '#fdf6e3', raised: '#e4ddc8', line: '#d3cbb3', text: '#073642', muted: '#657b83', accent: '#268bd2', ok: '#859900', warn: '#b58900', err: '#dc322f' } },
  { id: 'paper', name: 'Carta', palette: { bg: '#e9ebef', surface: '#ffffff', raised: '#f1f3f6', line: '#cfd5dd', text: '#1d2430', muted: '#5f6b7a', accent: '#2563eb', ok: '#1f9d55', warn: '#b7791f', err: '#d64545' } }
];

function all() {
  const own = registry.all().map(function (s) { return { id: 'style-' + s.id, name: s.name, palette: s.palette(), style: s.id }; });
  return own.concat(EXTRA.map(function (p) { return { id: p.id, name: p.name, palette: Object.assign({}, p.palette) }; }));
}

module.exports = { all: all, EXTRA: EXTRA };
