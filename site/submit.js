(function () {
  'use strict';

  const REPO = 'https://github.com/StefanoDiPatti/vibe-deck-plugins';
  const $ = (id) => document.getElementById(id);
  const SHAPES = {
    value: 'Big number', bars: 'Bars', status: 'On / off', text: 'Text', buttons: 'Buttons',
    voice: 'Voice commands', list: 'List', slider: 'Slider'
  };
  const SOURCES = {
    pc: 'the PC (CPU, GPU, RAM, network, open apps)', static: 'data written in the widget',
    http: 'the internet', file: 'a file on the PC', command: 'a command on the PC'
  };

  function decode(hash) {
    const m = /(?:^#|&)w=([A-Za-z0-9_-]+)/.exec(hash);
    if (!m) return null;
    try {
      const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(escape(atob(b64 + '==='.slice((b64.length + 3) % 4))));
      const w = JSON.parse(json);
      return w && w.def && typeof w.def === 'object' ? w : null;
    } catch (e) {
      return null;
    }
  }

  function hostOf(url) { try { return new URL(url).host; } catch (e) { return ''; } }

  function actionsOf(def) {
    const out = [];
    if (def.tap) out.push(def.tap);
    if (def.set) out.push(def.set);
    (def.buttons || []).forEach((b) => b && b.action && out.push(b.action));
    const v = def.voice || {};
    (v.commands || []).forEach((c) => c && c.action && out.push(c.action));
    if (v.action) out.push(v.action);
    return out;
  }

  function warnings(def) {
    const out = [];
    const src = def.source || {};
    if (src.type === 'file' || src.type === 'command') out.push('It reads ' + SOURCES[src.type] + ': other people don\'t have it, so it can\'t go in the market as it is.');
    if (/\./.test(src.type || '')) out.push('It uses a data source of a plugin with code: the market accepts JSON only.');
    const acts = actionsOf(def);
    if (acts.some((a) => a.type === 'command')) out.push('A tap runs a command of your PC: commands can\'t go in the market.');
    if (acts.some((a) => a.type === 'launch' || a.type === 'focus')) out.push('A tap opens one of your apps: it works only for people who have the same app set up.');
    if (acts.some((a) => a.type === 'open_path')) out.push('A tap opens a file or folder of your PC: other people don\'t have it.');
    const text = JSON.stringify(def);
    if (/[A-Za-z]:\\\\Users\\\\|\/home\/[a-z]/.test(text)) out.push('It contains a path of your PC: remove it before sharing.');
    if (/(api[_-]?key|token|password|secret)=/i.test(text)) out.push('The address seems to contain a key or a password: never share it.');
    return out;
  }

  function issueUrl(w) {
    const def = w.def;
    const q = new URLSearchParams({
      template: 'widget.yml',
      title: 'Widget: ' + (def.name || w.id),
      name: def.name || w.id,
      description: def.description || '',
      widget: JSON.stringify(def, null, 2)
    });
    return REPO + '/issues/new?' + q.toString();
  }

  function show(w) {
    const def = w.def;
    $('found').hidden = false;
    $('intro').textContent = 'Here is your widget. Read it once more, then choose.';
    $('w-ico').innerHTML = (window.Icons && Icons.html(def.icon || (def.show && def.show.icon) || 'apps')) || '';
    $('w-name').textContent = def.name || w.id;
    $('w-key').textContent = (w.plugin || 'miei') + '/' + (w.id || '');
    $('w-shape').textContent = SHAPES[def.shape] || def.shape || '?';
    const src = def.source || { type: 'static' };
    $('w-source').textContent = (SOURCES[src.type] || src.type) + (src.type === 'http' && hostOf(src.url) ? ' — ' + hostOf(src.url) : '');
    $('w-desc').textContent = def.description || '—';
    $('w-json').textContent = JSON.stringify(def, null, 2);
    const warn = warnings(def);
    $('w-warn').innerHTML = warn.map((t) => '<p class="warn-box">' + t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</p>').join('');
    $('w-send').href = issueUrl(w);
  }

  function route() {
    const w = decode(location.hash);
    $('w-kept').hidden = true;
    $('found').hidden = !w;
    $('empty').hidden = !!w;
    if (w) show(w);
  }

  $('w-keep').addEventListener('click', () => { $('w-kept').hidden = false; history.replaceState(null, '', location.pathname); });
  window.addEventListener('hashchange', route);
  route();
})();
