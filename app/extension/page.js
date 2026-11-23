(function () {
  'use strict';
  if (window.__dockBridgeLoaded) return;
  window.__dockBridgeLoaded = true;

  var host = location.hostname;
  var site = /(^|\.)music\.apple\.com$/.test(host) ? 'apple'
    : host === 'music.youtube.com' ? 'ytmusic'
      : /(^|\.)youtube\.com$/.test(host) ? 'youtube' : 'web';
  var lastVolume = 0.5;
  var hadState = false;

  function safe(fn) {
    try {
      var r = fn();
      if (r && typeof r.catch === 'function') r.catch(function () {});
    } catch (e) { }
  }
  function text(el) { return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }

  function mk() {
    try { return window.MusicKit && MusicKit.getInstance ? MusicKit.getInstance() : null; } catch (e) { return null; }
  }
  function art(url, size) {
    return url ? String(url).replace('{w}', size).replace('{h}', size).replace('{f}', 'jpg') : '';
  }
  function appleState() {
    var m = mk();
    var it = m && m.nowPlayingItem;
    if (!it) return null;
    var q = m.queue;
    var items = (q && q.items) || [];
    var pos = q ? q.position : -1;
    var queue = [];
    for (var i = Math.max(0, pos - 5); i < Math.min(items.length, pos + 60); i++) {
      var x = items[i];
      if (!x) continue;
      queue.push({
        index: i,
        title: x.title || (x.attributes && x.attributes.name) || '',
        artist: x.artistName || (x.attributes && x.attributes.artistName) || '',
        current: i === pos
      });
    }
    return {
      site: 'apple',
      title: it.title || (it.attributes && it.attributes.name) || '',
      artist: it.artistName || '',
      album: it.albumName || '',
      artwork: art(it.artworkURL || (it.artwork && it.artwork.url), 300),
      duration: m.currentPlaybackDuration || (it.playbackDuration ? it.playbackDuration / 1000 : 0),
      position: m.currentPlaybackTime || 0,
      playing: !!m.isPlaying,
      volume: typeof m.volume === 'number' ? m.volume : null,
      muted: m.volume === 0,
      shuffle: !!m.shuffleMode,
      repeat: ['none', 'one', 'all'][m.repeatMode] || 'none',
      queue: queue
    };
  }
  function appleCommand(c) {
    var m = mk();
    if (!m) return;
    switch (c.type) {
      case 'play_pause': return safe(function () { return m.isPlaying ? m.pause() : m.play(); });
      case 'next': return safe(function () { return m.skipToNextItem(); });
      case 'previous': return safe(function () { return m.currentPlaybackTime > 4 ? m.seekToTime(0) : m.skipToPreviousItem(); });
      case 'stop': return safe(function () { return m.pause(); });
      case 'volume': return safe(function () { m.volume = c.value; });
      case 'mute': return safe(function () {
        if (m.volume > 0) { lastVolume = m.volume; m.volume = 0; } else m.volume = lastVolume || 0.5;
      });
      case 'seek': return safe(function () { return m.seekToTime(c.value); });
      case 'shuffle': return safe(function () { m.shuffleMode = m.shuffleMode ? 0 : 1; });
      case 'repeat': return safe(function () { m.repeatMode = ((m.repeatMode || 0) + 1) % 3; });
      case 'queue_play': return safe(function () { return m.changeToMediaAtIndex(c.value); });
    }
  }

  function yt() {
    var p = document.getElementById('movie_player');
    return p && typeof p.getPlayerState === 'function' ? p : null;
  }
  function queueNodes() {
    if (site === 'ytmusic') return document.querySelectorAll('ytmusic-player-queue-item');
    return document.querySelectorAll('ytd-playlist-panel-renderer#playlist ytd-playlist-panel-video-renderer');
  }
  function ytQueue() {
    var nodes = queueNodes();
    if (!nodes.length) return null;
    var cur = -1;
    for (var i = 0; i < nodes.length; i++) if (nodes[i].hasAttribute('selected')) { cur = i; break; }
    var out = [];
    var from = Math.max(0, cur - 5);
    for (var j = from; j < Math.min(nodes.length, from + 65); j++) {
      var n = nodes[j];
      out.push({
        index: j,
        title: text(n.querySelector(site === 'ytmusic' ? '.song-title' : '#video-title')),
        artist: text(n.querySelector(site === 'ytmusic' ? '.byline' : '#byline')),
        current: j === cur
      });
    }
    return out;
  }
  function ytState() {
    var p = yt();
    var v = document.querySelector('video');
    if (!p && !v) return null;
    var md = navigator.mediaSession && navigator.mediaSession.metadata;
    var title = md && md.title;
    var artist = md && md.artist;
    var artwork = md && md.artwork && md.artwork.length ? md.artwork[md.artwork.length - 1].src : '';
    if (!title && p && p.getVideoData) {
      var vd = p.getVideoData();
      if (vd) { title = vd.title; artist = vd.author; }
    }
    if (!title) return null;
    return {
      site: site,
      title: title,
      artist: artist || '',
      album: (md && md.album) || '',
      artwork: artwork,
      duration: p && p.getDuration ? p.getDuration() : (v && v.duration) || 0,
      position: p && p.getCurrentTime ? p.getCurrentTime() : (v && v.currentTime) || 0,
      playing: p ? p.getPlayerState() === 1 : !!(v && !v.paused),
      volume: p && p.getVolume ? p.getVolume() / 100 : (v ? v.volume : null),
      muted: p && p.isMuted ? p.isMuted() : !!(v && v.muted),
      shuffle: null,
      repeat: null,
      queue: ytQueue()
    };
  }
  function click(selector) {
    var el = document.querySelector(selector);
    if (el) { el.click(); return true; }
    return false;
  }
  function ytCommand(c) {
    var p = yt();
    var v = document.querySelector('video');
    switch (c.type) {
      case 'play_pause': return safe(function () {
        if (p) { if (p.getPlayerState() === 1) p.pauseVideo(); else p.playVideo(); } else if (v) { if (v.paused) v.play(); else v.pause(); }
      });
      case 'next': return safe(function () {
        if (!click(site === 'ytmusic' ? 'ytmusic-player-bar .next-button' : '.ytp-next-button') && p && p.nextVideo) p.nextVideo();
      });
      case 'previous': return safe(function () {
        if (!click(site === 'ytmusic' ? 'ytmusic-player-bar .previous-button' : '.ytp-prev-button') && p) p.seekTo(0, true);
      });
      case 'stop': return safe(function () { if (p) p.pauseVideo(); else if (v) v.pause(); });
      case 'volume': return safe(function () {
        if (p && p.setVolume) { p.setVolume(Math.round(c.value * 100)); if (p.isMuted && p.isMuted()) p.unMute(); } else if (v) v.volume = c.value;
      });
      case 'mute': return safe(function () {
        if (p && p.isMuted) { if (p.isMuted()) p.unMute(); else p.mute(); } else if (v) v.muted = !v.muted;
      });
      case 'seek': return safe(function () { if (p && p.seekTo) p.seekTo(c.value, true); else if (v) v.currentTime = c.value; });
      case 'queue_play': return safe(function () {
        var n = queueNodes()[c.value];
        if (!n) return;
        var target = site === 'ytmusic'
          ? (n.querySelector('ytmusic-play-button-renderer') || n.querySelector('.song-title') || n)
          : (n.querySelector('a#wc-endpoint') || n);
        target.click();
      });
    }
  }

  function state() {
    try { return site === 'apple' ? appleState() : ytState(); } catch (e) { return null; }
  }
  var idleTicks = 0;
  function post() {
    var s = state();
    if (!s) {
      if (!hadState && (++idleTicks % 5) !== 1) return;
      s = { site: site, idle: true };
      hadState = false;
    } else {
      hadState = true;
    }
    window.postMessage({ __dockBridge: 'state', state: s }, '*');
  }
  window.addEventListener('message', function (e) {
    if (e.source !== window || !e.data || e.data.__dockBridge !== 'cmd') return;
    var c = e.data.cmd || {};
    if (site === 'apple') appleCommand(c); else ytCommand(c);
    setTimeout(post, 300);
  });
  setInterval(post, 1000);
})();
