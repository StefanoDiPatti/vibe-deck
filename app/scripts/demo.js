'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-demo-'));
fs.mkdirSync(path.join(tmp, 'config'));
fs.mkdirSync(path.join(tmp, 'data'));
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.DOCK_TOKEN = process.env.DOCK_TOKEN || 'DEMO1234';
process.env.DOCK_NO_QR = '1';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
os.hostname = function () { return 'MY-PC'; };
os.networkInterfaces = function () {
  return { Ethernet: [{ address: '192.168.1.50', netmask: '255.255.255.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: false, cidr: '192.168.1.50/24' }] };
};
require('../server/paths').ENV_FILE = path.join(tmp, 'demo.env');
const PORT = parseInt(process.env.DEMO_PORT, 10) || 8790;
process.env.PORT = String(PORT);

const express = require('express');
const { app: dock } = require('../server/index.js');
const auth = require('../server/auth');

const started = Date.now();
const ok = function (res, data) { res.json({ ok: true, data: data }); };
const H = 3600 * 1000;

function system() {
  const t = (Date.now() - started) / 1000;
  const wave = function (base, amp, speed) { return Math.round(base + amp * Math.sin(t / speed)); };
  return {
    hostname: 'MY-PC',
    cpu: { usage: wave(18, 6, 7), temp: 52, cores: 16, model: 'Desktop CPU' },
    ram: { usedGb: 12.4, totalGb: 32, usage: 39 },
    gpu: { name: 'Desktop GPU', usage: wave(24, 8, 5), temp: 48, memUsedGb: 2.1, memTotalGb: 8 },
    net: { downMbps: 12.6, upMbps: 1.4, downKbps: 12600, upKbps: 1400, type: 'ethernet', name: 'Ethernet', signal: null },
    uptimeSeconds: 5 * 3600 + 1234,
    at: Date.now()
  };
}

function media() {
  const duration = 214;
  return {
    supported: true, active: true, bridge: true,
    appName: 'Music', status: 'playing',
    title: 'Neon Skyline', artist: 'The Midnight Drives', album: 'Night Shift',
    duration: duration, position: (62 + (Date.now() - started) / 1000) % duration, canSeek: true,
    volume: 0.7, muted: false, canVolume: true,
    shuffle: true, canShuffle: true, repeat: 'all', canRepeat: true,
    hasArt: true, key: 'demo-art', canQueue: true, queueKey: 'demo-queue'
  };
}

const QUEUE = [
  ['Neon Skyline', 'The Midnight Drives', 214, true],
  ['Glass Highways', 'Paper Satellites', 198],
  ['After Hours', 'Luna Avenue', 241],
  ['Static Hearts', 'The Midnight Drives', 187],
  ['Ocean Radio', 'Coastline Club', 226],
  ['Slow Lights', 'Paper Satellites', 205]
];

const ART = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5c7a"/><stop offset=".55" stop-color="#7a3cff"/><stop offset="1" stop-color="#1b1f4b"/></linearGradient></defs>' +
  '<rect width="400" height="400" fill="url(#g)"/><circle cx="200" cy="230" r="90" fill="#ffd23f" opacity=".9"/>' +
  '<g fill="#1b1f4b">' + [0, 1, 2, 3, 4, 5].map(function (i) { return '<rect x="100" y="' + (240 + i * 14) + '" width="200" height="' + (4 + i) + '"/>'; }).join('') + '</g>' +
  '<path d="M0 330 L120 250 L190 300 L280 230 L400 320 L400 400 L0 400Z" fill="#0d0f2a"/></svg>';

const NOTES = [{ id: 'n1', title: 'TODO:' }, { id: 'n2', title: 'DA COMPRARE:' }, { id: 'n3', title: 'IDEE:' }];
const todo = [
  ['n1', 'Aggiornare i driver della scheda video', false, 'high'],
  ['n1', 'Registrare il tutorial per il canale', false, 'normal'],
  ['n1', 'Backup delle foto sul NAS', true, 'normal'],
  ['n1', 'Rispondere alle email del progetto', false, 'normal'],
  ['n2', 'Cavo USB-C da 2 m', false, 'normal'],
  ['n2', 'Supporto per il tablet', false, 'normal'],
  ['n3', 'Pagina con i comandi di OBS', false, 'normal'],
  ['n3', 'Tema scuro per il blog', false, 'normal']
].map(function (t, i) {
  const g = NOTES.filter(function (n) { return n.id === t[0]; })[0];
  return { group: g.title, id: t[0] + ':' + i, text: t[1], label: '', done: t[2], priority: t[3], note: t[0] };
});

function session(id, title, project, ago, busy) {
  return { id: 'local_demo' + id, cli: 'demo' + id, title: title, cwd: '/home/demo/' + project, project: project, permissionMode: 'auto', updatedAt: Date.now() - ago, busy: !!busy, queued: false };
}

const demo = express.Router();
demo.use('/api', function (req, res, next) {
  if (req.path === '/health' || req.path === '/pair' || req.path.indexOf('/control/') === 0) return next();
  if (req.path === '/media/art') return next();
  auth.requireToken(req, res, next);
});
const DEMO_APPS = { vscode: true, discord: true, claude_desktop: true, spotify: false };
require('../server/services/system').get = system;
const appsService = require('../server/services/apps');
const realRunning = appsService.running;
appsService.running = async function () { return Object.assign({}, await realRunning(), DEMO_APPS); };

demo.get('/api/state', function (req, res, next) {
  const json = res.json.bind(res);
  res.json = function (body) {
    if (body && body.data) Object.assign(body.data, { system: system(), media: media(), apps: Object.assign({}, body.data.apps, DEMO_APPS) });
    return json(body);
  };
  next();
});
demo.get('/api/media/art', function (req, res) { res.type('image/svg+xml').send(ART); });
demo.get('/api/media/queue', function (req, res) {
  ok(res, { available: true, items: QUEUE.map(function (q, i) { return { id: 'q' + i, title: q[0], artist: q[1], duration: q[2], current: !!q[3] }; }) });
});
demo.get('/api/plugins/todo', function (req, res) {
  ok(res, { items: todo, source: 'memo', notes: NOTES, voiceServer: false, sync: { enabled: false, ok: null, at: 0, message: '' } });
});
demo.post('/api/plugins/todo/toggle', express.json(), function (req, res) {
  todo.forEach(function (t) { if (t.id === (req.body || {}).id) t.done = !t.done; });
  ok(res, { items: todo, source: 'memo', notes: NOTES, voiceServer: false, sync: { enabled: false, ok: null, at: 0, message: '' } });
});
demo.get('/api/plugins/claude/desktop', function (req, res) {
  ok(res, {
    available: true, appUi: true,
    sections: [
      { id: 's1', name: 'Lavoro', sessions: [session(1, 'Refactoring API ordini', 'shop-api', 0.2 * H, true), session(2, 'Test end-to-end checkout', 'shop-web', 3 * H)] },
      { id: 's2', name: 'Progetti personali', sessions: [session(3, 'Stream Deck: pagina audio', 'vibe-deck', 26 * H), session(4, 'Blog: nuovo tema', 'blog', 50 * H), session(5, 'Script backup foto', 'scripts', 72 * H)] }
    ]
  });
});
demo.get('/api/plugins/claude/usage', function (req, res) {
  ok(res, { ok: true, fiveHour: { percent: 34, resetsAt: new Date(Date.now() + 2.5 * H).toISOString() }, sevenDay: { percent: 58, resetsAt: new Date(Date.now() + 60 * H).toISOString() }, models: [], at: Date.now() });
});
demo.get('/api/plugins/claude/chats', function (req, res) { ok(res, []); });

const MAIL_ACCOUNTS = [
  { id: 'demo1', label: 'Gmail', provider: 'gmail', email: 'mario.rossi@example.com', unread: 3, status: 'ok', error: '' },
  { id: 'demo2', label: 'Lavoro', provider: 'outlook', email: 'mario@studio.example', unread: 0, status: 'ok', error: '' }
];
const MAILS = [
  ['Laura Bianchi', 'laura@example.com', 'Foto del weekend', 0.4, false],
  ['GitHub', 'noreply@github.example', 'La tua pull request è stata unita', 2, false],
  ['Negozio Online', 'ordini@shop.example', 'Il tuo ordine è in consegna', 5, false],
  ['Marco Verdi', 'marco@example.com', 'Riunione di giovedì', 26, true],
  ['Newsletter Musica', 'news@music.example', 'Le uscite della settimana', 50, true]
].map(function (m, i) { return { uid: 100 + i, date: new Date(Date.now() - m[3] * H).toISOString(), from: { name: m[0], address: m[1] }, subject: m[2], seen: m[4] }; });
demo.get('/api/plugins/mail', function (req, res) { ok(res, { accounts: MAIL_ACCOUNTS }); });
demo.get('/api/plugins/mail/list', function (req, res) {
  const a = MAIL_ACCOUNTS.filter(function (x) { return x.id === req.query.account; })[0] || MAIL_ACCOUNTS[0];
  const list = a.id === 'demo1' ? MAILS : [];
  ok(res, { account: a, unread: list.filter(function (m) { return !m.seen; }).length, total: list.length, messages: list });
});
demo.get('/api/plugins/mail/message', function (req, res) {
  const m = MAILS.filter(function (x) { return String(x.uid) === String(req.query.uid); })[0] || MAILS[0];
  ok(res, { subject: m.subject, from: m.from, date: m.date, text: 'Ciao!\n\nQuesto è un messaggio di esempio della demo di Vibe Deck.\n\nA presto', attachments: [], truncated: false });
});
demo.post('/api/plugins/mail/open', function (req, res) { ok(res, { message: 'Thunderbird aperto sul PC' }); });

const AUDIO = {
  devices: [
    { flow: 'out', id: 'o1', name: 'Altoparlanti', default: true, volume: 62, mute: false },
    { flow: 'out', id: 'o2', name: 'Cuffie USB', default: false, volume: 80, mute: false },
    { flow: 'out', id: 'o3', name: 'Monitor HDMI', default: false, volume: 100, mute: false },
    { flow: 'in', id: 'i1', name: 'Microfono USB', default: true, volume: 90, mute: false },
    { flow: 'in', id: 'i2', name: 'Microfono della webcam', default: false, volume: 70, mute: false }
  ],
  apps: [
    { id: 'p1', pid: 101, process: 'music', name: 'Music', volume: 80, mute: false, active: true, device: 'Altoparlanti' },
    { id: 'p2', pid: 102, process: 'browser', name: 'Browser', volume: 100, mute: false, active: false, device: 'Altoparlanti' },
    { id: 'p3', pid: 103, process: 'chat', name: 'Chat vocale', volume: 70, mute: false, active: true, device: 'Cuffie USB' },
    { id: 'p4', pid: 0, process: 'system', name: 'Suoni di sistema', volume: 50, mute: false, active: false, device: 'Altoparlanti' }
  ]
};
demo.get('/api/plugins/audio', function (req, res) { ok(res, AUDIO); });
const demoActions = [];
const shapesRunner = require('../server/shapes').runner;
const realExecute = shapesRunner.execute;
shapesRunner.execute = async function (action) {
  demoActions.push(action);
  if (/^audio\./.test(String(action.type))) return realExecute(action);
  return { message: 'Demo: ' + action.type };
};
demo.get('/api/demo/actions', function (req, res) { ok(res, demoActions); });
if (process.env.DEMO_DRY === '1') {
  const handlers = require('../server/actions').HANDLERS;
  Object.keys(handlers).forEach(function (type) {
    if (/^audio\./.test(type)) return;
    handlers[type] = async function (action) {
      demoActions.push(Object.assign({ type: type }, action));
      return { message: 'Demo: ' + type };
    };
  });
}
const demoMixer = require('../official-plugins/audio/lib/mixer');
demoMixer.state = async function () { return AUDIO; };
demoMixer.device = async function (id, body) {
  const dev = AUDIO.devices.filter(function (d) { return d.id === id; })[0];
  if (dev && typeof body.volume === 'number') dev.volume = body.volume;
  return AUDIO;
};

demo.get('/api/plugins/github', function (req, res) {
  const repo = function (name, prs, issues, ci, deploy, msg, ago) {
    const run = function (c) { return c ? { status: 'completed', conclusion: c, name: 'CI', url: 'https://github.com/' } : null; };
    return { name: name, full: 'demo/' + name, url: 'https://github.com/', private: false, stars: 12, prs: prs, issues: issues, pushedAt: new Date(Date.now() - ago * H).toISOString(),
      ci: run(ci), deploy: deploy ? { status: 'completed', conclusion: deploy, name: 'Deploy', url: 'https://github.com/', at: new Date().toISOString() } : null,
      commit: { message: msg, author: 'Mario', date: new Date(Date.now() - ago * H).toISOString(), url: 'https://github.com/' } };
  };
  const repos = [repo('shop-web', 2, 3, 'success', 'success', 'Carrello: pagamento con un tocco', 1), repo('shop-api', 1, 0, 'failure', null, 'Ordini: filtro per data', 5),
    repo('blog', 0, 1, 'success', 'success', 'Nuovo tema scuro', 30), repo('scripts', 0, 0, null, null, 'Backup foto: compressione', 70)];
  ok(res, { configured: true, authenticated: true, repos: repos, totals: { prs: 3, issues: 4, failing: 1, deployFailing: 0 }, error: null, updatedAt: Date.now() });
});

const MONITORS = [
  { id: 'm1', primary: true, x: 0, y: 0, w: 2560, h: 1440, work: { x: 0, y: 0, w: 2560, h: 1400 }, name: 'Monitor 27"', n: 1, portrait: false },
  { id: 'm2', primary: false, x: 2560, y: 0, w: 1920, h: 1080, work: { x: 2560, y: 0, w: 1920, h: 1040 }, name: 'Monitor 24"', n: 2, portrait: false }
];
const WINDOWS = [
  { id: 'w1', pid: 201, process: 'browser', state: 'max', monitor: 'm1', x: 0, y: 0, w: 2560, h: 1400, active: true, title: 'Documentazione - Browser' },
  { id: 'w2', pid: 202, process: 'code', state: 'normal', monitor: 'm2', x: 2560, y: 0, w: 1920, h: 1040, active: false, title: 'shop-web - Editor' },
  { id: 'w3', pid: 203, process: 'music', state: 'min', monitor: 'm2', x: 2600, y: 100, w: 900, h: 700, active: false, title: 'Music' }
];
demo.get('/api/plugins/screens/windows', function (req, res) { ok(res, WINDOWS); });
demo.get('/api/plugins/screens', function (req, res, next) {
  const json = res.json.bind(res);
  res.json = function (body) { if (body && body.data) Object.assign(body.data, { monitors: MONITORS, target: null }); return json(body); };
  next();
});
demo.get('/api/plugins/screens/desktops', function (req, res) {
  ok(res, { supported: true, max: 3, monitors: MONITORS.map(function (m) { return { id: m.id, n: m.n, x: m.x, y: m.y, w: m.w, h: m.h }; }),
    desktops: [{ id: 'd1', n: 1, name: 'Lavoro', current: true, windows: WINDOWS.slice(0, 2) }, { id: 'd2', n: 2, name: 'Svago', current: false, windows: [WINDOWS[2]] }] });
});

demo.get('/api/plugins/discord/state', function (req, res) {
  ok(res, { status: 'ready', message: '', configured: true, user: { id: 'u1', name: 'Mario' }, voice: { mute: false, deaf: false, video: false, stream: false }, media: true,
    channel: { id: 'c1', name: 'Salotto', guild_id: 'g1', guild: 'Amici', members: [
      { id: 'u1', name: 'Mario', me: true, speaking: true, mute: false, deaf: false },
      { id: 'u2', name: 'Laura', speaking: false, mute: false, deaf: false },
      { id: 'u3', name: 'Marco', speaking: false, mute: true, deaf: false }] } });
});
demo.get('/api/plugins/discord/guilds', function (req, res) { ok(res, [{ id: 'g1', name: 'Amici', icon: null }, { id: 'g2', name: 'Studio', icon: null }]); });
demo.get('/api/plugins/discord/channels', function (req, res) {
  ok(res, [{ id: 'c1', name: 'Salotto', type: 'voice', members: 3 }, { id: 'c2', name: 'Giochi', type: 'voice', members: 0 }]);
});

demo.get('/api/plugins/viber/state', function (req, res) {
  ok(res, { online: true, panels: ['terminal', 'git', 'browser', 'chat', 'tasks', 'files'], project: '/home/demo/shop-web', name: 'shop-web', active: 'chat', open: ['terminal', 'git', 'browser', 'chat', 'tasks', 'files'] });
});
demo.get('/api/plugins/viber/projects', function (req, res) {
  ok(res, { projects: [
    { path: '/home/demo/shop-web', name: 'shop-web', active: true, state: 'working', agents: 1, title: 'Pagamento con un tocco' },
    { path: '/home/demo/shop-api', name: 'shop-api', active: false, state: 'question', agents: 1, title: 'Filtro ordini per data' },
    { path: '/home/demo/blog', name: 'blog', active: false, state: 'completed', agents: 1, title: 'Tema scuro' }] });
});
demo.get('/api/plugins/viber/tasks', function (req, res) {
  ok(res, { project: 'shop-web', tasks: [{ id: 't1', text: 'Pagamento con un tocco', status: 'in_progress', branch: 'feature/pagamento', steps: [
    { text: 'Pulsante nel carrello', status: 'done' }, { text: 'Conferma con impronta', status: 'in_progress' }, { text: 'Test e PR', status: 'open' }] }] });
});
demo.get('/api/plugins/ollama/models', function (req, res) { ok(res, { running: true, models: [{ name: 'llama3.2:3b', size: 2 }, { name: 'qwen2.5-coder:7b', size: 4.7 }], error: '' }); });

function shotScript(q, panel) {
  const set = function (k, v) { return 'localStorage.setItem(' + JSON.stringify(k) + ',' + JSON.stringify(v) + ');'; };
  let js = 'try{localStorage.clear();';
  if (panel) js += q.theme ? set('dock-panel-theme', String(q.theme)) : '';
  else {
    js += set('dock:token', JSON.stringify(process.env.DOCK_TOKEN));
    if (q.page) js += set('dock:page', JSON.stringify(String(q.page)));
    if (q.theme) js += set('dock:theme', JSON.stringify(String(q.theme)));
    if (q.lang) js += set('dock:lang', JSON.stringify(String(q.lang)));
  }
  return '<script>' + js + '}catch(e){}</script>';
}
demo.get(['/', '/index.html'], function (req, res, next) {
  if (!req.query.shot) return next();
  const send = res.send.bind(res);
  res.send = function (html) { return send(String(html).replace('<head>', function (m) { return m + shotScript(req.query, false); })); };
  next();
});
demo.get(['/control', '/control/'], function (req, res, next) {
  if (!req.query.shot) return next();
  const html = fs.readFileSync(path.join(__dirname, '..', 'control', 'index.html'), 'utf8');
  res.type('html').send(html.replace('<head>', function (m) { return m + shotScript(req.query, true); }));
});

demo.get('/api/control/info', function (req, res, next) {
  const json = res.json.bind(res);
  res.json = function (body) {
    if (body && body.data) {
      body.data.mail = { source: 'thunderbird', download: 'https://www.thunderbird.net/', installed: true, profile: true, exe: true,
        accounts: MAIL_ACCOUNTS.map(function (a) { return Object.assign({ host: 'imap.example.com', shown: true, offline: false }, a); }) };
      body.data.discord = Object.assign({}, body.data.discord, { status: 'ready', configured: true, clientId: '123456789012345678', hasSecret: true, authError: '', user: { id: 'u1', name: 'Mario' }, message: '' });
    }
    return json(body);
  };
  next();
});

const server = express();
server.use(demo);
server.use(dock);
server.listen(PORT, '127.0.0.1', function () {
  console.log('Vibe Deck DEMO (dati finti): http://127.0.0.1:' + PORT + '/?t=' + process.env.DOCK_TOKEN);
  console.log('Pannello: http://127.0.0.1:' + PORT + '/control      Ctrl+C per fermare.');
});

function stop() {
  try { require('../server/platform').shutdown(); } catch (e) { }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
