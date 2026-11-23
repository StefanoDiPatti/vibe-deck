'use strict';
const ACC = '#1f5a96', ACC_DARK = '#174a7e';
module.exports = {
  title: 'Material',
  bg: {
    '#0b0f14': '#111318', 'rgb(5,8,12)': '#0c0e12', '#0f151c': '#191c20',
    '#141c25': '#1d2024', '#131a22': '#1d2024', '#172029': '#1d2024', '#1a232e': '#1d2024', '#1d2732': '#1d2024',
    '#18212c': '#1d2024', '#1d2835': '#272a2f',
    '#243142': '#32353a', '#2a3746': '#32353a', '#223041': '#32353a', '#1f2c3c': '#32353a', '#26313d': '#32353a', '#2f3f55': '#3a3d42',
    '#26354a': '#2c3a4f', '#1d2a3a': '#2c3a4f', '#213a5c': '#2c3a4f', '#10203a': '#22324a', '#0f1a2a': '#22324a',
    '#3d8bfd': ACC, 'rgb(61,139,253)': '#a8c7fa', '#2f6fd0': ACC_DARK, '#1f4f8f': ACC_DARK, '#1f3b63': '#0f3b62', '#2d3576': '#33416b',
    '#3fb950': '#7fd99a', '#2f6b3a': '#1f5135', '#1e5631': '#1f5135', '#1d3b2a': '#1a3326', '#172b22': '#16281f',
    '#e5534b': '#ffb4ab', '#c0392b': '#93000a', '#8b1d1d': '#93000a', '#c8443d': '#b3261e',
    '#5a1f24': '#5c1a1b', 'rgb(90,31,36)': '#5c1a1b', '#4d1717': '#3b1c1c', '#3a1d1d': '#3b1c1c', '#2a1c1f': '#3b1c1c',
    '#ffb454': '#ffb95c', '#4d5d70': '#5b5e66', '#8b9bab': '#8e9099', '#6cb6ff': '#a8c7fa', '#e8eef4': '#e2e2e6'
  },
  fg: {
    '#ffffff': '#e9e9ee', '#e8eef4': '#e2e2e6', '#dfe6ee': '#e2e2e6', '#cfd9e3': '#e2e2e6', 'rgb(232,238,244)': '#e2e2e6',
    '#c6d1dc': '#c4c6cf', '#b6c4d2': '#c4c6cf', '#9fb3c8': '#c4c6cf',
    '#8b9bab': '#8e9099', '#6e7f90': '#74777f', '#5d6b7a': '#74777f',
    '#6cb6ff': '#a8c7fa', '#ff9c94': '#ffb4ab', '#ff7b72': '#ffb4ab', '#e5534b': '#ffb4ab', '#3fb950': '#7fd99a'
  },
  line: {
    '#1d2733': '#26292e', '#222e3b': '#26292e', '#2a3746': '#3a3d42', '#3b5170': '#44474e', '#4d5d70': '#5b5e66', '#5b6b7c': '#5b5e66',
    '#3d8bfd': '#a8c7fa', '#6cb6ff': '#a8c7fa', '#3fb950': '#7fd99a', 'rgb(63,185,80)': '#7fd99a', '#e5534b': '#ffb4ab'
  },
  css: `
@font-face { font-family: "VDClockMaterial"; src: url("../../fonts/clock-material.ttf") format("truetype"); }
.saver-clock { font-family: "VDClockMaterial", Roboto, sans-serif; font-size: 112px; letter-spacing: 0; color: #4a4f63; }
.clk-time { font-family: "VDClockMaterial", Roboto, sans-serif; letter-spacing: 0; color: #a8c7fa; }
body { font-family: Roboto, "Droid Sans", "Segoe UI", Arial, sans-serif; }
#topbar { border-bottom-color: #111318; }
.tile { border-radius: 24px; border-color: transparent; }
.tile.btn:after { display: none; }
.tile.btn.pressed { border-color: transparent; background-color: #2c3a4f; }
.t-label { letter-spacing: 0.5px; }
.sbtn { border-radius: 15px; padding: 0 14px; }
.modal-box, .pair-box { border-radius: 28px; border-color: transparent; }
.modal-close, .pair-go { border-radius: 25px; }
#toast { border-radius: 16px; }
#tabs { border-top-color: #191c20; }
.tab.active { background: transparent; -webkit-box-shadow: none; box-shadow: none; }
.tab.active svg.ic { width: 24px; padding: 3px 18px; margin-top: -3px; border-radius: 15px; background: #354a6b; fill: #d6e3ff; }
.theme-menu { border-radius: 24px; }
.theme-opt { border-radius: 18px; }
`
};
