(function () {
  'use strict';
  const KEY = 'dock-panel-theme';
  const CACHE = 'dock-panel-theme-vars';
  const STYLES = ['classic', 'material', 'neon', 'brutal'];
  const BUILTIN = [
    { id: 'classic', name: 'Classico', style: 'classic', modified: false, sw: ['#0b0f14', '#18212c', '#3d8bfd'] },
    { id: 'material', name: 'Material', style: 'material', modified: false, sw: ['#111318', '#272a2f', '#a8c7fa'] },
    { id: 'neon', name: 'Neon Elgato', style: 'neon', modified: false, sw: ['#050505', '#41d1ff', '#ff5c7a'] },
    { id: 'brutal', name: 'Neo-brutalista', style: 'brutal', modified: false, sw: ['#f4efe3', '#ffd23f', '#111111'] }
  ];
  const root = document.documentElement;

  const Color = {
    rgb(h) { return [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16)); },
    hex(c) { return '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); },
    mix(a, b, t) { const x = Color.rgb(a), y = Color.rgb(b); return Color.hex(x.map((v, i) => v + (y[i] - v) * t)); },
    lum(h) { const c = Color.rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; },
    contrast(a, b) { const x = Color.lum(a), y = Color.lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); },
    on(bg, a, b) { return Color.contrast(bg, a) >= Color.contrast(bg, b) ? a : b; }
  };

  class PanelPalette {
    static readable(bg, list) {
      const good = list.find((c) => Color.contrast(bg, c) >= 4.5);
      return good || list.slice().sort((x, y) => Color.contrast(bg, y) - Color.contrast(bg, x))[0];
    }
    static vars(p) {
      const dark = Color.lum(p.bg) < Color.lum(p.text);
      const lo = dark ? '#000000' : '#ffffff', hi = dark ? '#ffffff' : '#000000';
      return {
        'color-scheme': dark ? 'dark' : 'light',
        '--bg': p.bg, '--panel': p.surface, '--panel-2': p.raised, '--line': p.line, '--line-2': Color.mix(p.line, p.text, 0.25),
        '--text': p.text, '--text-2': Color.mix(p.text, p.muted, 0.4), '--muted': p.muted, '--strong': Color.mix(p.text, hi, 0.5),
        '--accent': p.accent, '--accent-2': Color.mix(p.accent, p.text, 0.25), '--on-accent': Color.on(p.accent, '#ffffff', '#111111'),
        '--accent-hover': Color.mix(p.accent, p.text, 0.2),
        '--ok': p.ok, '--warn': p.warn, '--bad': p.err, '--bad-text': Color.mix(p.err, p.text, 0.25), '--warn-text': Color.mix(p.warn, p.text, 0.15),
        '--sunken': Color.mix(p.bg, lo, 0.25), '--sunken-2': Color.mix(p.bg, lo, 0.5), '--field': Color.mix(p.bg, lo, 0.2),
        '--hover': Color.mix(p.raised, p.text, 0.08), '--cell-line': Color.mix(p.line, p.bg, 0.4), '--grip': Color.mix(p.line, p.muted, 0.5),
        '--toast': p.raised, '--tile-fg': p.text, '--star': p.warn,
        '--ink': p.text, '--ink-line': p.line, '--paper': p.bg, '--on-ink': p.bg, '--ink-muted': Color.mix(p.bg, p.text, 0.35),
        '--hl': p.warn, '--hl-on-ink': PanelPalette.readable(p.text, [p.warn, p.accent, p.ok, Color.mix(p.accent, p.bg, 0.5), Color.mix(p.accent, p.bg, 0.75), p.bg]), '--on-hl': Color.on(p.warn, p.text, p.bg), '--ok-fill': p.ok, '--on-ok': Color.on(p.ok, p.text, p.bg),
        '--bad-fill': p.err, '--on-bad': Color.on(p.err, p.text, p.bg)
      };
    }
  }

  let list = BUILTIN.slice();
  let current = 'classic';
  let applied = [];
  const find = (id) => list.find((t) => t.id === id);

  function applyVars(vars) {
    applied.forEach((k) => root.style.removeProperty(k));
    applied = [];
    if (!vars) return;
    Object.keys(vars).forEach((k) => { root.style.setProperty(k, vars[k]); applied.push(k); });
  }

  function apply(t) {
    root.setAttribute('data-theme', STYLES.indexOf(t.style) >= 0 ? t.style : 'classic');
    const vars = t.modified && t.palette ? PanelPalette.vars(t.palette) : null;
    applyVars(vars);
    try { localStorage.setItem(CACHE, JSON.stringify({ id: t.id, style: t.style, vars: vars })); } catch (e) { }
  }

  try {
    const s = localStorage.getItem(KEY);
    if (s) current = s;
    const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
    if (c && c.id === current) { root.setAttribute('data-theme', c.style); applyVars(c.vars); }
    else if (STYLES.indexOf(current) >= 0) root.setAttribute('data-theme', current);
    else current = 'classic';
  } catch (e) { }
  const q = new URLSearchParams(location.search).get('theme');
  if (q && STYLES.indexOf(q) >= 0) { current = q; root.setAttribute('data-theme', q); applyVars(null); }

  function mark() {
    const box = document.getElementById('theme-pick');
    if (box) box.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === current)));
  }

  function set(id) {
    const t = find(id);
    if (!t) return;
    current = id;
    apply(t);
    try { localStorage.setItem(KEY, id); } catch (e) { }
    mark();
  }

  function render() {
    const box = document.getElementById('theme-pick');
    if (!box) return;
    box.innerHTML = list.map((t) =>
      '<button type="button" data-theme="' + t.id + '" aria-pressed="' + (t.id === current) + '" title="Tema ' + t.name.replace(/[<>"&]/g, '') + '">' +
      '<span class="theme-sw" aria-hidden="true">' + t.sw.map((c) => '<i style="background:' + c + '"></i>').join('') + '</span>' +
      '<span class="tn"></span></button>').join('');
    box.querySelectorAll('button').forEach((b, i) => { b.querySelector('.tn').textContent = list[i].name; });
  }

  function adopt(themes) {
    if (!Array.isArray(themes) || !themes.length) return;
    list = themes.map((t) => ({ id: t.id, name: t.name, style: t.style, modified: t.modified, palette: t.palette, sw: [t.palette.bg, t.palette.surface, t.palette.accent] }));
    if (!find(current)) current = 'classic';
    render();
    apply(find(current));
  }

  async function load() {
    try {
      const res = await fetch('/api/control/themes', { headers: { 'x-dock-control': '1' } });
      const json = await res.json();
      if (json.ok) adopt(json.data.themes);
    } catch (e) { }
  }

  function mount() {
    const box = document.getElementById('theme-pick');
    if (!box) return;
    render();
    box.addEventListener('click', (e) => { const b = e.target.closest('button[data-theme]'); if (b) set(b.dataset.theme); });
    load();
  }

  window.addEventListener('storage', (e) => { if (e.key === KEY && e.newValue && find(e.newValue)) set(e.newValue); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  window.DockTheme = { list: () => list, get: () => current, set: set, adopt: adopt, vars: PanelPalette.vars };
})();
