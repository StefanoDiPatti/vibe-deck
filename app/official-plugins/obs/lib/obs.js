'use strict';
const { ObsSocket } = require('./obs-socket');

const RETRY_MS = 5000;
const STATS_TTL_MS = 900;
const AUDIO_KINDS = /wasapi|pulse|coreaudio|alsa|jack|input_capture|output_capture|sndio|audio/i;

function fail(message, code) { return Object.assign(new Error(message), { code: code || 'UNAVAILABLE' }); }

function clock(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const p = function (n) { return (n < 10 ? '0' : '') + n; };
  return (h ? h + ':' + p(m) : m) + ':' + p(r);
}

class Obs {
  constructor(opts) {
    this.secrets = opts.secrets;
    this.file = opts.file;
    this.log = opts.log || { info: function () {}, warn: function () {} };
    this.socket = new ObsSocket();
    this.status = 'setup';
    this.message = '';
    this.retry = null;
    this.connecting = null;
    this.cache = { at: 0, data: null };
    this.live = { scene: '', scenes: [], inputs: {} };
    const self = this;
    this.socket.on('event', function (type, data) { self.onEvent(type, data); });
    this.socket.on('closed', function () { self.status = 'offline'; self.message = 'OBS chiuso'; self.schedule(); });
  }

  settings() {
    const s = this.secrets.loadJson(this.file, this.log) || {};
    return { host: s.host || '127.0.0.1', port: parseInt(s.port, 10) || 4455, password: s.password || '', configured: !!s.configured };
  }

  save(host, port, password) {
    const h = String(host || '127.0.0.1').trim();
    if (!/^[a-zA-Z0-9.-]+$/.test(h)) throw fail('Indirizzo di OBS non valido', 'BAD_REQUEST');
    const p = parseInt(port, 10) || 4455;
    if (p < 1 || p > 65535) throw fail('Porta non valida', 'BAD_REQUEST');
    const old = this.settings();
    this.secrets.writeJson(this.file, { host: h, port: p, password: password === undefined ? old.password : String(password), configured: true });
    clearTimeout(this.retry);
    this.socket.close();
    this.status = 'offline';
    return this.ensure();
  }

  url() { const s = this.settings(); return 'ws://' + s.host + ':' + s.port; }

  schedule() {
    clearTimeout(this.retry);
    const self = this;
    this.retry = setTimeout(function () { self.ensure().catch(function () {}); }, RETRY_MS);
    if (this.retry.unref) this.retry.unref();
  }

  ensure() {
    if (this.socket.ready) return Promise.resolve();
    const s = this.settings();
    if (!s.configured) { this.status = 'setup'; return Promise.resolve(); }
    if (this.connecting) return this.connecting;
    const self = this;
    this.status = 'connecting';
    this.connecting = this.socket.connect(this.url(), s.password).then(function () {
      self.status = 'ready';
      self.message = '';
      self.log.info('collegato a OBS');
      return self.loadScenes().then(function () { return self.loadInputs(); });
    }, function (e) {
      self.status = e.code === 'BAD_AUTH' ? 'auth' : 'offline';
      self.message = e.message;
      if (e.code !== 'BAD_AUTH') self.schedule();
    }).finally(function () { self.connecting = null; });
    return this.connecting;
  }

  async loadScenes() {
    const r = await this.socket.request('GetSceneList');
    this.live.scenes = (r.scenes || []).map(function (s) { return s.sceneName; }).reverse();
    this.live.scene = r.currentProgramSceneName || '';
  }

  async loadInputs() {
    const r = await this.socket.request('GetInputList');
    const audio = (r.inputs || []).filter(function (i) { return AUDIO_KINDS.test(i.inputKind || i.unversionedInputKind || ''); });
    const out = {};
    for (const i of audio) {
      try { out[i.inputName] = { name: i.inputName, muted: !!(await this.socket.request('GetInputMute', { inputName: i.inputName })).inputMuted }; } catch (e) { }
    }
    this.live.inputs = out;
  }

  onEvent(type, data) {
    this.cache.at = 0;
    if (type === 'CurrentProgramSceneChanged') this.live.scene = data.sceneName || this.live.scene;
    if (type === 'SceneListChanged' || type === 'SceneCreated' || type === 'SceneRemoved' || type === 'SceneNameChanged') this.loadScenes().catch(function () {});
    if (type === 'InputMuteStateChanged' && this.live.inputs[data.inputName]) this.live.inputs[data.inputName].muted = !!data.inputMuted;
    if (type === 'InputCreated' || type === 'InputRemoved' || type === 'InputNameChanged') this.loadInputs().catch(function () {});
  }

