const KEYS = {
  CTRL: { win: 0x11, x11: 'ctrl', mod: true },
  SHIFT: { win: 0x10, x11: 'shift', mod: true },
  ALT: { win: 0x12, x11: 'alt', mod: true },
  WIN: { win: 0x5B, x11: 'super', mod: true },
  ENTER: { win: 0x0D, x11: 'Return' },
  ESC: { win: 0x1B, x11: 'Escape' },
  TAB: { win: 0x09, x11: 'Tab' },
  SPACE: { win: 0x20, x11: 'space' },
  BACKSPACE: { win: 0x08, x11: 'BackSpace' },
  DELETE: { win: 0x2E, x11: 'Delete' },
  INSERT: { win: 0x2D, x11: 'Insert' },
  HOME: { win: 0x24, x11: 'Home' },
  END: { win: 0x23, x11: 'End' },
  PAGEUP: { win: 0x21, x11: 'Prior' },
  PAGEDOWN: { win: 0x22, x11: 'Next' },
  UP: { win: 0x26, x11: 'Up' },
  DOWN: { win: 0x28, x11: 'Down' },
  LEFT: { win: 0x25, x11: 'Left' },
  RIGHT: { win: 0x27, x11: 'Right' },
  PRINTSCREEN: { win: 0x2C, x11: 'Print' },
  CAPSLOCK: { win: 0x14, x11: 'Caps_Lock' },
  PAUSE: { win: 0x13, x11: 'Pause' },
  MENU: { win: 0x5D, x11: 'Menu' },
  MINUS: { win: 0xBD, x11: 'minus' },
  EQUALS: { win: 0xBB, x11: 'equal' },
  COMMA: { win: 0xBC, x11: 'comma' },
  PERIOD: { win: 0xBE, x11: 'period' },
  SLASH: { win: 0xBF, x11: 'slash' },
  BACKSLASH: { win: 0xDC, x11: 'backslash' },
  SEMICOLON: { win: 0xBA, x11: 'semicolon' },
  QUOTE: { win: 0xDE, x11: 'apostrophe' },
  BACKQUOTE: { win: 0xC0, x11: 'grave' },
  LBRACKET: { win: 0xDB, x11: 'bracketleft' },
  RBRACKET: { win: 0xDD, x11: 'bracketright' },
  NUM_ADD: { win: 0x6B, x11: 'KP_Add' },
  NUM_SUBTRACT: { win: 0x6D, x11: 'KP_Subtract' },
  NUM_MULTIPLY: { win: 0x6A, x11: 'KP_Multiply' },
  NUM_DIVIDE: { win: 0x6F, x11: 'KP_Divide' },
  NUM_DECIMAL: { win: 0x6E, x11: 'KP_Decimal' },
  MEDIA_PLAY_PAUSE: { win: 0xB3, x11: 'XF86AudioPlay' },
  MEDIA_NEXT: { win: 0xB0, x11: 'XF86AudioNext' },
  MEDIA_PREV: { win: 0xB1, x11: 'XF86AudioPrev' },
  MEDIA_STOP: { win: 0xB2, x11: 'XF86AudioStop' },
  VOLUME_UP: { win: 0xAF, x11: 'XF86AudioRaiseVolume' },
  VOLUME_DOWN: { win: 0xAE, x11: 'XF86AudioLowerVolume' },
  VOLUME_MUTE: { win: 0xAD, x11: 'XF86AudioMute' }
};

(function addGenerated() {
  for (let c = 65; c <= 90; c++) KEYS[String.fromCharCode(c)] = { win: c, x11: String.fromCharCode(c + 32) };
  for (let d = 0; d <= 9; d++) {
    KEYS[String(d)] = { win: 0x30 + d, x11: String(d) };
    KEYS['NUM' + d] = { win: 0x60 + d, x11: 'KP_' + d };
  }
  for (let f = 1; f <= 24; f++) KEYS['F' + f] = { win: 0x6F + f, x11: 'F' + f };
})();

const ALIASES = {
  CONTROL: 'CTRL', CTL: 'CTRL', OPTION: 'ALT', SUPER: 'WIN', META: 'WIN', CMD: 'WIN', LOGO: 'WIN',
  RETURN: 'ENTER', ESCAPE: 'ESC', DEL: 'DELETE', INS: 'INSERT', PGUP: 'PAGEUP', PGDN: 'PAGEDOWN',
  PRTSC: 'PRINTSCREEN', PRINT: 'PRINTSCREEN', ARROWUP: 'UP', ARROWDOWN: 'DOWN', ARROWLEFT: 'LEFT',
  ARROWRIGHT: 'RIGHT', PLUS: 'EQUALS', '-': 'MINUS', '=': 'EQUALS', ',': 'COMMA', '.': 'PERIOD',
  '/': 'SLASH', ';': 'SEMICOLON', '`': 'BACKQUOTE', '[': 'LBRACKET', ']': 'RBRACKET', "'": 'QUOTE',
  PLAY_PAUSE: 'MEDIA_PLAY_PAUSE', NEXT_TRACK: 'MEDIA_NEXT', PREV_TRACK: 'MEDIA_PREV', MUTE: 'VOLUME_MUTE'
};

function canonical(name) {
  const up = String(name).trim().toUpperCase().replace(/\s+/g, '');
  if (KEYS[up]) return up;
  if (ALIASES[up]) return ALIASES[up];
  return null;
}

function parseCombo(input) {
  let parts;
  if (Array.isArray(input)) parts = input;
  else if (typeof input === 'string') parts = input.split(/\+(?!$)/);
  else throw new Error('Combinazione di tasti mancante');
  if (!parts.length || parts.length > 6) throw new Error('Combinazione di tasti non valida');
  return parts.map(function (p) {
    const c = canonical(p);
    if (!c) throw new Error('Tasto sconosciuto: ' + p);
    return c;
  });
}

function toWin(combo) { return combo.map(function (k) { return KEYS[k].win; }); }
function toX11(combo) { return combo.map(function (k) { return KEYS[k].x11; }); }
function isModifier(k) { return !!(KEYS[k] && KEYS[k].mod); }

module.exports = { KEYS: KEYS, canonical: canonical, parseCombo: parseCombo, toWin: toWin, toX11: toX11, isModifier: isModifier };
