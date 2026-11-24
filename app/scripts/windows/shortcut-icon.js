'use strict';
const { spawnSync } = require('child_process');

function psQuote(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

function runPs(command) {
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], { encoding: 'utf8', windowsHide: true });
}

function script(dirs, icon) {
  const target = psQuote(icon + ',0');
  return [
    '$shell = New-Object -ComObject WScript.Shell',
    'foreach ($d in @(' + dirs.map(psQuote).join(',') + ')) {',
    '  $f = Join-Path $d "Vibe Deck.lnk"',
    '  if (-not (Test-Path -LiteralPath $f)) { continue }',
    '  $s = $shell.CreateShortcut($f)',
    '  if ($s.Arguments -like "*start-hidden.vbs*" -and $s.IconLocation -ne ' + target + ') { $s.IconLocation = ' + target + '; $s.Save(); "aggiornata " + $f }',
    '}'
  ].join('\n');
}

function refresh(dirs, icon, ps) {
  const r = (ps || runPs)(script(dirs, icon));
  return String(r.stdout || '').split(/\r?\n/).filter(function (l) { return l.indexOf('aggiornata ') === 0; }).map(function (l) { return l.slice(11); });
}

module.exports = { refresh: refresh, script: script };
