const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-sync-'));
process.env.DOCK_DATA_DIR = path.join(TMP, 'data');
process.env.LOG_LEVEL = 'error';
const config = require('../server/config');
const todo = require('../official-plugins/todo/lib/todo');
const sync = require('../official-plugins/todo/lib/todosync');

const realGet = config.get;
config.get = function (name) {
  const v = realGet.apply(this, arguments);
  if (name !== 'services') return v;
  const out = Object.assign({}, v);
  out.todo = Object.assign({}, out.todo, { sync: Object.assign({}, (out.todo || {}).sync, { enabled: true, remote: 'origin', branch: 'dock-todo' }) });
  return out;
};

function it(id, text, done, note) { return { id: id, text: text, done: !!done, note: note || 'n1', group: 'TODO:' }; }
function snap(items) { return { groups: [{ id: 'n1', title: 'TODO:' }], items: items }; }

test('fusione: modifiche dell\'altro PC (aggiunte, spunte, cancellazioni)', function () {
  const base = snap([it('a', 'Spesa'), it('b', 'Palestra'), it('c', 'Blender')]);
  const local = snap([it('a', 'Spesa'), it('b', 'Palestra'), it('c', 'Blender'), it('d', 'Nuova qui')]);
  const remote = snap([it('a', 'Spesa', true), it('c', 'Blender'), it('e', 'Nuova là')]);
  const ops = sync._merge(base, local, remote).map(function (o) { return o.type + ':' + o.item.id; }).sort();
  assert.deepStrictEqual(ops, ['add:e', 'remove:b', 'toggle:a']);
});

test('fusione: se cambia da entrambe le parti vince questo PC', function () {
  const base = snap([it('a', 'Spesa'), it('b', 'Palestra')]);
  const local = snap([it('a', 'Spesa', true), it('b', 'Palestra modificata')]);
  const remote = snap([it('a', 'Spesa', false), it('c', 'x')]);
  const ops = sync._merge(base, local, remote).map(function (o) { return o.type + ':' + o.item.id; });
  assert.deepStrictEqual(ops, ['add:c']);
});

function git(cwd, args, input) {
  return execFileSync('git', args, { cwd: cwd, input: input, encoding: 'utf8', env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' }) });
}

test('giro completo: questo PC e "l\'altro PC" si scambiano i TODO', async function () {
  const bare = path.join(TMP, 'github.git');
  const here = path.join(TMP, 'here');
  const other = path.join(TMP, 'other');
  git(TMP, ['init', '--bare', '-q', bare]);
  git(TMP, ['clone', '-q', bare, here]);
  git(TMP, ['clone', '-q', bare, other]);
  [here, other].forEach(function (d) {
    git(d, ['config', 'user.name', 'Test']);
    git(d, ['config', 'user.email', 'test@example.com']);
  });
  sync._setRepo(here);
  todo._setSource('local');
  todo.replaceLocal(snap([it('a', 'Spesa'), it('b', 'Palestra')]));

  let st = await sync.sync();
  assert.strictEqual(st.ok, true, st.message);
  git(other, ['fetch', '-q', 'origin', 'dock-todo']);
  let shared = JSON.parse(git(other, ['show', 'FETCH_HEAD:todo.json']));
  assert.deepStrictEqual(shared.items.map(function (i) { return i.text; }), ['Spesa', 'Palestra']);

  shared.items = [Object.assign(shared.items[0], { done: true }), it('z', 'Dal Linux')];
  git(other, ['checkout', '-q', '-B', 'dock-todo', 'FETCH_HEAD']);
  fs.writeFileSync(path.join(other, 'todo.json'), JSON.stringify(shared));
  git(other, ['commit', '-q', '-am', 'da linux']);
  git(other, ['push', '-q', 'origin', 'dock-todo']);

  await todo.add('Da Windows', 'normal', 'n1');
  st = await sync.sync();
  assert.strictEqual(st.ok, true, st.message);
  const texts = todo.list().map(function (i) { return (i.done ? '[x] ' : '') + i.text; }).sort();
  assert.deepStrictEqual(texts, ['Da Windows', 'Dal Linux', '[x] Spesa']);

  git(other, ['fetch', '-q', 'origin', 'dock-todo']);
  shared = JSON.parse(git(other, ['show', 'FETCH_HEAD:todo.json']));
  assert.deepStrictEqual(shared.items.map(function (i) { return i.text; }).sort(), ['Da Windows', 'Dal Linux', 'Spesa']);
  assert.ok(shared.groups.length === 1 && shared.groups[0].title === 'TODO:');

  const before = git(other, ['ls-remote', 'origin', 'dock-todo']);
  await sync.sync();
  assert.strictEqual(git(other, ['ls-remote', 'origin', 'dock-todo']), before);
});

test('primo giro su un PC nuovo: adotta la lista condivisa e salva la vecchia', async function () {
  fs.rmSync(path.join(process.env.DOCK_DATA_DIR, 'todo-sync.json'));
  todo.replaceLocal(snap([it('old', 'Vecchia lista locale')]));
  const st = await sync.sync();
  assert.strictEqual(st.ok, true, st.message);
  assert.deepStrictEqual(todo.list().map(function (i) { return i.text; }).sort(), ['Da Windows', 'Dal Linux', 'Spesa']);
  assert.ok(fs.existsSync(path.join(process.env.DOCK_DATA_DIR, 'todo.prima-della-sync.json')));
});

test('di default la sync è spenta (le TODO non finiscono su una repo pubblica)', function () {
  const d = config.parseJson(fs.readFileSync(path.join(__dirname, '..', 'config', 'defaults', 'services.json'), 'utf8'));
  assert.strictEqual(d.todo.sync.enabled, false);
});
