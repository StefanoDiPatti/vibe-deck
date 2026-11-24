const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const icon = require('../scripts/windows/shortcut-icon');

const ICO = path.join(__dirname, '..', 'scripts', 'windows', 'vibe-deck.ico');
const WIN = process.platform === 'win32';

function ps(cmd) { return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { encoding: 'utf8' }); }

test('the Windows icon exists and is a real .ico with 7 sizes', function () {
  const buf = fs.readFileSync(ICO);
  assert.strictEqual(buf.readUInt16LE(2), 1, 'icon type');
  assert.strictEqual(buf.readUInt16LE(4), 7, 'sizes');
  assert.strictEqual(buf.slice(buf.readUInt32LE(6 + 12), buf.readUInt32LE(6 + 12) + 4).toString('latin1'), '\x89PNG', 'PNG images inside');
});

test('the refresh script only touches the Vibe Deck shortcut that starts the dock', function () {
  const s = icon.script(["C:\\Users\\it's me\\Desktop"], 'C:\\deck\\vibe-deck.ico');
  assert.match(s, /'C:\\Users\\it''s me\\Desktop'/, 'quotes escaped');
  assert.match(s, /Vibe Deck\.lnk/);
  assert.match(s, /\*start-hidden\.vbs\*/);
  assert.match(s, /'C:\\deck\\vibe-deck\.ico,0'/);
});

test('an old shortcut gets the new icon once, other shortcuts are left alone', { skip: !WIN && 'Windows only' }, function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-lnk-'));
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-lnk-other-'));
  const make = function (d, args) {
    ps('$l = (New-Object -ComObject WScript.Shell).CreateShortcut("' + path.join(d, 'Vibe Deck.lnk') + '"); $l.TargetPath = "C:\\Windows\\System32\\wscript.exe"; $l.Arguments = \'' + args + '\'; $l.IconLocation = "C:\\Windows\\System32\\shell32.dll,15"; $l.Save()');
  };
  const read = function (d) { return ps('(New-Object -ComObject WScript.Shell).CreateShortcut("' + path.join(d, 'Vibe Deck.lnk') + '").IconLocation').stdout.trim(); };
  make(dir, '"C:\\deck\\scripts\\windows\\start-hidden.vbs" /panel');
  make(other, '"C:\\something\\else.vbs"');
  try {
    assert.deepStrictEqual(icon.refresh([dir, other, path.join(dir, 'missing')], ICO), [path.join(dir, 'Vibe Deck.lnk')]);
    assert.strictEqual(read(dir), ICO + ',0');
    assert.strictEqual(read(other), 'C:\\Windows\\System32\\shell32.dll,15');
    assert.deepStrictEqual(icon.refresh([dir], ICO), [], 'nothing to do the second time');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(other, { recursive: true, force: true });
  }
});