  async state() {
    await this.ensure();
    const base = { status: this.status, message: this.message };
    if (this.status !== 'ready') return base;
    if (this.cache.data && Date.now() - this.cache.at < STATS_TTL_MS) return Object.assign(base, this.cache.data);
    const req = this.socket.request.bind(this.socket);
    const [stream, record, stats, vcam] = await Promise.all([
      req('GetStreamStatus'), req('GetRecordStatus'), req('GetStats'), req('GetVirtualCamStatus').catch(function () { return {}; })
    ]);
    const data = {
      stream: { active: !!stream.outputActive, reconnecting: !!stream.outputReconnecting, time: clock(stream.outputDuration), congestion: Math.round((stream.outputCongestion || 0) * 100), dropped: stream.outputSkippedFrames || 0 },
      record: { active: !!record.outputActive, paused: !!record.outputPaused, time: clock(record.outputDuration) },
      stats: { fps: Math.round(stats.activeFps || 0), cpu: Math.round(stats.cpuUsage || 0), renderSkipped: stats.renderSkippedFrames || 0, outputSkipped: stats.outputSkippedFrames || 0 },
      virtualcam: !!vcam.outputActive,
      scene: this.live.scene,
      scenes: this.live.scenes.slice(),
      inputs: Object.keys(this.live.inputs).map(function (k) { return this.live.inputs[k]; }, this)
    };
    this.cache = { at: Date.now(), data: data };
    return Object.assign(base, data);
  }

  async run(type, data) {
    await this.ensure();
    if (this.status !== 'ready') throw fail(this.status === 'setup' ? 'Collega OBS dal pannello di controllo sul PC' : (this.message || 'OBS non collegato'));
    const r = await this.socket.request(type, data);
    this.cache.at = 0;
    return r;
  }

  async stream(what) {
    const map = { start: 'StartStream', stop: 'StopStream', toggle: 'ToggleStream' };
    if (!map[what || 'toggle']) throw fail('Comando non valido', 'BAD_REQUEST');
    await this.run(map[what || 'toggle']);
    return { message: what === 'start' ? 'Diretta avviata' : what === 'stop' ? 'Diretta fermata' : 'Diretta: comando inviato' };
  }

  async record(what) {
    const map = { start: 'StartRecord', stop: 'StopRecord', toggle: 'ToggleRecord', pause: 'ToggleRecordPause' };
    if (!map[what || 'toggle']) throw fail('Comando non valido', 'BAD_REQUEST');
    await this.run(map[what || 'toggle']);
    return { message: null };
  }

  async scene(name) {
    const n = String(name || '');
    if (!n) throw fail('Scena mancante', 'BAD_REQUEST');
    await this.run('SetCurrentProgramScene', { sceneName: n });
    this.live.scene = n;
    return { message: null };
  }

  async mute(input, value) {
    const n = String(input || '');
    if (!n) throw fail('Sorgente audio mancante', 'BAD_REQUEST');
    if (typeof value === 'boolean') await this.run('SetInputMute', { inputName: n, inputMuted: value });
    else await this.run('ToggleInputMute', { inputName: n });
    const r = await this.run('GetInputMute', { inputName: n });
    if (this.live.inputs[n]) this.live.inputs[n].muted = !!r.inputMuted;
    return { message: null, muted: !!r.inputMuted };
  }

  async virtualcam() { await this.run('ToggleVirtualCam'); return { message: null }; }

  async replay() { await this.run('SaveReplayBuffer'); return { message: 'Replay salvato' }; }

  async preview(width) {
    const w = Math.max(160, Math.min(960, parseInt(width, 10) || 480));
    const r = await this.run('GetSourceScreenshot', { sourceName: this.live.scene, imageFormat: 'jpg', imageWidth: w, imageCompressionQuality: 70 });
    return { scene: this.live.scene, image: String(r.imageData || '') };
  }

  panelInfo() {
    const s = this.settings();
    return { status: this.status, message: this.message, host: s.host, port: s.port, hasPassword: !!s.password, configured: s.configured };
  }

  stop() { clearTimeout(this.retry); this.socket.close(); }
}

module.exports = { Obs: Obs, clock: clock };
