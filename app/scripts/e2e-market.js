'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { sleep, waitFor, Session, Report, Hand, serveStatic } = require('./e2e-lib');

const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), 'vibe-e2e');
const REGISTRY = path.resolve(process.env.E2E_REGISTRY || path.join(__dirname, '..', '..', '..', 'vibe-deck-plugins'));
const PLUGINS = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-e2e-plugins-'));
const CONFIG = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-e2e-config-'));
const SITE = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-e2e-site-'));
const REG = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-e2e-registry-'));
const REG_PORT = 8795;
const SITE_PORT = 8796;
const INDEX = 'http://127.0.0.1:' + REG_PORT + '/index.json';
const SITE_URL = 'http://127.0.0.1:' + SITE_PORT;
const TEST_PACK = { id: 'e2e-musica', name: 'Music pack (e2e)', description: 'Charts and music controls', author: 'StefanoDiPatti', icon: 'music', tags: ['music'], includes: ['classifiche-musica', 'comandi-musica'] };

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from, { withFileTypes: true }).forEach(function (d) {
    if (d.name === '.git') return;
    if (d.isDirectory()) copyDir(path.join(from, d.name), path.join(to, d.name));
    else fs.copyFileSync(path.join(from, d.name), path.join(to, d.name));
  });
}

