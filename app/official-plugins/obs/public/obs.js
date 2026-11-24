(function () {
  'use strict';

  I18n.add({
    'Collega OBS dal pannello di controllo sul PC': 'Connect OBS from the control panel on the PC',
    'OBS chiuso': 'OBS closed', 'IN COLLEGAMENTO…': 'CONNECTING…', 'AVVIA LIVE': 'GO LIVE', 'FERMA LIVE': 'END LIVE',
    'REGISTRA': 'RECORD', 'STOP REC': 'STOP REC', 'WEBCAM VIRT.': 'VIRTUAL CAM', 'SALVA REPLAY': 'SAVE REPLAY',
    'SCENE': 'SCENES', 'AUDIO': 'AUDIO', 'Tieni premuto per fermare la diretta': 'Hold to end the live',
    'Diretta avviata': 'Live started', 'Diretta fermata': 'Live ended', 'Replay salvato': 'Replay saved', 'persi': 'dropped', 'RICONNESSIONE': 'RECONNECTING',
    'OBS Studio: diretta, registrazione, scene, audio e anteprima della scena in onda': 'OBS Studio: live, recording, scenes, audio and preview of the program scene'
  });

  var el = D.el, setText = D.setText;
  var BASE = '/api/plugins/obs';
  var POLL_MS = 1500, PREVIEW_MS = 2000, RETRY_MS = 5000;

  function obs(root, tile, app) {
    D.addClass(root, 'w-obs');
    var head = el('div', 'obs-head');
    var live = el('span', 'obs-pill');
    var rec = el('span', 'obs-pill');
    var stats = el('span', 'obs-stats');
    head.appendChild(live); head.appendChild(rec); head.appendChild(stats);
    var shot = el('div', 'obs-shot');
    var img = el('img', '');
    shot.appendChild(img);
    var side = el('div', 'obs-side scroll');
    var actions = el('div', 'obs-actions');
    var audioTitle = el('div', 'obs-title', 'AUDIO');
    var audio = el('div', 'obs-audio');
    var scenesTitle = el('div', 'obs-title', 'SCENE');
    var scenes = el('div', 'obs-scenes');
    side.appendChild(actions); side.appendChild(audioTitle); side.appendChild(audio); side.appendChild(scenesTitle); side.appendChild(scenes);
    var note = el('div', 'empty');
    root.appendChild(head); root.appendChild(shot); root.appendChild(side); root.appendChild(note);
    var state = null, dead = false, pollTimer = null, previewTimer = null, compact = false, sig = { scenes: '', audio: '', actions: '' };

    function post(path, body, node) {
      D.api.post(BASE + path, body || {}, function (err, r) {
        if (node) { D.addClass(node, err ? 'err' : 'ok'); setTimeout(function () { D.removeClass(node, 'ok'); D.removeClass(node, 'err'); }, 700); }
        if (err) app.toast(err.message, 'err');
        else if (r && r.message) app.toast(r.message, 'ok');
        clearTimeout(pollTimer);
        pollTimer = setTimeout(load, 300);
      }, 15000);
    }

    function button(label, icon, cls, onTap, hold) {
      var b = el('div', 'obs-btn ' + (cls || ''));
      b.innerHTML = Icons.html(icon) + '<span>' + D.esc(label) + '</span>';
      if (hold) D.bindTap(b, { hold: 700, onTap: function () { onTap(b); }, onShort: function () { app.toast('Tieni premuto per fermare la diretta', 'info'); } });
      else D.bindTap(b, { scrollable: true, onTap: function () { onTap(b); } });
      return b;
    }

    function paintActions(s) {
      var key = [s.stream.active, s.record.active, s.virtualcam, compact].join('|');
      if (sig.actions === key) return;
      sig.actions = key;
      actions.innerHTML = '';
      if (s.stream.active) actions.appendChild(button('FERMA LIVE', 'stop', 'danger', function (n) { post('/stream', { do: 'stop' }, n); }, true));
      else actions.appendChild(button('AVVIA LIVE', 'live', 'go', function (n) { post('/stream', { do: 'start' }, n); }));
      actions.appendChild(button(s.record.active ? 'STOP REC' : 'REGISTRA', s.record.active ? 'stop' : 'camera', s.record.active ? 'danger' : '', function (n) { post('/record', { do: 'toggle' }, n); }));
      if (!compact) {
        actions.appendChild(button('WEBCAM VIRT.', s.virtualcam ? 'camera' : 'camoff', s.virtualcam ? 'on' : '', function (n) { post('/virtualcam', {}, n); }));
        actions.appendChild(button('SALVA REPLAY', 'save', '', function (n) { post('/replay', {}, n); }));
      }
    }

    function paintAudio(s) {
      var list = compact ? s.inputs.slice(0, 1) : s.inputs;
      var key = JSON.stringify(list);
      if (sig.audio === key) return;
      sig.audio = key;
      audio.innerHTML = '';
      audioTitle.style.display = list.length && !compact ? '' : 'none';
      for (var i = 0; i < list.length; i++) {
        (function (inp) {
          var b = button(inp.name, inp.muted ? 'micoff' : 'mic', inp.muted ? 'muted' : '', function (n) { post('/mute', { input: inp.name }, n); });
          b.className += ' obs-chip notr';
          audio.appendChild(b);
        })(list[i]);
      }
    }

    function paintScenes(s) {
      var key = s.scene + '|' + s.scenes.join('|') + '|' + compact;
      if (sig.scenes === key) return;
      sig.scenes = key;
      scenes.innerHTML = '';
      scenesTitle.style.display = compact ? 'none' : '';
      if (compact) return;
      for (var i = 0; i < s.scenes.length; i++) {
        (function (name) {
          var b = el('div', 'obs-scene notr' + (name === s.scene ? ' on' : ''), name);
          D.bindTap(b, { scrollable: true, onTap: function () { post('/scene', { name: name }, b); } });
          scenes.appendChild(b);
        })(s.scenes[i]);
      }
    }

    function paint(s) {
      state = s;
      var ready = s.status === 'ready';
      note.style.display = ready ? 'none' : '';
      shot.style.display = ready && !compact ? '' : 'none';
      side.style.display = ready ? '' : 'none';
      head.style.display = ready ? '' : 'none';
      if (!ready) {
        setText(note, s.status === 'setup' ? 'Collega OBS dal pannello di controllo sul PC' : s.status === 'connecting' ? 'IN COLLEGAMENTO…' : (s.message || 'OBS chiuso'));
        return;
      }
      setText(live, s.stream.active ? (s.stream.reconnecting ? 'RICONNESSIONE' : 'LIVE ' + s.stream.time) : 'OFFLINE');
      live.className = 'obs-pill ' + (s.stream.active ? 'live' : '');
      rec.style.display = s.record.active ? '' : 'none';
      setText(rec, (s.record.paused ? 'PAUSA ' : 'REC ') + s.record.time);
      rec.className = 'obs-pill rec';
      setText(stats, s.stats.fps + ' fps · CPU ' + s.stats.cpu + '% · ' + s.stats.outputSkipped + ' persi');
      paintActions(s);
      paintAudio(s);
      paintScenes(s);
    }

    function load() {
      if (dead) return;
      D.api.get(BASE + '/state', function (err, s) {
        if (dead) return;
        if (err) { paint({ status: 'offline', message: err.message }); pollTimer = setTimeout(load, RETRY_MS); return; }
        paint(s);
        pollTimer = setTimeout(load, s.status === 'ready' ? POLL_MS : RETRY_MS);
      }, 10000);
    }

    function preview() {
      if (dead) return;
      if (!state || state.status !== 'ready' || compact || shot.style.display === 'none') { previewTimer = setTimeout(preview, PREVIEW_MS); return; }
      var w = Math.min(960, Math.max(240, Math.round(shot.offsetWidth || 480)));
      D.api.get(BASE + '/preview?w=' + w, function (err, r) {
        if (dead) return;
        if (!err && r && r.image) img.src = r.image.indexOf('data:') === 0 ? r.image : 'data:image/jpeg;base64,' + r.image;
        previewTimer = setTimeout(preview, PREVIEW_MS);
      }, 10000);
    }

    load();
    previewTimer = setTimeout(preview, 500);

    return {
      update: function () {},
      resize: function (w, h) {
        var c = w < 560 || h < 260;
        if (c !== compact) { compact = c; sig = { scenes: '', audio: '', actions: '' }; if (state) paint(state); }
        D.toggleClass(root, 'obs-compact', compact);
      },
      destroy: function () { dead = true; clearTimeout(pollTimer); clearTimeout(previewTimer); }
    };
  }

  Widgets.register('obs', obs);
})();
