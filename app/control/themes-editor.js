(function () {
  'use strict';
  const { esc, api, toast } = window.Panel;
  const $ = (id) => document.getElementById(id);
  const HEX = /^#[0-9a-f]{6}$/;

  function lum(hex) {
    const c = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function isDark(p) { return lum(p.bg) < lum(p.text); }
  function samePal(a, b) { return !!a && !!b && Object.keys(a).every((k) => a[k] === b[k]); }
  function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function swatches(p) { return '<span class="th-sw" aria-hidden="true">' + [p.bg, p.surface, p.accent, p.text].map((c) => '<i style="background:' + c + '"></i>').join('') + '</span>'; }

  class ThemeDraft {
    constructor() { this.listeners = []; this.base = null; this.theme = null; this.palette = null; this.name = ''; this.style = 'classic'; }
    subscribe(fn) { this.listeners.push(fn); }
    emit(what) { this.listeners.forEach((fn) => fn(what, this)); }
    load(theme) {
      this.theme = theme;
      this.palette = Object.assign({}, theme.palette);
      this.name = theme.name;
      this.style = theme.style;
      this.base = JSON.stringify([this.name, this.style, this.palette]);
      this.emit('load');
    }
    set(token, value) { if (!HEX.test(value) || this.palette[token] === value) return; this.palette[token] = value; this.emit('color'); }
    usePalette(p) { this.palette = Object.assign({}, p); this.emit('color'); }
    setName(n) { this.name = n; this.emit('meta'); }
    setStyle(s) { if (this.style === s) return; this.style = s; this.emit('style'); }
    dirty() { return !!this.theme && JSON.stringify([this.name, this.style, this.palette]) !== this.base; }
  }

  class TabletPreview {
    constructor(frame, box) { this.frame = frame; this.box = box; this.pending = null; this.ready = false; this.timer = null; }
    open(link) {
      const m = /[?&]t=([^&]+)/.exec(link || '');
      this.frame.src = location.origin + '/' + (m ? '?t=' + m[1] : '');
      this.ready = false;
      this.waitReady();
      this.fit();
    }
    waitReady() {
      clearTimeout(this.timer);
      const w = this.win();
      const boot = w && w.document && w.document.getElementById('boot');
      if (w && w.VibeTheme && /hidden/.test(boot ? boot.className : 'hidden')) {
        this.ready = true;
        if (this.pending) this.apply(this.pending.style, this.pending.css);
        return;
      }
      this.timer = setTimeout(() => this.waitReady(), 300);
    }
    win() { try { return this.frame.contentWindow; } catch (e) { return null; } }
    fit() {
      const scale = Math.min(1, this.box.clientWidth / 1280);
      this.frame.style.transform = 'scale(' + scale + ')';
      this.box.style.height = Math.round(800 * scale) + 'px';
    }
    apply(style, css) {
      this.pending = { style: style, css: css };
      const w = this.win();
      if (!this.ready || !w || !w.VibeTheme) return;
      try { w.VibeTheme.preview(style, css); } catch (e) { }
    }
  }

  class ThemesEditor {
    constructor() {
      this.data = null;
      this.draft = new ThemeDraft();
      this.preview = new TabletPreview($('th-frame'), $('th-frame-box'));
      this.cssTimer = null;
      this.mode = 'dark';
      this.seq = 0;
      this.draft.subscribe((what) => this.onDraft(what));
      this.bind();
    }

    async start() {
      try {
        this.data = await api('GET', '/api/control/themes');
        const info = await api('GET', '/api/control/info');
        const link = ((info.pairing || [])[0] || {}).link || '';
        this.preview.open(link);
        this.pick(this.data.themes[0].id);
      } catch (e) { $('th-state').textContent = e.message; }
      window.addEventListener('resize', () => this.preview.fit());
    }

    bind() {
      $('th-send').addEventListener('click', () => this.toggleTablet());
      $('th-tablet-list').addEventListener('click', (e) => {
        const b = e.target.closest('[data-unsend]');
        if (b) this.sendTablet(this.data.tablet.filter((id) => id !== b.dataset.unsend));
      });
      $('th-pick').addEventListener('change', (e) => this.leave(() => this.pick(e.target.value), () => { e.target.value = this.draft.theme.id; }));
      $('th-name').addEventListener('input', (e) => this.draft.setName(e.target.value));
      $('th-style').addEventListener('change', (e) => this.draft.setStyle(e.target.value));
      $('th-presets').addEventListener('click', (e) => {
        const b = e.target.closest('[data-preset]');
        if (!b) return;
        const p = this.data.presets.find((x) => x.id === b.dataset.preset);
        if (p) this.draft.usePalette(p[this.mode]);
      });
      $('th-mode').addEventListener('click', (e) => {
        const b = e.target.closest('[data-mode]');
        if (b) this.setMode(b.dataset.mode);
      });
      $('th-colors').addEventListener('input', (e) => {
        const tok = e.target.dataset.tok;
        if (!tok) return;
        let v = e.target.value.trim().toLowerCase();
        if (/^[0-9a-f]{6}$/.test(v)) v = '#' + v;
        if (HEX.test(v)) this.draft.set(tok, v);
      });
      $('th-new').addEventListener('click', () => this.leave(() => this.startNew()));
      $('th-save').addEventListener('click', () => this.save());
      $('th-undo').addEventListener('click', () => this.draft.load(this.draft.theme));
      $('th-reset').addEventListener('click', () => this.reset());
      $('th-export').addEventListener('click', () => this.exportTheme());
      $('th-import').addEventListener('click', () => $('th-file').click());
      $('th-file').addEventListener('change', (e) => this.importFile(e.target.files[0]));
    }

    leave(go, cancel) {
      if (!this.draft.dirty() || confirm('Ci sono modifiche non salvate al tema. Le perdi?')) go();
      else if (cancel) cancel();
    }

    pick(id) {
      const t = this.data.themes.find((x) => x.id === id) || this.data.themes[0];
      this.draft.load(t);
    }

    startNew() {
      const from = this.draft.theme;
      this.draft.load({ id: '', name: 'Il mio tema', style: from ? from.style : 'classic', custom: true, modified: true, palette: Object.assign({}, this.draft.palette || this.data.styles[0].palette) });
      this.draft.base = '';
      this.onDraft('meta');
      $('th-name').focus();
      $('th-name').select();
    }

    matchPreset(mode) { return this.data.presets.find((p) => samePal(p[mode], this.draft.palette)); }

    setMode(mode) {
      if (mode === this.mode) return;
      const match = this.matchPreset(this.mode);
      this.mode = mode;
      if (match) this.draft.usePalette(match[mode]);
      else this.renderPresets();
    }

    renderPresets() {
      $('th-mode').querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === this.mode)));
      const on = this.matchPreset(this.mode);
      $('th-presets').innerHTML = this.data.presets.map((p) => '<button class="chip th-preset' + (on === p ? ' on' : '') + '" type="button" data-preset="' + esc(p.id) + '" title="Usa i colori ' + esc(p.name) + (this.mode === 'light' ? ' chiari' : ' scuri') + '">' + swatches(p[this.mode]) + esc(p.name) + '</button>').join('');
    }

    onDraft(what) {
      if (what === 'load') { this.mode = isDark(this.draft.palette) ? 'dark' : 'light'; this.renderAll(); }
      else if (what === 'color') { this.renderColors(); this.renderChecks(); this.renderPresets(); }
      this.renderState();
      if (what !== 'meta') this.schedulePreview();
    }

    renderAll() {
      const d = this.draft;
      $('th-pick').innerHTML = this.data.themes.map((t) => '<option value="' + esc(t.id) + '"' + (t.id === (d.theme && d.theme.id) ? ' selected' : '') + '>' +
        esc(t.name) + (t.custom ? '' : t.modified ? ' (colori tuoi)' : '') + '</option>').join('') + (d.theme && !d.theme.id ? '<option value="" selected>' + esc(d.name) + ' (nuovo)</option>' : '');
      const custom = !!(d.theme && d.theme.custom);
      $('th-meta').hidden = !custom;
      $('th-name').value = d.name;
      $('th-style').innerHTML = this.data.styles.map((s) => '<option value="' + s.id + '"' + (s.id === d.style ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('');
      this.renderPresets();
      $('th-colors').innerHTML = this.data.tokens.map((t) =>
        '<div class="th-color"><input type="color" data-tok="' + t.id + '" aria-label="' + esc(t.label) + '">' +
        '<span class="th-cl"><b>' + esc(t.label) + '</b><small>' + esc(t.hint) + '</small></span>' +
        '<input class="th-hex" type="text" maxlength="7" spellcheck="false" data-tok="' + t.id + '" aria-label="' + esc(t.label) + ' in esadecimale"></div>').join('');
      this.renderColors();
      this.renderChecks();
    }

    renderColors() {
      const p = this.draft.palette;
      document.querySelectorAll('#th-colors input[data-tok]').forEach((inp) => {
        if (document.activeElement === inp && inp.type === 'text') return;
        if (inp.value !== p[inp.dataset.tok]) inp.value = p[inp.dataset.tok];
      });
    }

    renderChecks() {
      const p = this.draft.palette, warn = [];
      [['text', 'bg', 'Testo su sfondo'], ['text', 'surface', 'Testo sui riquadri'], ['text', 'raised', 'Testo sui pulsanti'], ['muted', 'surface', 'Testo secondario sui riquadri']].forEach((c) => {
        const r = contrast(p[c[0]], p[c[1]]);
        if (r < (c[0] === 'muted' ? 3 : 4.5)) warn.push(c[2] + ': contrasto ' + r.toFixed(1) + ':1');
      });
      $('th-checks').innerHTML = warn.length ? '<b>Si legge male:</b> ' + warn.map(esc).join(' · ') : 'Contrasto buono.';
      $('th-checks').className = 'th-checks' + (warn.length ? ' warn' : ' ok');
    }

    renderState() {
      const d = this.draft, t = d.theme;
      const dirty = d.dirty();
      $('th-state').textContent = !t ? '' : dirty ? 'NON SALVATO' : t.custom ? 'TUO' : t.modified ? 'COLORI TUOI' : 'PREDEFINITO';
      $('th-state').className = 'pill' + (dirty ? ' warn' : t && t.modified ? ' ok' : '');
      $('th-save').disabled = !dirty || (t && t.custom && !d.name.trim());
      $('th-undo').disabled = !dirty || !t.id;
      $('th-reset').hidden = !t || !t.id || (!t.custom && !t.modified);
      $('th-reset').textContent = t && t.custom ? 'Elimina tema' : 'Colori originali';
      $('th-export').disabled = !t || !t.id;
      this.renderTablet();
    }

    schedulePreview() {
      clearTimeout(this.cssTimer);
      this.cssTimer = setTimeout(async () => {
        const n = ++this.seq;
        try {
          const r = await api('POST', '/api/control/themes/css', { style: this.draft.style, palette: this.draft.palette });
          if (n === this.seq) this.preview.apply(this.draft.style, r.css);
        } catch (e) { toast(e.message, 'err'); }
      }, 160);
    }

    adopt(r, id) {
      this.data = { themes: r.themes, styles: r.styles, presets: r.presets, tokens: r.tokens, tablet: r.tablet || [], defaultId: r.defaultId, maxTablet: r.maxTablet };
      if (window.DockTheme && window.DockTheme.adopt) window.DockTheme.adopt(r.themes);
      this.pick(id);
    }

    async save() {
      const d = this.draft;
      try {
        const r = await api('POST', '/api/control/themes/save', { id: d.theme.id, name: d.name, style: d.style, palette: d.palette });
        this.adopt(r, r.id);
        toast(this.data.tablet.indexOf(r.id) >= 0 || r.id === this.data.defaultId ? 'Tema salvato: il tablet si aggiorna da solo' : 'Tema salvato. Per averlo sul tablet premi "Mostra sul tablet"', 'ok');
      } catch (e) { toast(e.message, 'err'); }
    }

    renderTablet() {
      const d = this.data, t = this.draft.theme;
      const name = (id) => ((d.themes.find((x) => x.id === id) || {}).name || id);
      $('th-tablet-list').innerHTML = '<span class="chip th-fixed" title="Sempre sul tablet">' + esc(name(d.defaultId)) + ' · predefinito</span>' +
        d.tablet.map((id) => '<span class="chip on">' + esc(name(id)) + '<button type="button" class="th-unsend" data-unsend="' + esc(id) + '" title="Togli dal tablet" aria-label="Togli ' + esc(name(id)) + ' dal tablet">×</button></span>').join('');
      $('th-tablet-count').textContent = d.tablet.length + ' / ' + d.maxTablet;
      const btn = $('th-send');
      const on = !!t && d.tablet.indexOf(t.id) >= 0;
      btn.disabled = !t || !t.id || t.id === d.defaultId || (!on && d.tablet.length >= d.maxTablet);
      btn.textContent = !t || !t.id ? 'Salvalo per mandarlo al tablet' : t.id === d.defaultId ? 'Sempre sul tablet' : on ? 'Togli dal tablet' : d.tablet.length >= d.maxTablet ? 'Tablet pieno (' + d.maxTablet + ')' : 'Mostra sul tablet';
    }

    toggleTablet() {
      const t = this.draft.theme, list = this.data.tablet.slice();
      const i = list.indexOf(t.id);
      if (i >= 0) list.splice(i, 1); else list.push(t.id);
      this.sendTablet(list);
    }

    async sendTablet(ids) {
      try {
        const r = await api('POST', '/api/control/themes/tablet', { ids: ids });
        this.data.tablet = r.tablet || [];
        this.renderTablet();
        toast('Sul tablet: ' + [this.data.defaultId].concat(this.data.tablet).map((id) => (this.data.themes.find((x) => x.id === id) || {}).name || id).join(', '), 'ok');
      } catch (e) { toast(e.message, 'err'); }
    }

    async reset() {
      const t = this.draft.theme;
      if (!confirm(t.custom ? 'Elimino il tema "' + t.name + '"?' : 'Rimetto i colori originali di ' + t.name + '?')) return;
      try {
        const r = await api('POST', '/api/control/themes/reset', { id: t.id });
        this.adopt(r, t.custom ? r.themes[0].id : t.id);
        toast(t.custom ? 'Tema eliminato' : 'Colori originali rimessi', 'ok');
      } catch (e) { toast(e.message, 'err'); }
    }

    async exportTheme() {
      try {
        const t = await api('GET', '/api/control/themes/export?id=' + encodeURIComponent(this.draft.theme.id));
        const blob = new Blob([JSON.stringify(t, null, 2) + '\n'], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'tema-' + (t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'vibe-deck') + '.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      } catch (e) { toast(e.message, 'err'); }
    }

    async importFile(file) {
      $('th-file').value = '';
      if (!file) return;
      try {
        const obj = JSON.parse(await file.text());
        const r = await api('POST', '/api/control/themes/import', obj);
        this.adopt(r, r.id);
        toast('Tema importato: ' + r.theme.name, 'ok');
      } catch (e) { toast(e instanceof SyntaxError ? 'Il file non è un JSON valido' : e.message, 'err'); }
    }
  }

  const editor = new ThemesEditor();
  window.Panel.themes = editor;
  editor.start();
})();
