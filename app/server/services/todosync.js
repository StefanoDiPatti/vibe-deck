const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const paths = require('../paths');
const config = require('../config');
const log = require('../log');
const todo = require('./todo');

const STATE = path.join(paths.DATA_DIR, 'todo-sync.json');
const FILE_NAME = 'todo.json';
const LOCAL_REF = 'refs/dock/todo-remote';

let running = null;
let again = false;
let timer = null;
let debounce = null;
let status = { enabled: false, ok: null, at: 0, message: '' };

function settings() {
  const s = ((config.get('services') || {}).todo || {}).sync || {};
  return {
    enabled: s.enabled === true,
    remote: /^[\w.-]+$/.test(s.remote || '') ? s.remote : 'origin',
    branch: /^[\w./-]+$/.test(s.branch || '') ? s.branch : 'dock-todo',
    intervalSec: Math.max(30, parseInt(s.intervalSec, 10) || 120)
  };
}

function git(args, input, cwd) {
  return new Promise(function (resolve, reject) {
    const child = execFile('git', args, {
      cwd: cwd || paths.ROOT,
      timeout: 45000,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
      env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', LC_ALL: 'C', LANGUAGE: 'C' })
    }, function (err, stdout, stderr) {
      if (err) return reject(Object.assign(new Error(String(stderr || err.message).trim().split('\n').slice(-1)[0] || 'git fallito'), { stderr: String(stderr || '') }));
      resolve(String(stdout));
    });
    if (input !== undefined) child.stdin.end(input);
  });
}

let rootCache;
async function repoRoot() {
  if (rootCache !== undefined) return rootCache;
  try { rootCache = (await git(['rev-parse', '--show-toplevel'])).trim() || null; } catch (e) { rootCache = null; }
  return rootCache;
}

async function fetchRemote(root, s) {
  try {
    await git(['fetch', '--quiet', '--no-tags', s.remote, '+refs/heads/' + s.branch + ':' + LOCAL_REF], undefined, root);
  } catch (e) {
    if (/couldn't find remote ref|not found|no such ref/i.test(e.stderr || e.message)) return null;
    throw e;
  }
  const commit = (await git(['rev-parse', LOCAL_REF], undefined, root)).trim();
  let data = { groups: [], items: [] };
  try { data = JSON.parse(await git(['show', commit + ':' + FILE_NAME], undefined, root)); } catch (e) { }
  return { commit: commit, data: normalize(data) };
}

async function pushRemote(root, s, data, parent) {
  const body = JSON.stringify(Object.assign({ updated: new Date().toISOString(), from: os.hostname() }, data), null, 2) + '\n';
  const blob = (await git(['hash-object', '-w', '--stdin'], body, root)).trim();
  const tree = (await git(['mktree'], '100644 blob ' + blob + '\t' + FILE_NAME + '\n', root)).trim();
  const args = ['commit-tree', tree, '-m', 'TODO da ' + os.hostname()];
  if (parent) args.push('-p', parent);
  const commit = (await git(args, undefined, root)).trim();
  await git(['push', '--quiet', s.remote, commit + ':refs/heads/' + s.branch], undefined, root);
  await git(['update-ref', LOCAL_REF, commit], undefined, root).catch(function () {});
  return commit;
}

function normalize(snap) {
  return {
    groups: (snap.groups || []).filter(function (g) { return g && g.id; }).map(function (g) { return { id: String(g.id), title: String(g.title || '') }; }),
    items: (snap.items || []).filter(function (i) { return i && i.id && i.text; }).map(function (i) {
      return { id: String(i.id), text: String(i.text), done: !!i.done, note: String(i.note || ''), group: String(i.group || '') };
    })
  };
}

function same(a, b) { return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b)); }

function byId(list) {
  const m = {};
  list.forEach(function (i) { m[i.id] = i; });
  return m;
}

