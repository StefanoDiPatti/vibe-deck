'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const STATE = process.env.FAKE_VIBER_STATE;
function world() { return JSON.parse(fs.readFileSync(STATE, 'utf8')); }
function log(entry) { fs.appendFileSync(STATE + '.log', JSON.stringify(entry) + '\n'); }
function norm(p) { return String(p).replace(/[\\/]+$/, ''); }
function text(data, isError) {
  return { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data) }], isError: !!isError };
}

const agents = process.argv.indexOf('--agents') >= 0;
const here = norm(process.cwd());

function call(name, args) {
  const w = world();
  log({ tool: name, args: args, cwd: here, agents: agents });
  if (name === 'viber_agent_projects') return text({ projects: w.projects, machine: 'pc' });
  if (name === 'viber_agent_list') return text(w.agents);
  if (name === 'viber_task_projects') return text({ projects: w.projects });
  if (name === 'viber_task_list') return text({ tasks: (w.tasks[args.projectPath] || []) });
  const inside = w.projects.filter(function (p) { return here === norm(p) || here.indexOf(norm(p) + path.sep) === 0; })[0];
  if (!inside) return text('Error: No Viber window shows ' + here + ' (open projects: ' + w.projects.join(', ') + '). Skip the UI action.', true);
  if (norm(inside) !== norm(w.shown)) return text('Error: Your worktree ' + here + ' is open in Viber but not on screen (showing: ' + w.shown + '). Skip the UI action.', true);
  if (name === 'viber_get_state') return text({ layout: { leaves: [{ panels: w.panels, activePanel: w.active }] }, worktree: { path: w.shown } });
  if (name === 'viber_focus_panel') {
    if (w.panels.indexOf(args.panel) < 0) return text({ error: 'Panel ' + args.panel + ' is not open in this layout (it may be turned off for this project)' });
    return text({ ok: true });
  }
  if (name === 'viber_set_layout') return text({ ok: true });
  return text('Error: unknown tool ' + name, true);
}

readline.createInterface({ input: process.stdin }).on('line', function (line) {
  let m;
  try { m = JSON.parse(line); } catch (e) { return; }
  if (m.id === undefined) return;
  let result;
  if (m.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fake-viber', version: '1' } };
  else if (m.method === 'tools/call') result = call(m.params.name, m.params.arguments || {});
  else result = {};
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: result }) + '\n');
});
