'use strict';
const { registry } = require('./styles');

const LIGHT = {
  classic: { bg: '#eef2f7', surface: '#ffffff', raised: '#e3e9f1', line: '#c9d3df', text: '#111a24', muted: '#5a6b7d', accent: '#2f6fd0', ok: '#1f883d', warn: '#9a6700', err: '#cf222e' },
  material: { bg: '#f8f9ff', surface: '#ffffff', raised: '#e7e8ee', line: '#c4c6cf', text: '#1a1c1e', muted: '#5d5f66', accent: '#3a5f94', ok: '#2e7d4f', warn: '#8a5a00', err: '#ba1a1a' },
  neon: { bg: '#f4f4f6', surface: '#ffffff', raised: '#ececf0', line: '#d6d6dc', text: '#0d0d12', muted: '#63636e', accent: '#0097c4', ok: '#00a656', warn: '#c79100', err: '#e0123c' }
};
const DARK = {
  brutal: { bg: '#1a1813', surface: '#24211a', raised: '#2e2a21', line: '#f4efe3', text: '#f4efe3', muted: '#b5ad99', accent: '#4d9dff', ok: '#2bd96b', warn: '#ffd23f', err: '#ff6b5b' }
};

const EXTRA = [
  {
    id: 'nord', name: 'Nordico',
    dark: { bg: '#2e3440', surface: '#3b4252', raised: '#434c5e', line: '#4c566a', text: '#eceff4', muted: '#a3acbb', accent: '#88c0d0', ok: '#a3be8c', warn: '#ebcb8b', err: '#bf616a' },
    light: { bg: '#e5e9f0', surface: '#eceff4', raised: '#d8dee9', line: '#c2cad6', text: '#2e3440', muted: '#4c566a', accent: '#5e81ac', ok: '#5f8a43', warn: '#a87b1c', err: '#bf616a' }
  },
  {
    id: 'dracula', name: 'Dracula',
    dark: { bg: '#21222c', surface: '#282a36', raised: '#343746', line: '#44475a', text: '#f8f8f2', muted: '#8b93b8', accent: '#bd93f9', ok: '#50fa7b', warn: '#f1fa8c', err: '#ff5555' },
    light: { bg: '#f5f3e7', surface: '#fffbeb', raised: '#ecebdf', line: '#cfcfde', text: '#1f1f1f', muted: '#635d97', accent: '#644ac9', ok: '#14710a', warn: '#846e15', err: '#cb3a2a' }
  },
  {
    id: 'forest', name: 'Foresta',
    dark: { bg: '#0f1712', surface: '#17231b', raised: '#1e2d23', line: '#2b3d31', text: '#e4efe6', muted: '#8fa595', accent: '#4cc38a', ok: '#7bd88f', warn: '#e0b04a', err: '#e5675b' },
    light: { bg: '#eef3ee', surface: '#f8fbf8', raised: '#e2ebe3', line: '#c5d4c8', text: '#14241a', muted: '#52685a', accent: '#1f8a5b', ok: '#2e8b3e', warn: '#9a6b00', err: '#c0392b' }
  },
  {
    id: 'sunset', name: 'Tramonto',
    dark: { bg: '#17111c', surface: '#221a29', raised: '#2c2134', line: '#3d2e47', text: '#f3e9f1', muted: '#a593a8', accent: '#ff7a59', ok: '#5fd38d', warn: '#ffc857', err: '#ff4f6d' },
    light: { bg: '#fbf1ec', surface: '#fffaf7', raised: '#f4e4dc', line: '#e6cfc4', text: '#2a1820', muted: '#7b5f68', accent: '#e4572e', ok: '#2a9d5c', warn: '#b7791f', err: '#d7263d' }
  },
  {
    id: 'solar', name: 'Solarizzato',
    dark: { bg: '#002b36', surface: '#073642', raised: '#0d4250', line: '#2a5561', text: '#eee8d5', muted: '#93a1a1', accent: '#268bd2', ok: '#859900', warn: '#b58900', err: '#dc322f' },
    light: { bg: '#eee8d5', surface: '#fdf6e3', raised: '#e4ddc8', line: '#d3cbb3', text: '#073642', muted: '#657b83', accent: '#268bd2', ok: '#859900', warn: '#b58900', err: '#dc322f' }
  },
  {
    id: 'paper', name: 'Carta',
    dark: { bg: '#16181d', surface: '#1f2229', raised: '#282c35', line: '#363b46', text: '#e8eaee', muted: '#9aa3b0', accent: '#4f8cff', ok: '#3fb27f', warn: '#d9a443', err: '#ef5b5b' },
    light: { bg: '#e9ebef', surface: '#ffffff', raised: '#f1f3f6', line: '#cfd5dd', text: '#1d2430', muted: '#5f6b7a', accent: '#2563eb', ok: '#1f9d55', warn: '#b7791f', err: '#d64545' }
  }
];

function copy(p) { return Object.assign({}, p); }

function all() {
  const own = registry.all().map(function (s) {
    const base = s.palette();
    const dark = DARK[s.id] || base, light = LIGHT[s.id] || base;
    return { id: 'style-' + s.id, name: s.name, style: s.id, dark: copy(dark), light: copy(light) };
  });
  return own.concat(EXTRA.map(function (p) { return { id: p.id, name: p.name, dark: copy(p.dark), light: copy(p.light) }; }));
}

function find(id, mode) {
  const p = all().filter(function (x) { return x.id === id; })[0];
  return p ? (mode === 'light' ? p.light : p.dark) : null;
}

module.exports = { all: all, find: find, EXTRA: EXTRA };