function merge(base, local, remote) {
  const B = byId(base.items), L = byId(local.items), ops = [];
  local.items.forEach(function (it) {
    const b = B[it.id], r = byId(remote.items)[it.id];
    if (!r) {
      if (b && b.text === it.text && b.done === it.done) ops.push({ type: 'remove', item: it });
      return;
    }
    if (!b) return;
    if (it.done === b.done && r.done !== b.done) ops.push({ type: 'toggle', item: r });
    if (it.text === b.text && r.text !== b.text) ops.push({ type: 'text', item: r });
  });
  remote.items.forEach(function (r) {
    if (!L[r.id] && !B[r.id]) ops.push({ type: 'add', item: r });
  });
  return ops;
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return null; }
}
function saveState(st) {
  if (!fs.existsSync(paths.DATA_DIR)) fs.mkdirSync(paths.DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE + '.tmp', JSON.stringify(st, null, 2));
  fs.renameSync(STATE + '.tmp', STATE);
}

async function syncOnce() {
  const s = settings();
  status.enabled = s.enabled;
  if (!s.enabled) return status;
  const root = await repoRoot();
  if (!root) { status = { enabled: true, ok: false, at: Date.now(), message: 'La dock non è in una repo git: niente sincronizzazione' }; return status; }

  for (let attempt = 0; attempt < 3; attempt++) {
    const st = loadState();
    const remote = await fetchRemote(root, s);
    let local = normalize(todo.snapshot());
    let applied = 0;

    if (remote) {
      if (!st || !st.base) {
        if (todo.source() === 'local') {
          const backup = path.join(paths.DATA_DIR, 'todo.prima-della-sync.json');
          if (!fs.existsSync(backup)) fs.writeFileSync(backup, JSON.stringify(local, null, 2));
          todo.replaceLocal(remote.data);
          applied = remote.data.items.length;
        } else {
          const have = {};
          local.items.forEach(function (i) { have[i.group.toLowerCase() + '|' + i.text.toLowerCase()] = true; });
          for (const it of remote.data.items) {
            if (have[it.group.toLowerCase() + '|' + it.text.toLowerCase()] || byId(local.items)[it.id]) continue;
            await todo.applyRemote({ type: 'add', item: it });
            applied++;
          }
        }
      } else {
        const base = normalize(st.base);
        const ops = merge(base, local, remote.data);
        if (todo.source() === 'local') todo.setLocalGroups(remote.data.groups.concat(local.groups.filter(function (g) {
          return !remote.data.groups.some(function (r) { return r.id === g.id; });
        })));
        for (const op of ops) {
          try { await todo.applyRemote(op); applied++; } catch (e) { log.warn('todo-sync', op.type + ' "' + op.item.text + '": ' + e.message); }
        }
      }
      if (applied) local = normalize(todo.snapshot());
    }

    let commit = remote ? remote.commit : null;
    if (!remote || !same(local, remote.data)) {
      try {
        commit = await pushRemote(root, s, local, remote ? remote.commit : null);
      } catch (e) {
        if (/rejected|non-fast-forward|fetch first/i.test(e.stderr || e.message) && attempt < 2) continue;
        throw e;
      }
    }
    saveState({ base: local, commit: commit, at: new Date().toISOString() });
    status = { enabled: true, ok: true, at: Date.now(), message: applied ? applied + ' modifiche dall\'altro PC' : 'aggiornati', branch: s.branch };
    if (applied) log.info('todo-sync', applied + ' modifiche ricevute da GitHub');
    return status;
  }
  return status;
}

function sync() {
  if (running) { again = true; return running; }
  running = syncOnce().catch(function (e) {
    status = { enabled: true, ok: false, at: Date.now(), message: e.message };
    log.warn('todo-sync', e.message);
    return status;
  }).then(function (r) {
    running = null;
    if (again) { again = false; return sync(); }
    return r;
  });
  return running;
}

function start() {
  if (timer) return;
  const s = settings();
  if (!s.enabled) return;
  todo.onChange(function () {
    clearTimeout(debounce);
    debounce = setTimeout(sync, 4000);
  });
  setTimeout(sync, 5000);
  timer = setInterval(sync, s.intervalSec * 1000);
  if (timer.unref) timer.unref();
}

function stop() { clearInterval(timer); clearTimeout(debounce); timer = null; }

module.exports = {
  start: start, stop: stop, sync: sync, status: function () { return status; },
  _merge: merge, _normalize: normalize,
  _setRepo: function (dir) { rootCache = dir; }
};
