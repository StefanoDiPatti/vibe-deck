(function () {
  'use strict';
  function onMessage(e) {
    if (e.source !== window || !e.data || e.data.__dockBridge !== 'state') return;
    try {
      chrome.runtime.sendMessage({ type: 'state', state: e.data.state }, function (resp) {
        if (chrome.runtime.lastError || !resp) return;
        (resp.commands || []).forEach(function (c) {
          if (c && c.type === 'close_tab') { chrome.runtime.sendMessage({ type: 'close_tab' }); return; }
          window.postMessage({ __dockBridge: 'cmd', cmd: c }, '*');
        });
      });
    } catch (err) {
      window.removeEventListener('message', onMessage);
    }
  }
  window.addEventListener('message', onMessage);
})();
