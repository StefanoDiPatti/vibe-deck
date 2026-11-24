(function () {
  'use strict';

  const DEFAULT_PANEL = 'http://127.0.0.1:8787';
  const KEY = 'vd-panel';
  const TAGS = {
    streaming: 'Streaming', gaming: 'Gaming', music: 'Music', developer: 'Developer', creative: 'Creative', system: 'System',
    productivity: 'Productivity', weather: 'Weather', finance: 'Finance', news: 'News', science: 'Science', sport: 'Sport',
    fun: 'Fun', tools: 'Tools', voice: 'Voice', links: 'Links', deals: 'Deals'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function icon(n) { return (window.Icons && (Icons.html(n) || Icons.html('apps'))) || ''; }

  function panel() {
    const saved = (function () { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } })();
    return /^https?:\/\/[^/\s]+$/.test(saved) ? saved : DEFAULT_PANEL;
  }

  function setPanel(url) {
    const clean = String(url || '').trim().replace(/\/+$/, '').replace(/\/control$/, '');
    const full = /^https?:\/\//.test(clean) ? clean : 'http://' + clean;
    if (!/^https?:\/\/[^/\s]+$/.test(full)) return false;
    try { localStorage.setItem(KEY, full); } catch (e) { return false; }
    return true;
  }

  function panelLink(hash) { return panel() + '/control#' + hash; }

  function encode(obj) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decode(text) {
    try {
      const b64 = String(text).replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(b64 + '==='.slice((b64.length + 3) % 4)))));
    } catch (e) { return null; }
  }

  function tagLabel(t) { return TAGS[t] || (t.charAt(0).toUpperCase() + t.slice(1)); }

  function deckSetting(el) {
    if (!el) return;
    function show() {
      el.innerHTML = 'Your deck: <code>' + esc(panel().replace(/^https?:\/\//, '')) + '</code> <button type="button" class="linkish">change</button>';
    }
    el.addEventListener('click', (e) => {
      if (!e.target.closest('button')) return;
      const next = window.prompt('Address of the PC running Vibe Deck (as in the control panel), e.g. 127.0.0.1:8787', panel().replace(/^https?:\/\//, ''));
      if (next === null) return;
      if (!setPanel(next)) window.alert('This address does not look right.');
      show();
    });
    show();
  }

  window.Site = { esc: esc, icon: icon, panel: panel, setPanel: setPanel, panelLink: panelLink, encode: encode, decode: decode, tagLabel: tagLabel, deckSetting: deckSetting, TAGS: TAGS };
})();
