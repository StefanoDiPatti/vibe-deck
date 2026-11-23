let impl;
if (process.platform === 'win32') impl = require('./windows');
else if (process.platform === 'linux') impl = require('./linux');
else {
  const unsupported = function () { return Promise.reject(new Error('Funzione non supportata su ' + process.platform)); };
  impl = {
    name: process.platform,
    init: function () { return Promise.resolve(); },
    capabilities: function () { return { media: false, keys: false, text: false, focus: false, nowPlaying: false, art: false, notes: ['Sistema non supportato'] }; },
    media: unsupported, sendKeys: unsupported, typeText: unsupported, focus: unsupported,
    open: unsupported, launch: unsupported,
    sessions: function () { return Promise.resolve({ supported: false, sessions: [] }); },
    control: unsupported,
    art: function () { return Promise.resolve(null); },
    appVolume: unsupported,
    audioProcesses: function () { return Promise.resolve([]); },
    netBytes: function () { return Promise.resolve(null); },
    netInfo: function () { return Promise.resolve(null); },
    windows: function () { return Promise.resolve([]); },
    closeWindows: function () { return Promise.resolve(0); },
    cpuTemp: function () { return Promise.resolve(null); },
    gpuFallback: function () { return Promise.resolve(null); },
    shutdown: function () {}
  };
}

module.exports = impl;
