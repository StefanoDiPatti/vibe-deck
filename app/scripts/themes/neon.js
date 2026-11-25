'use strict';
const CY = '#41d1ff', GR = '#39ff88', RD = '#ff3b5c';
module.exports = {
  title: 'Neon Elgato',
  bg: {
    '#0b0f14': '#050505', 'rgb(5,8,12)': '#000000', '#0f151c': '#080808',
    '#141c25': '#0d0d0d', '#131a22': '#0d0d0d', '#172029': '#111111', '#1a232e': '#111111', '#1d2732': '#111111',
    '#18212c': '#0f0f0f', '#1d2835': '#141414',
    '#243142': '#1c1c1c', '#2a3746': '#1c1c1c', '#223041': '#1c1c1c', '#1f2c3c': '#1c1c1c', '#26313d': '#1c1c1c', '#2f3f55': '#232323',
    '#26354a': '#06323d', '#1d2a3a': '#0a2a33', '#213a5c': '#06323d', '#10203a': '#06262e', '#0f1a2a': '#06262e',
    '#3d8bfd': '#007a99', 'rgb(61,139,253)': CY, '#2f6fd0': '#006680', '#1f4f8f': '#004d61', '#1f3b63': '#06323d', '#2d3576': '#2a1446',
    '#3fb950': GR, '#2f6b3a': '#0f5c32', '#1e5631': '#0f3d22', '#1d3b2a': '#0b2617', '#172b22': '#0b2617',
    '#e5534b': RD, '#c0392b': '#b3002d', '#8b1d1d': '#7a0020', '#c8443d': '#b3002d',
    '#5a1f24': '#3d0010', 'rgb(90,31,36)': '#3d0010', '#4d1717': '#2a0a12', '#3a1d1d': '#2a0a12', '#2a1c1f': '#2a0a12',
    '#ffb454': '#ffd23f', '#d29922': '#ffd23f', '#4d5d70': '#333333', '#8b9bab': '#666666', '#6cb6ff': CY, '#e8eef4': '#ededed'
  },
  fg: {
    '#ffffff': '#f5f5f5', '#e8eef4': '#ededed', '#dfe6ee': '#ededed', '#cfd9e3': '#e0e0e0', 'rgb(232,238,244)': '#ededed',
    '#c6d1dc': '#bdbdbd', '#b6c4d2': '#bdbdbd', '#9fb3c8': '#9e9e9e',
    '#8b9bab': '#8f8f8f', '#6e7f90': '#808080', '#5d6b7a': '#808080',
    '#6cb6ff': CY, '#ff9c94': '#ff5c7a', '#ff7b72': '#ff5c7a', '#e5534b': '#ff5c7a', '#3fb950': GR, '#ffb454': '#ffd23f', '#d29922': '#ffd23f'
  },
  line: {
    '#1d2733': '#161616', '#222e3b': '#161616', '#2a3746': '#262626', '#3b5170': '#333333', '#4d5d70': '#333333', '#5b6b7c': '#3d3d3d',
    '#3d8bfd': CY, '#6cb6ff': CY, '#3fb950': GR, 'rgb(63,185,80)': GR, '#e5534b': RD, '#d29922': '#ffd23f'
  },
  css: `
@font-face { font-family: "VDClockNeon"; src: url("../../fonts/clock-neon.ttf") format("truetype"); }
.saver-clock { font-family: "VDClockNeon", "Roboto Condensed", sans-serif; font-size: 88px; letter-spacing: 6px; color: #1b8fb3; text-shadow: 0 0 14px rgba(65, 209, 255, 0.45), 0 0 34px rgba(65, 209, 255, 0.2); }
body { font-family: "Roboto Condensed", "Arial Narrow", Roboto, Arial, sans-serif; }
.clk-time { font-family: "VDClockNeon", "Roboto Condensed", sans-serif; letter-spacing: 6px; color: ${CY}; text-shadow: 0 0 12px rgba(65, 209, 255, 0.6), 0 0 30px rgba(65, 209, 255, 0.25); }
#topbar { border-bottom-color: #000; }
.tb-left, #page-title { text-transform: uppercase; letter-spacing: 3px; }
#status-dot.on { -webkit-box-shadow: 0 0 8px #39ff88; box-shadow: 0 0 8px #39ff88; }
.tile { border-color: #000; border-radius: 14px; }
.tile.widget { background: #0c0c0c; -webkit-box-shadow: inset 0 1px 0 #222; box-shadow: inset 0 1px 0 #222; }
.tile.btn {
  background-color: #111;
  background-image: -webkit-linear-gradient(top, #1d1d1d, #0b0b0b); background-image: linear-gradient(to bottom, #1d1d1d, #0b0b0b);
  -webkit-box-shadow: inset 0 1px 0 #2f2f2f, inset 0 -3px 0 #000, 0 3px 0 #000; box-shadow: inset 0 1px 0 #2f2f2f, inset 0 -3px 0 #000, 0 3px 0 #000;
}
.tile.btn:after { display: none; }
.tile.btn.pressed { border-color: #41d1ff; -webkit-box-shadow: inset 0 0 18px rgba(65, 209, 255, 0.35), 0 0 12px rgba(65, 209, 255, 0.35); box-shadow: inset 0 0 18px rgba(65, 209, 255, 0.35), 0 0 12px rgba(65, 209, 255, 0.35); }
.t-label { letter-spacing: 2px; text-shadow: 0 0 6px rgba(255, 255, 255, 0.25); }
.tile.btn .t-icon svg { -webkit-filter: drop-shadow(0 0 6px currentColor); filter: drop-shadow(0 0 6px currentColor); }
.tile.btn:nth-child(5n+1) .t-icon svg { fill: #41d1ff; color: #41d1ff; }
.tile.btn:nth-child(5n+2) .t-icon svg { fill: #ff5c7a; color: #ff5c7a; }
.tile.btn:nth-child(5n+3) .t-icon svg { fill: #ffd23f; color: #ffd23f; }
.tile.btn:nth-child(5n+4) .t-icon svg { fill: #8cff66; color: #8cff66; }
.tile.btn:nth-child(5n+5) .t-icon svg { fill: #c38bff; color: #c38bff; }
.sbtn { border-radius: 6px; text-transform: uppercase; -webkit-box-shadow: inset 0 1px 0 #2f2f2f, 0 2px 0 #000; box-shadow: inset 0 1px 0 #2f2f2f, 0 2px 0 #000; }
.sbtn.pressed { -webkit-box-shadow: 0 0 10px rgba(65, 209, 255, 0.6); box-shadow: 0 0 10px rgba(65, 209, 255, 0.6); }
#tabs { border-top-color: #000; }
.tab { text-transform: uppercase; letter-spacing: 2px; }
.tab.active { background: #0b0b0b; color: #41d1ff; text-shadow: 0 0 8px rgba(65, 209, 255, 0.7); -webkit-box-shadow: inset 0 3px 0 #41d1ff; box-shadow: inset 0 3px 0 #41d1ff; }
.tab.active svg.ic { fill: #41d1ff; -webkit-filter: drop-shadow(0 0 6px #41d1ff); filter: drop-shadow(0 0 6px #41d1ff); }
.modal-box, .pair-box { border-color: #262626; -webkit-box-shadow: 0 0 30px rgba(65, 209, 255, 0.15); box-shadow: 0 0 30px rgba(65, 209, 255, 0.15); }
.theme-menu { border-color: #262626; }

.np-btn, .dc-btn, .au-b, .dc-pb, .sc-wbtn, .chat-send, .cl-send, .todo-add, .cl-mic, .todo-mic {
  background: #0a0a0a; border: 2px solid #41d1ff;
  -webkit-box-shadow: 0 0 10px rgba(65, 209, 255, 0.45), inset 0 0 8px rgba(65, 209, 255, 0.2);
  box-shadow: 0 0 10px rgba(65, 209, 255, 0.45), inset 0 0 8px rgba(65, 209, 255, 0.2);
}
.np-btn svg.ic, .dc-btn svg.ic, .au-b svg.ic, .dc-pb svg.ic, .sc-wbtn svg.ic, .chat-send svg.ic, .cl-send svg.ic, .todo-add svg.ic {
  fill: #41d1ff; -webkit-filter: drop-shadow(0 0 4px #41d1ff); filter: drop-shadow(0 0 4px #41d1ff);
}
.dc-btn span { color: #41d1ff; text-shadow: 0 0 6px rgba(65, 209, 255, 0.7); }
.np-btn.np-play { background: #0a0a0a; border-color: #ff4fd8; -webkit-box-shadow: 0 0 14px rgba(255, 79, 216, 0.6), inset 0 0 10px rgba(255, 79, 216, 0.3); box-shadow: 0 0 14px rgba(255, 79, 216, 0.6), inset 0 0 10px rgba(255, 79, 216, 0.3); }
.np-btn.np-play svg.ic { fill: #ff4fd8; -webkit-filter: drop-shadow(0 0 5px #ff4fd8); filter: drop-shadow(0 0 5px #ff4fd8); }
.np-btn.np-vol { background: #0a0a0a; }
.np-prog i { background: #41d1ff; -webkit-box-shadow: 0 0 8px #41d1ff; box-shadow: 0 0 8px #41d1ff; }
.np-btn.pressed, .dc-btn.pressed, .au-b.pressed, .chat-send.pressed, .cl-send.pressed, .todo-add.pressed { background: #06323d; }
.cl-mic, .todo-mic, .dc-mute { border-color: #8cff66; -webkit-box-shadow: 0 0 10px rgba(140, 255, 102, 0.5), inset 0 0 8px rgba(140, 255, 102, 0.2); box-shadow: 0 0 10px rgba(140, 255, 102, 0.5), inset 0 0 8px rgba(140, 255, 102, 0.2); }
.cl-mic svg.ic, .todo-mic svg.ic, .dc-mute svg.ic { fill: #8cff66; -webkit-filter: drop-shadow(0 0 4px #8cff66); filter: drop-shadow(0 0 4px #8cff66); }
.dc-mute span { color: #8cff66; text-shadow: 0 0 6px rgba(140, 255, 102, 0.7); }
.cl-mic.on, .todo-mic.on, .dc-btn.off { background: #2a0010; border-color: #ff3b5c; -webkit-box-shadow: 0 0 16px rgba(255, 59, 92, 0.75); box-shadow: 0 0 16px rgba(255, 59, 92, 0.75); }
.cl-mic.on svg.ic, .todo-mic.on svg.ic, .dc-btn.off svg.ic { fill: #ff3b5c; -webkit-filter: drop-shadow(0 0 5px #ff3b5c); filter: drop-shadow(0 0 5px #ff3b5c); }
.dc-btn.off span { color: #ff3b5c; text-shadow: 0 0 6px rgba(255, 59, 92, 0.8); }
.dc-cam { border-color: #ffd23f; } .dc-cam svg.ic { fill: #ffd23f; -webkit-filter: drop-shadow(0 0 4px #ffd23f); filter: drop-shadow(0 0 4px #ffd23f); } .dc-cam span { color: #ffd23f; }
.dc-live { border-color: #ff4fd8; } .dc-live svg.ic { fill: #ff4fd8; -webkit-filter: drop-shadow(0 0 4px #ff4fd8); filter: drop-shadow(0 0 4px #ff4fd8); } .dc-live span { color: #ff4fd8; }
.dc-leave { border-color: #ff3b5c; } .dc-leave svg.ic { fill: #ff3b5c; -webkit-filter: drop-shadow(0 0 4px #ff3b5c); filter: drop-shadow(0 0 4px #ff3b5c); } .dc-leave span { color: #ff3b5c; }
.dc-btn.on { background: #0f3d22; border-color: #39ff88; -webkit-box-shadow: 0 0 16px rgba(57, 255, 136, 0.7); box-shadow: 0 0 16px rgba(57, 255, 136, 0.7); }
.dc-btn.on svg.ic { fill: #39ff88; } .dc-btn.on span { color: #39ff88; }
.dc-live.on { background: #3d0030; border-color: #ff4fd8; -webkit-box-shadow: 0 0 18px rgba(255, 79, 216, 0.8); box-shadow: 0 0 18px rgba(255, 79, 216, 0.8); }
.dc-live.on svg.ic { fill: #ff4fd8; } .dc-live.on span { color: #ff4fd8; }
.sbtn { color: #41d1ff; border: 1px solid #41d1ff; background: #0a0a0a; }
.sbtn svg.ic { fill: #41d1ff; }
.sbtn.on, .sbtn.pressed { background: #06323d; }
.tile.btn .t-icon svg { -webkit-filter: drop-shadow(0 0 2px currentColor) drop-shadow(0 0 8px currentColor); filter: drop-shadow(0 0 2px currentColor) drop-shadow(0 0 8px currentColor); }
`
};
