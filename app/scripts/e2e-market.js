'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { sleep, waitFor, Session, Report, Hand, serveStatic } = require('./e2e-lib');

const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), 'vibe-e2e');
const REGISTRY = path.resolve(process.env.E2E_REGISTRY || path.join(__dirname, '..', '..', '..', 'vibe-deck-plugins'));
const PLUGINS = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-e2e-plugins-'));
const SITE = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-e2e-site-'));
const REG_PORT = 8795;
const SITE_PORT = 8796;
const INDEX = 'http://127.0.0.1:' + REG_PORT + '/index.json';

const INDEXED = JSON.parse(fs.readFileSync(path.join(REGISTRY, 'index.json'), 'utf8')).plugins;
const NEWS = INDEXED.filter(function (p) { return (p.tags || []).indexOf('news') >= 0; }).length;

function b64url(text) { return Buffer.from(text, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const report = new Report();
  if (!fs.existsSync(path.join(REGISTRY, 'index.json'))) {
    report.check('registro del market', false, 'non trovo ' + REGISTRY + ' (E2E_REGISTRY=cartella di vibe-deck-plugins)');
    report.end();
  }
  execFileSync(process.execPath, [path.join(__dirname, 'build-site.js'), SITE], { stdio: 'ignore' });
  const reg = await serveStatic(REGISTRY, REG_PORT);
  const site = await serveStatic(SITE, SITE_PORT);
  const s = new Session({ port: 8794, cdpPort: 9335, env: { DOCK_PLUGINS_DIR: PLUGINS, DOCK_MARKET_INDEX: INDEX } });
  try {
    await s.start();
    const cdp = s.cdp;
    const hand = new Hand(cdp);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__errors=[];window.addEventListener("error",function(e){window.__errors.push(e.message);});window.__opened=[];window.open=function(u){window.__opened.push(u);return null;};window.confirm=function(m){(window.__asked=window.__asked||[]).push(m);return true;};' });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });

    report.group('Market nel pannello');
    await cdp.send('Page.navigate', { url: s.base + '/control' });
    const rows = await waitFor(function () { return cdp.eval('document.querySelectorAll("#mk-list .mk-row").length'); }, 15000, 'market').catch(function () { return 0; });
    report.check('elenco del market', rows === INDEXED.length, rows + ' plugin');
    await hand.click('#mk-hacker-news [data-mk="install"]');
    const asked = await cdp.eval('(window.__asked||[]).join(" | ")');
    report.check('prima di installare dice da quali siti legge', /hn\.algolia\.com/.test(asked), asked);
    const installed = await waitFor(function () { return cdp.eval('!!document.querySelector("#mk-hacker-news [data-mk=remove]")'); }, 8000, 'installato').catch(function () { return false; });
    report.check('installato con un clic', installed && fs.existsSync(path.join(PLUGINS, 'hacker-news', 'widgets', 'prima-pagina.json')));
    const info = await s.api('GET', '/api/control/info', null, { 'x-dock-control': '1' });
    report.check('i suoi widget sono nel catalogo della HOME', info.homeEditor.catalog.some(function (c) { return c.id === 'hacker-news.prima-pagina'; }));
    const view = await s.api('GET', '/api/shapes/hacker-news/prima-pagina');
    report.check('il widget legge le notizie', view.shape === 'list' && (view.items.length > 0 || !!view.error), view.error || view.items.length + ' notizie');
    await cdp.eval('document.getElementById("market-card").scrollIntoView();true');
    await sleep(300);
    await cdp.screenshot(path.join(OUT, 'market-pannello.png'));
    await hand.click('#mk-hacker-news [data-mk="remove"]');
    const removed = await waitFor(function () { return cdp.eval('!!document.querySelector("#mk-hacker-news [data-mk=install]")'); }, 8000, 'tolto').catch(function () { return false; });
    report.check('"Togli" lo rimuove', removed && !fs.existsSync(path.join(PLUGINS, 'hacker-news')));
    await cdp.send('Page.navigate', { url: s.base + '/control#market-card&install=crypto' });
    const focus = await waitFor(function () { return cdp.eval('!!document.querySelector("#mk-crypto.focus")'); }, 10000, 'link diretto').catch(function () { return false; });
    report.check('il link "Install" del sito evidenzia il plugin nel pannello', focus);

    report.group('Proponi al market dal pannello');
    await s.api('POST', '/api/control/widgets', { plugin: 'miei', id: 'mia-cpu', def: { name: 'Mia CPU', shape: 'value', source: { type: 'pc' }, show: { value: '{{cpu.usage}}', unit: '%' }, tap: { type: 'command', id: 'x' } } }, { 'x-dock-control': '1' });
    await cdp.send('Page.navigate', { url: s.base + '/control' });
    await waitFor(function () { return cdp.eval('!!document.querySelector(\'#ed-mine [data-key="miei/mia-cpu"]\')'); }, 10000, 'i tuoi widget');
    await hand.click('#ed-mine [data-key="miei/mia-cpu"] [data-act="propose"]');
    const opened = await cdp.eval('window.__opened[0]||""');
    report.check('apre la pagina di proposta del sito con il widget', /\/submit\.html#w=[A-Za-z0-9_-]+$/.test(opened), opened.slice(0, 80) + '…');

    report.group('Sito: pagina di proposta');
    const local = 'http://127.0.0.1:' + SITE_PORT + '/submit.html' + opened.slice(opened.indexOf('#'));
    await cdp.send('Page.navigate', { url: local });
    const name = await waitFor(function () { return cdp.eval('document.getElementById("w-name").textContent'); }, 8000, 'proposta').catch(function () { return ''; });
    report.check('mostra il widget arrivato dal pannello', name === 'Mia CPU', name);
    const warns = await cdp.eval('document.getElementById("w-warn").textContent');
    report.check('avvisa che i comandi del PC non vanno nel market', /command/.test(warns), warns);
    const send = await cdp.eval('document.getElementById("w-send").href');
    const q = new URL(send).searchParams;
    report.check('"Propose on GitHub" apre il modulo già compilato', /vibe-deck-plugins\/issues\/new/.test(send) && q.get('template') === 'widget.yml' && q.get('name') === 'Mia CPU' && JSON.parse(q.get('widget')).shape === 'value');
    await hand.click('#w-keep');
    const kept = await cdp.eval('JSON.stringify({shown:!document.getElementById("w-kept").hidden,hash:location.hash.slice(0,12)})');
    report.check('"Keep it local" non manda niente', kept === JSON.stringify({ shown: true, hash: '' }), kept);
    await cdp.screenshot(path.join(OUT, 'sito-proposta.png'));
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + SITE_PORT + '/submit.html#w=' + b64url(JSON.stringify({ id: 'x', def: { name: 'Meteo è bello', shape: 'text', source: { type: 'http', url: 'https://api.open-meteo.com/v1/x' }, show: { text: 'x' } } })) });
    const accents = await waitFor(function () { return cdp.eval('document.getElementById("w-name").textContent+" | "+document.getElementById("w-source").textContent+" | "+document.getElementById("w-warn").textContent.length'); }, 5000, 'accenti').catch(function () { return ''; });
    report.check('accenti e siti letti correttamente, nessun avviso per un widget adatto', accents === 'Meteo è bello | the internet — api.open-meteo.com | 0', accents);

    for (const dev of [{ name: 'desktop', w: 1400, h: 1000, mobile: false }, { name: 'telefono', w: 390, h: 844, mobile: true }]) {
      report.group('Sito: home e market (' + dev.name + ')');
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: dev.w, height: dev.h, deviceScaleFactor: dev.mobile ? 2 : 1, mobile: dev.mobile });
      await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + SITE_PORT + '/index.html?index=' + encodeURIComponent(INDEX) });
      const cards = await waitFor(function () { return cdp.eval('document.querySelectorAll("#cards .card").length'); }, 10000, 'card').catch(function () { return 0; });
      report.check('card del market', cards === INDEXED.length, cards + ' card');
      report.check('icone vere nelle card', await cdp.eval('document.querySelectorAll("#cards .card-ico svg").length===' + INDEXED.length));
      const scroll = await cdp.eval('document.documentElement.scrollWidth<=window.innerWidth');
      report.check('niente scorrimento orizzontale', scroll);
      await hand.fill('#q', 'crypto');
      report.check('ricerca', await cdp.eval('[].slice.call(document.querySelectorAll("#cards .card")).some(function(c){return c.dataset.id==="crypto";})&&document.querySelectorAll("#cards .card").length<' + INDEXED.length));
      const href = await cdp.eval('document.querySelector("#cards .card[data-id=crypto] .btn").getAttribute("href")');
      report.check('"Install" porta al pannello sul plugin', href === 'http://127.0.0.1:8787/control#market-card&install=crypto', href);
      await cdp.eval('(function(){var q=document.getElementById("q");q.value="";q.dispatchEvent(new Event("input"));return true;})()');
      await hand.click('#tags [data-tag="news"]');
      report.check('filtro per etichetta', await cdp.eval('document.querySelectorAll("#cards .card").length===' + NEWS));
      await hand.click('#tags [data-tag=""]');
      await cdp.eval('window.scrollTo({top:0,behavior:"instant"});true');
      await sleep(400);
      await cdp.screenshot(path.join(OUT, 'sito-' + dev.name + '-inizio.png'));
      await cdp.eval('document.getElementById("market").scrollIntoView({behavior:"instant"});true');
      await sleep(400);
      await cdp.screenshot(path.join(OUT, 'sito-' + dev.name + '-market.png'));
    }
    const errors = await cdp.eval('window.__errors||[]');
    report.check('nessun errore JavaScript', !errors.length, errors.join(' | '));
    console.log('\nScreenshot in ' + OUT);
  } catch (e) {
    report.check('prova completata', false, e.message);
  } finally {
    await s.stop();
    reg.close();
    site.close();
    try { fs.rmSync(PLUGINS, { recursive: true, force: true }); fs.rmSync(SITE, { recursive: true, force: true }); } catch (e) { }
  }
  report.end();
}

main();