async function openPanel(cdp, url) {
  await cdp.send('Page.navigate', { url: url });
  return waitFor(function () { return cdp.eval('document.getElementById("confirm-dlg").open&&!/Carico/.test(document.getElementById("cd-body").textContent)&&document.getElementById("cd-body").textContent'); }, 15000, 'conferma').catch(function () { return ''; });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const report = new Report();
  if (!fs.existsSync(path.join(REGISTRY, 'index.json'))) {
    report.check('registro del market', false, 'non trovo ' + REGISTRY + ' (E2E_REGISTRY=cartella di vibe-deck-plugins)');
    report.end();
  }
  copyDir(REGISTRY, REG);
  const index = JSON.parse(fs.readFileSync(path.join(REG, 'index.json'), 'utf8'));
  if (!(index.packs || []).length) index.packs = [TEST_PACK];
  fs.writeFileSync(path.join(REG, 'index.json'), JSON.stringify(index));
  const INDEXED = index.plugins;
  const NEWS = INDEXED.filter(function (p) { return (p.tags || []).indexOf('news') >= 0; }).length;
  const PACK = index.packs[0];
  const SINGLE = INDEXED.filter(function (p) { return PACK.includes.indexOf(p.id) < 0 && (p.permissions && p.permissions.http || []).length; })[0];
  execFileSync(process.execPath, [path.join(__dirname, 'build-site.js'), SITE], { stdio: 'ignore' });
  const official = JSON.parse(fs.readFileSync(path.join(SITE, 'data', 'official.json'), 'utf8')).plugins;
  const OFF_PACKS = official.filter(function (p) { return p.type === 'pack'; }).length;
  const OFF_PLUGINS = official.length - OFF_PACKS;
  const reg = await serveStatic(REG, REG_PORT);
  const site = await serveStatic(SITE, SITE_PORT);
  const s = new Session({ port: 8794, cdpPort: 9335, env: { DOCK_PLUGINS_DIR: PLUGINS, DOCK_MARKET_INDEX: INDEX, DOCK_CONFIG_DIR: CONFIG } });
  try {
    await s.start();
    const cdp = s.cdp;
    const hand = new Hand(cdp);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__errors=window.__errors||[];window.addEventListener("error",function(e){window.__errors.push(e.message);});window.confirm=function(){return true;};' });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: SITE_URL + '/market.html' });
    await cdp.eval('localStorage.setItem("vd-panel",' + JSON.stringify(s.base) + ');true');

    for (const dev of [{ name: 'desktop', w: 1400, h: 1000, mobile: false }, { name: 'telefono', w: 390, h: 844, mobile: true }]) {
      report.group('Sito: market (' + dev.name + ')');
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: dev.w, height: dev.h, deviceScaleFactor: dev.mobile ? 2 : 1, mobile: dev.mobile });
      await cdp.send('Page.navigate', { url: SITE_URL + '/market.html?index=' + encodeURIComponent(INDEX) });
      const counts = await waitFor(function () { return cdp.eval('(function(){var p=document.querySelectorAll("#packs .card").length,c=document.querySelectorAll("#cards .card").length;return c>1&&{packs:p,cards:c};})()'); }, 15000, 'card').catch(function () { return null; });
      report.check('prima i pack pronti (ufficiali + del market), poi tutti i plugin', counts && counts.packs === OFF_PACKS + index.packs.length && counts.cards === OFF_PLUGINS + INDEXED.length, JSON.stringify(counts));
      report.check('i pack mostrano i plugin che contengono', await cdp.eval('document.querySelector("#packs .card[data-id=' + PACK.id + '] .incl").children.length===' + PACK.includes.length));
      report.check('icone vere nelle card', await cdp.eval('[].slice.call(document.querySelectorAll(".card .card-ico")).every(function(i){return !!i.querySelector("svg");})'));
      report.check('niente scorrimento orizzontale', await cdp.eval('document.documentElement.scrollWidth<=window.innerWidth+1'));
      await hand.fill('#q', SINGLE.name.split(' ')[0].toLowerCase());
      report.check('ricerca per testo', await cdp.eval('!!document.querySelector("#cards .card[data-id=\'' + SINGLE.id + '\']")&&document.querySelectorAll("#cards .card").length<' + (OFF_PLUGINS + INDEXED.length)));
      await hand.fill('#q', 'stefanodipatti');
      report.check('ricerca per autore', await cdp.eval('document.querySelectorAll("#cards .card").length>=' + INDEXED.length));
      await cdp.eval('(function(){var q=document.getElementById("q");q.value="";q.dispatchEvent(new Event("input"));return true;})()');
      await hand.click('#tags [data-tag="news"]');
      report.check('filtro per categoria', await cdp.eval('document.querySelectorAll("#cards .card").length===' + NEWS));
      await hand.click('#tags [data-tag="streaming"]');
      const streaming = await cdp.eval('[].slice.call(document.querySelectorAll("#cards .card")).map(function(c){return c.dataset.id;}).sort().join(",")+"|"+[].slice.call(document.querySelectorAll("#packs .card")).map(function(c){return c.dataset.id;}).join(",")');
      report.check('categoria Streaming: OBS, Twitch e il loro pack', streaming === 'obs,twitch|streaming', streaming);
      await hand.click('#tags [data-tag=""]');
      const hrefs = await cdp.eval('JSON.stringify({one:document.querySelector("#cards .card[data-id=\'' + SINGLE.id + '\'] [data-act=install]").getAttribute("href"),pack:document.querySelector("#packs .card[data-id=\'' + PACK.id + '\'] [data-act=install]").getAttribute("href"),off:document.querySelector("#packs .card[data-id=streaming] [data-act=install]").getAttribute("href")})');
      const h = JSON.parse(hrefs);
      report.check('"Install" e "Turn on" portano alla conferma nel pannello della dock', h.one === s.base + '/control#install=' + SINGLE.id && h.pack === s.base + '/control#install=' + PACK.id && h.off === s.base + '/control#pack=streaming', hrefs);
      await cdp.eval('window.scrollTo({top:0,behavior:"instant"});true');
      await sleep(400);
      await cdp.screenshot(path.join(OUT, 'market-sito-' + dev.name + '.png'));
    }
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });

    report.group('Sito → pannello: un plugin del market');
    let dlg = await openPanel(cdp, s.base + '/control#install=' + SINGLE.id);
    const host = SINGLE.permissions.http[0];
    report.check('la conferma dice cosa installa e da quali siti legge', dlg.indexOf(SINGLE.name) >= 0 && dlg.indexOf(host) >= 0, dlg.slice(0, 120));
    await hand.click('#cd-ok');
    const one = await waitFor(function () { return fs.existsSync(path.join(PLUGINS, SINGLE.id, 'plugin.json')) && cdp.eval('document.getElementById("in-market").textContent.indexOf(' + JSON.stringify(SINGLE.name) + ')>=0'); }, 10000, 'installato').catch(function () { return false; });
    report.check('installato e mostrato in "Dal market"', one);
    report.check('il link è sparito dall\'indirizzo', await cdp.eval('location.hash===""'));
    dlg = await openPanel(cdp, s.base + '/control#install=' + SINGLE.id);
    report.check('di nuovo lo stesso: "già installato", niente da confermare', /Già installato/.test(dlg) && await cdp.eval('document.getElementById("cd-ok").hidden'));
    await hand.click('#cd-cancel');

    report.group('Sito → pannello: un pack del market');
    dlg = await openPanel(cdp, s.base + '/control#install=' + PACK.id);
    report.check('la conferma elenca i plugin del pack', PACK.includes.every(function (n) { return dlg.indexOf(INDEXED.filter(function (p) { return p.id === n; })[0].name) >= 0; }), dlg.slice(0, 140));
    await cdp.screenshot(path.join(OUT, 'market-conferma-pack.png'));
    await hand.click('#cd-ok');
    const all = await waitFor(function () { return PACK.includes.every(function (n) { return fs.existsSync(path.join(PLUGINS, n, 'plugin.json')); }); }, 15000, 'pack').catch(function () { return false; });
    report.check('tutti i plugin del pack installati', all);
    const info = await s.api('GET', '/api/control/info', null, { 'x-dock-control': '1' });
    report.check('i loro widget sono nel catalogo della HOME', PACK.includes.every(function (n) { return info.homeEditor.catalog.some(function (c) { return c.id.indexOf(n + '.') === 0; }); }));

    report.group('Sito → pannello: un pack ufficiale');
    await s.api('POST', '/api/control/plugins/switch', { id: 'streaming', on: false }, { 'x-dock-control': '1' });
    dlg = await openPanel(cdp, s.base + '/control#pack=streaming');
    report.check('"Turn on" chiede di accendere il pack spento', /OBS Studio/.test(dlg) && /Twitch/.test(dlg) && (await cdp.eval('document.getElementById("cd-ok").textContent')) === 'Accendi', dlg.slice(0, 100));
    await hand.click('#cd-ok');
    const on = await waitFor(async function () { const r = await s.api('GET', '/api/control/installed', null, { 'x-dock-control': '1' }); return r.packs.filter(function (p) { return p.id === 'streaming'; })[0].state === 'on'; }, 8000, 'acceso').catch(function () { return false; });
    report.check('pack acceso', on);
    report.check('riacceso senza riavvio (il codice era ancora caricato)', await cdp.eval('document.getElementById("in-restart").hidden'));

    report.group('Pannello: scheda Installati');
    await hand.click('#installed-card [data-sw="twitch"]');
    const twOff = await waitFor(async function () { const r = await s.api('GET', '/api/control/installed', null, { 'x-dock-control': '1' }); return r.packs.filter(function (p) { return p.id === 'streaming'; })[0].state === 'partial'; }, 8000, 'spento').catch(function () { return false; });
    report.check('un tocco su un plugin del pack lo spegne (pack "in parte")', twOff && await cdp.eval('/IN PARTE/.test(document.querySelector("[data-pack=streaming]").textContent)'));
    report.check('spegnere un plugin con codice chiede di riavviare la dock', await cdp.eval('!document.getElementById("in-restart").hidden'));
    await hand.click('#installed-card [data-rm-market="' + SINGLE.id + '"]');
    const gone = await waitFor(function () { return !fs.existsSync(path.join(PLUGINS, SINGLE.id)); }, 8000, 'tolto').catch(function () { return false; });
    report.check('"Togli" rimuove un plugin del market', gone);
    await cdp.eval('document.getElementById("installed-card").scrollIntoView();true');
    await sleep(400);
    await cdp.screenshot(path.join(OUT, 'market-installati.png'));
    report.check('nel pannello non ci sono più editor e market', await cdp.eval('!document.getElementById("editor-card")&&!document.getElementById("market-card")&&/sito/.test(document.getElementById("site-create").textContent)'));

    const errors = await cdp.eval('window.__errors||[]');
    report.check('nessun errore JavaScript', !errors.length, errors.join(' | '));
    console.log('\nScreenshot in ' + OUT);
  } catch (e) {
    report.check('prova completata', false, e.message);
  } finally {
    await s.stop();
    reg.close();
    site.close();
    [PLUGINS, CONFIG, SITE, REG].forEach(function (d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { } });
  }
  report.end();
}

main();
