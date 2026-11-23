(function () {
  'use strict';
  const KEY = 'dock-panel-theme';
  const THEMES = [
    { id: 'classic', name: 'Classico', sw: ['#0b0f14', '#18212c', '#3d8bfd'] },
    { id: 'material', name: 'Material', sw: ['#111318', '#272a2f', '#a8c7fa'] },
    { id: 'neon', name: 'Neon Elgato', sw: ['#050505', '#41d1ff', '#ff5c7a'] },
    { id: 'brutal', name: 'Neo-brutalista', sw: ['#f4efe3', '#ffd23f', '#111111'] }
  ];
  const ok = (id) => THEMES.some((t) => t.id === id);

  let current = 'classic';
  try { const s = localStorage.getItem(KEY); if (ok(s)) current = s; } catch (e) { }
  const q = new URLSearchParams(location.search).get('theme');
  if (ok(q)) current = q;
  document.documentElement.setAttribute('data-theme', current);

  function set(id) {
    if (!ok(id)) return;
    current = id;
    document.documentElement.setAttribute('data-theme', id);
    try { localStorage.setItem(KEY, id); } catch (e) { }
    const box = document.getElementById('theme-pick');
    if (box) box.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === id)));
  }

  function mount() {
    const box = document.getElementById('theme-pick');
    if (!box) return;
    box.innerHTML = THEMES.map((t) =>
      '<button type="button" data-theme="' + t.id + '" aria-pressed="' + (t.id === current) + '" title="Tema ' + t.name + '">' +
      '<span class="theme-sw" aria-hidden="true">' + t.sw.map((c) => '<i style="background:' + c + '"></i>').join('') + '</span>' +
      '<span class="tn">' + t.name + '</span></button>').join('');
    box.addEventListener('click', (e) => { const b = e.target.closest('button[data-theme]'); if (b) set(b.dataset.theme); });
  }

  window.addEventListener('storage', (e) => { if (e.key === KEY && ok(e.newValue)) set(e.newValue); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  window.DockTheme = { list: THEMES, get: () => current, set: set };
})();
