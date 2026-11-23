const DEFAULT_SERVER = 'http://127.0.0.1:8787';
const HEADERS = { 'Content-Type': 'application/json', 'X-Dock-Bridge': '1' };
const SITES = ['https://music.apple.com/*', 'https://beta.music.apple.com/*', 'https://music.youtube.com/*', 'https://www.youtube.com/*'];

async function server() {
  const o = await chrome.storage.local.get('server');
  return String(o.server || DEFAULT_SERVER).replace(/\/+$/, '');
}

async function post(path, body) {
  const res = await fetch((await server()) + path, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error && json.error.message);
  return json.data;
}

async function remember(key, value) {
  const o = {};
  o[key] = value;
  try { await chrome.storage.local.set(o); } catch (e) { }
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.type === 'close_tab' && sender.tab) {
    chrome.tabs.remove(sender.tab.id).catch(function () {});
    return false;
  }
  if (!msg || msg.type !== 'state' || !sender.tab) return false;
  const key = sender.tab.id + ':' + (sender.frameId || 0);
  post('/api/bridge/state', { key: key, state: msg.state })
    .then(function (d) {
      remember('lastOk', { at: Date.now(), title: msg.state ? msg.state.title : null, site: msg.state ? msg.state.site : null });
      sendResponse({ commands: (d && d.commands) || [] });
    })
    .catch(function (e) {
      remember('lastError', { at: Date.now(), message: String(e && e.message || e) });
      sendResponse({ commands: [] });
    });
  return true;
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  post('/api/bridge/closed', { key: tabId + ':0' }).catch(function () {});
});

async function injectIntoOpenTabs() {
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: SITES }); } catch (e) { return; }
  for (const t of tabs) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['page.js'], world: 'MAIN' });
      await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] });
    } catch (e) { }
  }
}
chrome.runtime.onInstalled.addListener(injectIntoOpenTabs);
chrome.runtime.onStartup.addListener(injectIntoOpenTabs);
