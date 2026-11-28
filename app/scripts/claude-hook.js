'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const kind = process.argv[2] || '';
const dataDir = process.env.DOCK_DATA_DIR || path.join(__dirname, '..', 'data');

function readJson(name) {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8')); } catch (e) { return null; }
}

function baseUrl() {
  const runtime = readJson('runtime.json');
  const urls = runtime && Array.isArray(runtime.urls) ? runtime.urls : [];
  const port = urls[0] ? (/:(\d+)\/?$/.exec(urls[0]) || [])[1] : '';
  return { host: '127.0.0.1', port: parseInt(port, 10) || parseInt(process.env.PORT, 10) || 8787 };
}

function readStdin() {
  return new Promise(function (resolve) {
    let text = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (d) { text += d; });
    process.stdin.on('end', function () { resolve(text); });
    process.stdin.on('error', function () { resolve(text); });
    setTimeout(function () { resolve(text); }, 3000).unref();
  });
}

function post(route, body, timeoutMs) {
  const settings = readJson('webhooks.json');
  const base = baseUrl();
  return new Promise(function (resolve) {
    if (!settings || !settings.key) return resolve(null);
    const payload = JSON.stringify(body || {});
    const req = http.request({ host: base.host, port: base.port, path: '/hook/' + settings.key + route, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: timeoutMs }, function (res) {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', function (d) { text += d; });
      res.on('end', function () { try { resolve(JSON.parse(text)); } catch (e) { resolve(null); } });
    });
    req.on('timeout', function () { req.destroy(); resolve(null); });
    req.on('error', function () { resolve(null); });
    req.end(payload);
  });
}

async function main() {
  let input = {};
  try { input = JSON.parse(await readStdin() || '{}'); } catch (e) { input = {}; }
  if (kind === 'permission') {
    const answer = await post('/permission', input, 100000);
    const decision = answer && answer.data && answer.data.decision;
    if (decision === 'allow') {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } }));
    } else if (decision === 'deny') {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: 'Negato dal tablet (Vibe Deck)' } } }));
    }
  } else if (kind === 'waiting') {
    await post('/event/claude-waiting', { session: input.session_id || '', message: input.message || '' }, 4000);
  } else if (kind === 'done') {
    await post('/event/claude-done', { session: input.session_id || '' }, 4000);
  }
}

main().then(function () { process.exit(0); }, function () { process.exit(0); });
