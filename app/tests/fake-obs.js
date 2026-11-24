'use strict';
const http = require('http');
const crypto = require('crypto');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const PIXEL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

function frame(text) {
  const body = Buffer.from(text);
  const len = body.length;
  const head = len < 126 ? Buffer.from([0x81, len]) : len < 65536 ? Buffer.from([0x81, 126, len >> 8, len & 255]) : null;
  if (head) return Buffer.concat([head, body]);
  const big = Buffer.alloc(10);
  big[0] = 0x81; big[1] = 127; big.writeBigUInt64BE(BigInt(len), 2);
  return Buffer.concat([big, body]);
}

function closeFrame(code) { const b = Buffer.alloc(4); b[0] = 0x88; b[1] = 2; b.writeUInt16BE(code, 2); return b; }

function readFrames(buf) {
  const out = [];
  let i = 0;
  while (buf.length - i >= 2) {
    const op = buf[i] & 15, masked = buf[i + 1] & 128;
    let len = buf[i + 1] & 127, p = i + 2;
    if (len === 126) { if (buf.length - p < 2) break; len = buf.readUInt16BE(p); p += 2; }
    else if (len === 127) { if (buf.length - p < 8) break; len = Number(buf.readBigUInt64BE(p)); p += 8; }
    const mask = masked ? buf.slice(p, p + 4) : null;
    if (masked) p += 4;
    if (buf.length - p < len) break;
    const data = Buffer.from(buf.slice(p, p + len));
    if (mask) for (let k = 0; k < data.length; k++) data[k] ^= mask[k % 4];
    out.push({ op: op, data: data });
    i = p + len;
  }
  return { frames: out, rest: buf.slice(i) };
}

function hash(s) { return crypto.createHash('sha256').update(s).digest('base64'); }

class FakeObs {
  constructor(password) {
    this.password = password;
    this.state = {
      scenes: ['Cam', 'Gioco', 'Pausa'], scene: 'Gioco', stream: false, record: false, vcam: false, start: 0,
      inputs: { 'Mic/Aux': false, 'Audio del desktop': false }
    };
    this.requests = [];
    this.clients = new Set();
    const self = this;
    this.server = http.createServer(function (req, res) { res.statusCode = 426; res.end(); });
    this.server.on('upgrade', function (req, socket) { self.accept(req, socket); });
  }

  listen() {
    const self = this;
    return new Promise(function (r) { self.server.listen(0, '127.0.0.1', function () { self.port = self.server.address().port; r(self); }); });
  }

  close() { this.clients.forEach(function (c) { c.destroy(); }); this.server.close(); }

  accept(req, socket) {
    const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\nSec-WebSocket-Protocol: obswebsocket.json\r\n\r\n');
    this.clients.add(socket);
    const salt = crypto.randomBytes(8).toString('base64'), challenge = crypto.randomBytes(8).toString('base64');
    const self = this;
    const send = function (op, d) { if (!socket.destroyed) socket.write(frame(JSON.stringify({ op: op, d: d }))); };
    socket.vibeSend = send;
    send(0, Object.assign({ obsWebSocketVersion: '5.5.0', rpcVersion: 1 }, this.password ? { authentication: { salt: salt, challenge: challenge } } : {}));
    let buf = Buffer.alloc(0);
    socket.on('data', function (chunk) {
      const r = readFrames(Buffer.concat([buf, chunk]));
      buf = r.rest;
      r.frames.forEach(function (f) {
        if (f.op === 8) { socket.end(closeFrame(1000)); return; }
        if (f.op !== 1) return;
        const msg = JSON.parse(f.data.toString());
        if (msg.op === 1) {
          if (self.password && msg.d.authentication !== hash(hash(self.password + salt) + challenge)) { socket.end(closeFrame(4009)); return; }
          send(2, { negotiatedRpcVersion: 1 });
        } else if (msg.op === 6) {
          self.requests.push(msg.d.requestType);
          const r = self.handle(msg.d.requestType, msg.d.requestData || {});
          send(7, { requestType: msg.d.requestType, requestId: msg.d.requestId, requestStatus: r.ok ? { result: true, code: 100 } : { result: false, code: 600, comment: r.error }, responseData: r.data });
        }
      });
    });
    socket.on('close', function () { self.clients.delete(socket); });
    socket.on('error', function () { });
  }

  event(type, data) { this.clients.forEach(function (c) { if (c.vibeSend) c.vibeSend(5, { eventType: type, eventIntent: 1, eventData: data }); }); }

  handle(type, d) {
    const s = this.state;
    const ok = function (data) { return { ok: true, data: data || {} }; };
    const duration = function (on) { return on ? Date.now() - s.start : 0; };
    switch (type) {
      case 'GetSceneList': return ok({ currentProgramSceneName: s.scene, scenes: s.scenes.slice().reverse().map(function (n, i) { return { sceneName: n, sceneIndex: i }; }) });
      case 'GetInputList': return ok({ inputs: Object.keys(s.inputs).map(function (n) { return { inputName: n, inputKind: n === 'Mic/Aux' ? 'wasapi_input_capture' : 'wasapi_output_capture' }; }).concat([{ inputName: 'Webcam', inputKind: 'dshow_input' }]) });
      case 'GetInputMute': return s.inputs[d.inputName] === undefined ? { ok: false, error: 'No source was found' } : ok({ inputMuted: s.inputs[d.inputName] });
      case 'ToggleInputMute': s.inputs[d.inputName] = !s.inputs[d.inputName]; this.event('InputMuteStateChanged', { inputName: d.inputName, inputMuted: s.inputs[d.inputName] }); return ok({ inputMuted: s.inputs[d.inputName] });
      case 'SetInputMute': s.inputs[d.inputName] = !!d.inputMuted; return ok();
      case 'GetStreamStatus': return ok({ outputActive: s.stream, outputReconnecting: false, outputDuration: duration(s.stream), outputCongestion: 0.02, outputSkippedFrames: 3 });
      case 'StartStream': if (s.stream) return { ok: false, error: 'Stream already active' }; s.stream = true; s.start = Date.now() - 65000; return ok();
      case 'StopStream': s.stream = false; return ok();
      case 'ToggleStream': s.stream = !s.stream; s.start = Date.now(); return ok({ outputActive: s.stream });
      case 'GetRecordStatus': return ok({ outputActive: s.record, outputPaused: false, outputDuration: duration(s.record) });
      case 'ToggleRecord': s.record = !s.record; s.start = s.start || Date.now(); return ok();
      case 'GetStats': return ok({ activeFps: 60, cpuUsage: 4.2, renderSkippedFrames: 0, outputSkippedFrames: 3 });
      case 'GetVirtualCamStatus': return ok({ outputActive: s.vcam });
      case 'ToggleVirtualCam': s.vcam = !s.vcam; return ok();
      case 'SaveReplayBuffer': return { ok: false, error: 'Replay buffer is not active' };
      case 'SetCurrentProgramScene':
        if (s.scenes.indexOf(d.sceneName) < 0) return { ok: false, error: 'No source was found by the name of ' + d.sceneName };
        s.scene = d.sceneName; this.event('CurrentProgramSceneChanged', { sceneName: s.scene }); return ok();
      case 'GetSourceScreenshot': return ok({ imageData: PIXEL });
      default: return { ok: false, error: 'Unknown request ' + type };
    }
  }
}

module.exports = { FakeObs: FakeObs };
