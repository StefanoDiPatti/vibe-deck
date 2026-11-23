'use strict';
const INK = '#111111', CREAM = '#f4efe3', Y = '#ffd23f', B = '#4d9dff', R = '#ff6b5b', G = '#2bd96b';
module.exports = {
  title: 'Neo-brutalista',
  bg: {
    '#0b0f14': CREAM, '#000000': INK, 'rgb(5,8,12)': '#1e1a12', '#0f151c': '#fffdf7',
    '#141c25': '#fffdf7', '#131a22': '#fffdf7', '#172029': '#fffdf7', '#1a232e': '#fffdf7', '#1d2732': '#fffdf7',
    '#18212c': '#ffffff', '#1d2835': '#ffffff',
    '#243142': '#efe8d8', '#2a3746': '#efe8d8', '#223041': '#efe8d8', '#1f2c3c': '#efe8d8', '#26313d': INK, '#2f3f55': '#e3dccb',
    '#26354a': Y, '#1d2a3a': Y, '#213a5c': '#fff0b3', '#10203a': '#fff0b3', '#0f1a2a': '#fff0b3',
    '#3d8bfd': B, 'rgb(61,139,253)': B, '#2f6fd0': '#3d86e8', '#1f4f8f': '#3d86e8', '#1f3b63': '#9cc4ff', '#2d3576': '#c9b8ff',
    '#3fb950': G, '#2f6b3a': G, '#1e5631': G, '#1d3b2a': '#c9f5d6', '#172b22': '#c9f5d6',
    '#e5534b': R, '#c0392b': R, '#8b1d1d': R, '#c8443d': R,
    '#5a1f24': '#ffd0c9', 'rgb(90,31,36)': '#ffd0c9', '#4d1717': '#ffd0c9', '#3a1d1d': '#ffd0c9', '#2a1c1f': '#ffe3df',
    '#ffb454': Y, '#d29922': Y, '#6b5214': '#fff0b3', '#3a3220': '#fff0b3', '#c15f3c': '#ff9f5b', '#8a4227': '#ffd8bd', '#a94f2f': '#ff9f5b',
    '#5865f2': '#8b95ff', '#4752c4': '#8b95ff', '#4d5d70': '#bdb5a3', '#8b9bab': '#9a927f', '#6cb6ff': B, '#e8eef4': INK,
    'rgb(255,255,255)': '#000000'
  },
  fg: {
    '#ffffff': INK, '#e8eef4': INK, '#dfe6ee': INK, '#cfd9e3': INK, 'rgb(232,238,244)': INK,
    '#c6d1dc': '#2b2b2b', '#b6c4d2': '#2b2b2b', '#9fb3c8': '#2b2b2b',
    '#8b9bab': '#5a5446', '#6e7f90': '#5a5446', '#5d6b7a': '#5a5446',
    '#6cb6ff': '#1f5fd1', '#ff9c94': '#c4271a', '#ff7b72': '#c4271a', '#ffc9c4': '#c4271a', '#e5534b': '#c4271a',
    '#3fb950': '#127a3a', '#ffb454': '#8a5a00', '#d29922': '#8a5a00', '#5865f2': '#3b44c4'
  },
  line: {
    '#0b0f14': INK, '#1d2733': INK, '#222e3b': INK, '#2a3746': INK, '#3b5170': INK, '#4d5d70': INK, '#5b6b7c': INK,
    '#3d8bfd': INK, '#6cb6ff': INK, '#3fb950': G, 'rgb(63,185,80)': G, '#e5534b': R, '#d29922': Y
  },
  css: `
@font-face { font-family: "VDClockBrutal"; src: url("../../fonts/clock-brutal.ttf") format("truetype"); }
.saver-clock { font-family: "VDClockBrutal", "Arial Black", sans-serif; font-size: 100px; letter-spacing: 0; color: #6e6656; text-shadow: 6px 6px 0 #4a3d06; }
.clk-time { font-family: "VDClockBrutal", "Arial Black", sans-serif; letter-spacing: 0; color: ${INK}; text-shadow: 4px 4px 0 ${Y}; }
.clk-date { color: ${INK}; }
body { font-family: "Arial Black", "Archivo Black", Roboto, Arial, sans-serif; }
#topbar { background: ${INK}; color: ${CREAM}; border-bottom: 3px solid ${INK}; }
#topbar svg.ic { fill: ${CREAM}; }
#page-title, #mini { color: ${CREAM}; }
#status-dot { border: 2px solid ${CREAM}; border-radius: 0; }
#tabs { background: ${INK}; border-top: 3px solid ${INK}; }
.tab { color: ${CREAM}; }
.tab svg.ic { fill: ${CREAM}; }
.tab.active { background: ${Y}; color: ${INK}; -webkit-box-shadow: none; box-shadow: none; }
.tab.active svg.ic { fill: ${INK}; }
.np-btn.np-play { background: ${Y}; border: 3px solid ${INK}; -webkit-box-shadow: 3px 3px 0 ${INK}; box-shadow: 3px 3px 0 ${INK}; }
.np-btn.np-play svg.ic { fill: ${INK}; }
.tab.pressed { background: #333; }
svg.ic { fill: ${INK}; }
.tile { border: 3px solid ${INK}; border-radius: 6px; -webkit-box-shadow: 5px 5px 0 ${INK}; box-shadow: 5px 5px 0 ${INK}; }
.tile.btn:after { display: none; }
.tile.btn.pressed { -webkit-transform: translate(4px, 4px); transform: translate(4px, 4px); -webkit-box-shadow: 1px 1px 0 ${INK}; box-shadow: 1px 1px 0 ${INK}; border-color: ${INK}; }
.tile.btn.ok { -webkit-box-shadow: inset 0 0 0 3px ${G}, 5px 5px 0 ${INK}; box-shadow: inset 0 0 0 3px ${G}, 5px 5px 0 ${INK}; }
.tile.btn.err { -webkit-box-shadow: inset 0 0 0 3px ${R}, 5px 5px 0 ${INK}; box-shadow: inset 0 0 0 3px ${R}, 5px 5px 0 ${INK}; }
.tile.btn.running { -webkit-box-shadow: inset 0 0 0 3px ${G}, 5px 5px 0 ${INK}; box-shadow: inset 0 0 0 3px ${G}, 5px 5px 0 ${INK}; }
.tile.btn.running:before { border: 2px solid ${INK}; border-radius: 0; }
.t-label { letter-spacing: 0.5px; }
.t-sub { color: #2b2b2b; }
.t-hold { background: rgba(0, 0, 0, 0.15); }
.sbtn { border: 2px solid ${INK}; border-radius: 4px; -webkit-box-shadow: 2px 2px 0 ${INK}; box-shadow: 2px 2px 0 ${INK}; }
.sbtn.pressed { background: ${Y}; }
#toast { background: ${INK}; color: ${CREAM}; border-radius: 4px; -webkit-box-shadow: 5px 5px 0 rgba(0, 0, 0, 0.35); box-shadow: 5px 5px 0 rgba(0, 0, 0, 0.35); }
#toast.ok { background: ${G}; color: ${INK}; border: 3px solid ${INK}; }
#toast.err { background: ${R}; color: ${INK}; border: 3px solid ${INK}; }
#banner { background: ${R}; color: ${INK}; }
.modal-box, .pair-box { border: 3px solid ${INK}; border-radius: 6px; -webkit-box-shadow: 6px 6px 0 ${INK}; box-shadow: 6px 6px 0 ${INK}; }
.modal-body, #pair-code { background: #fffdf7; color: ${INK}; border: 2px solid ${INK}; }
.modal-close, .pair-go { border: 3px solid ${INK}; border-radius: 4px; color: ${INK}; }
#boot { background: ${CREAM}; }
.theme-menu { border: 3px solid ${INK}; border-radius: 6px; -webkit-box-shadow: 6px 6px 0 ${INK}; box-shadow: 6px 6px 0 ${INK}; }
`
};
