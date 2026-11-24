'use strict';
const test = require('node:test');
const assert = require('node:assert');
const vdesk = require('../official-plugins/screens/lib/vdesk');

const K = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VirtualDesktops';

test('GUID dai 16 byte del registro (primi tre campi little endian)', function () {
  assert.strictEqual(vdesk._guidFromHex('E9C6167A6A476B46892CB25040583D87'), '7A16C6E9-476A-466B-892C-B25040583D87');
  assert.strictEqual(vdesk._guidFromHex('xyz'), '');
});

test('Windows 11: ordine, desktop attivo e nomi', function () {
  const text = [
    K,
    '    VirtualDesktopIDs    REG_BINARY    D22401D2CFF60647BB161BACFD068541E9C6167A6A476B46892CB25040583D87',
    '    CurrentVirtualDesktop    REG_BINARY    E9C6167A6A476B46892CB25040583D87',
    '',
    K + '\\Desktops',
    '',
    K + '\\Desktops\\{7A16C6E9-476A-466B-892C-B25040583D87}',
    '    Name    REG_SZ    GIOCO',
    '    Wallpaper    REG_SZ    C:\\sfondo.jpg',
    '',
    K + '\\Desktops\\{0C9B10DE-5089-4FB3-B6D0-D21092E0EBB3}',
    '    Wallpaper    REG_SZ    C:\\vecchio.jpg',
    ''
  ].join('\r\n');
  const list = vdesk._parse(text, '');
  assert.deepStrictEqual(list, [
    { id: 'D20124D2-F6CF-4706-BB16-1BACFD068541', n: 1, name: 'Desktop 1', current: false },
    { id: '7A16C6E9-476A-466B-892C-B25040583D87', n: 2, name: 'GIOCO', current: true }
  ]);
});

test('Windows 10: desktop attivo in SessionInfo', function () {
  const text = K + '\r\n    VirtualDesktopIDs    REG_BINARY    D22401D2CFF60647BB161BACFD068541E9C6167A6A476B46892CB25040583D87\r\n';
  const sess = 'HKEY_CURRENT_USER\\...\\SessionInfo\\1\\VirtualDesktops\r\n    CurrentVirtualDesktop    REG_BINARY    D22401D2CFF60647BB161BACFD068541\r\n';
  const list = vdesk._parse(text, sess);
  assert.strictEqual(list[0].current, true);
  assert.strictEqual(list[1].current, false);
});

test('mai creato un secondo desktop: ce n\'è uno solo', function () {
  const list = vdesk._parse(K + '\r\n    VDSoftLandingCampaignDone    REG_DWORD    0x1\r\n', '');
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].current, true);
});

test('desktop virtuali letti dall\'helper PowerShell (esadecimali + nomi)', function () {
  const list = vdesk._fromHelper({
    ids: 'D22401D2CFF60647BB161BACFD068541E9C6167A6A476B46892CB25040583D87',
    cur: 'E9C6167A6A476B46892CB25040583D87',
    names: { '7a16c6e9-476a-466b-892c-b25040583d87': 'GIOCO' }
  });
  assert.deepStrictEqual(list.map(function (d) { return d.n + ' ' + d.name + (d.current ? ' *' : ''); }), ['1 Desktop 1', '2 GIOCO *']);
  assert.strictEqual(vdesk._fromHelper({ ids: '', cur: '', names: {} }).length, 1);
});
