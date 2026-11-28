'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sleep, waitFor, Session, Report, Hand, Finger } = require('./e2e-lib');

const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), 'vibe-e2e');
const CTRL = { 'x-dock-control': '1' };

function shot(cdp, name) {
  return cdp.send('Page.captureScreenshot', { format: 'png' }).then(function (r) { fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64')); });
}

async function singleGame(s, cdp, hand, report) {
  report.group('Pannello: un gioco solo come widget');
  const exe = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-e2e-game-')), 'stardew.sh');
  fs.writeFileSync(exe, 'x');
  await s.api('POST', '/api/control/games', { path: exe, label: 'Stardew Valley' }, CTRL);
  await cdp.send('Page.navigate', { url: s.base + '/control' });
  await waitFor(function () { return cdp.eval('document.querySelectorAll("#hm-targets [data-hmgo]").length>=2'); }, 20000, 'editor pagine');
  report.check('il catalogo è diviso in sezioni per categoria', await cdp.eval('document.querySelectorAll("#hm-catalog .hm-group[data-category]").length>=3'));
  report.check('il gioco sta nella sezione Giochi', await cdp.eval('!!document.querySelector("#hm-catalog .hm-group[data-category=gaming] [data-hmadd=game_stardew_valley]")'));
  report.check('il gioco è nel catalogo dei widget', await cdp.eval('!!document.querySelector("#hm-catalog [data-hmadd=game_stardew_valley]")'));
  report.check('il widget generico "game" non è nel catalogo', await cdp.eval('!document.querySelector("#hm-catalog [data-hmadd=game]")'));
  await hand.click('#hm-targets [data-hmgo="new"]');
  await hand.fill('#hm-title', 'Play');
  await hand.click('#hm-catalog [data-hmadd="game_stardew_valley"]');
  await hand.click('#hm-catalog [data-hmadd="clock"]');
  report.check('gioco e orologio nella griglia', await cdp.eval('document.querySelectorAll("#hm-board .hm-w").length===2'));
  await cdp.eval('window.scrollTo(0, document.getElementById("home-card").offsetTop - 10);true');
  await sleep(300);
  await shot(cdp, 'pages-game-editor.png');
  await hand.click('#hm-save');
  const made = await waitFor(async function () {
    const i = await s.api('GET', '/api/control/info', null, CTRL);
    return (i.customPages || []).filter(function (p) { return p.id === 'u-play'; })[0];
  }, 5000, 'salvataggio').catch(function () { return null; });
  report.check('pagina con il gioco salvata', made && made.tiles.some(function (t) { return t.id === 'game_stardew_valley'; }), made ? JSON.stringify(made.tiles) : 'non trovata');
  await waitFor(function () { return cdp.eval('!!document.querySelector("#off .item[data-id=u-play] .ibtn.add")'); }, 4000, 'disponibili');
  await hand.click('#off .item[data-id="u-play"] .ibtn.add');
  await hand.click('#save');
  await waitFor(async function () { return (await s.api('GET', '/api/control/info', null, CTRL)).tabs.indexOf('u-play') >= 0; }, 5000, 'barra');

  const sizes = [[1280, 800, 'tablet'], [1024, 600, 'tablet-small'], [740, 360, 'phone-land'], [360, 740, 'phone-port']];
  for (let k = 0; k < sizes.length; k++) {
    const z = sizes[k];
    report.group('Tablet ' + z[0] + 'x' + z[1] + ': il widget del gioco');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: z[0], height: z[1], deviceScaleFactor: 1, mobile: true });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp.send('Page.navigate', { url: s.base + '/?t=' + s.token });
    await waitFor(function () { return cdp.eval('!!(window.D&&document.querySelector("#tabs .tab[data-page=u-play]"))'); }, 20000, 'scheda');
    await cdp.eval('window.__presses=[];(function(p){D.api.post=function(u,b,cb,t){if(u==="/api/press")window.__presses.push(b);return p.apply(this,arguments);};})(D.api.post);true');
    const finger = new Finger(cdp);
    const tab = await cdp.eval('(function(){var b=document.querySelector("#tabs .tab[data-page=u-play]").getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2,ok:b.width>0};})()');
    if (!tab.ok) await cdp.eval('App&&App.go?App.go("u-play"):0;true');
    else await finger.tap(tab.x, tab.y);
    await sleep(1200);
    report.check('nome e icona del gioco', await cdp.eval('(function(){var e=document.querySelector("#stage .w-game .gm-one span");return !!e&&e.textContent==="STARDEW VALLEY";})()'));
    const b = await cdp.eval('(function(){var e=document.querySelector("#stage .w-game .gm-one");if(!e)return null;var r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height};})()');
    report.check('widget visibile e toccabile', !!b && b.w > 30 && b.h > 30, JSON.stringify(b));
    if (b) await finger.tap(b.x, b.y);
    const pressed = await waitFor(function () { return cdp.eval('window.__presses.length>0&&window.__presses[0].tile==="game_stardew_valley"&&window.__presses[0].page==="games"'); }, 4000, 'tocco').catch(function () { return false; });
    report.check('il tocco avvia il gioco', pressed, JSON.stringify(await cdp.eval('window.__presses')));
    report.check('nessun errore JavaScript sul tablet', (await cdp.eval('window.__errors.length')) === 0, JSON.stringify(await cdp.eval('window.__errors')));
    await shot(cdp, 'pages-game-' + z[2] + '.png');
  }
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
}

async function webhookCard(s, cdp, hand, report) {
  report.group('Pannello: webhook in entrata');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: s.base + '/control' });
  await waitFor(function () { return cdp.eval('document.querySelectorAll("#au-urls .au-url").length>=3'); }, 20000, 'scheda webhook');
  const key = (await s.api('GET', '/api/control/webhooks', null, CTRL)).key;
  report.check('indirizzi con la chiave nascosta', await cdp.eval('document.getElementById("au-urls").textContent.indexOf(' + JSON.stringify(key) + ')<0'));
  await hand.click('#au-show');
  report.check('"Mostra la chiave" la svela', await cdp.eval('document.getElementById("au-urls").textContent.indexOf(' + JSON.stringify(key) + ')>=0'));
  await fetch(s.base + '/hook/' + key + '/push/e2e', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 7 }) });
  await waitFor(async function () { await cdp.eval('window.Automation.reload();true'); return cdp.eval('document.querySelectorAll("#au-values [data-au-forget=e2e]").length===1'); }, 10000, 'valore ricevuto');
  report.check('il valore ricevuto compare nell\'elenco', true);
  await cdp.eval('window.scrollTo(0, document.getElementById("automation-card").offsetTop - 10);true');
  await sleep(300);
  await shot(cdp, 'pages-webhook.png');
  await hand.click('#au-values [data-au-forget=e2e]');
  report.check('"Togli" elimina il valore', await waitFor(function () { return cdp.eval('document.querySelectorAll("#au-values [data-au-forget=e2e]").length===0'); }, 5000, 'togli').then(function () { return true; }, function () { return false; }));
}

async function rulesCard(s, cdp, hand, report) {
  report.group('Pannello: regole quando → allora');
  await cdp.send('Page.navigate', { url: s.base + '/control' });
  await waitFor(function () { return cdp.eval('!!document.getElementById("ru-claude")&&!!document.getElementById("ru-list")'); }, 20000, 'scheda regole');
  await waitFor(function () { return cdp.eval('document.getElementById("ru-count").textContent.length>0'); }, 10000, 'regole caricate');
  report.check('all\'inizio nessuna regola e Salva spento', await cdp.eval('document.querySelectorAll("#ru-list .ru-row").length===0&&document.getElementById("ru-save").disabled'));
  await hand.click('#ru-claude');
  report.check('l\'esempio "Claude ti aspetta" aggiunge una riga con la pagina CLAUDE', await cdp.eval('(function(){var r=document.querySelector("#ru-list .ru-row");return !!r&&r.querySelector("[data-ru=when][data-p=type]").value==="claude_waiting"&&r.querySelector("[data-ru=then][data-p=page]").value==="claude";})()'));
  report.check('Salva si accende', await cdp.eval('!document.getElementById("ru-save").disabled'));
  await cdp.eval('window.scrollTo(0, document.getElementById("rules-card").offsetTop - 10);true');
  await sleep(300);
  await shot(cdp, 'pages-rules.png');
  await hand.click('#ru-save');
  await waitFor(function () { return cdp.eval('document.getElementById("ru-save").disabled'); }, 5000, 'salvataggio');
  const key = (await s.api('GET', '/api/control/webhooks', null, CTRL)).key;
  await fetch(s.base + '/hook/' + key + '/event/claude-waiting', { method: 'POST' });
  const fired = await waitFor(async function () {
    const d = await s.api('GET', '/api/control/rules', null, CTRL);
    return d.rules[0] && d.rules[0].last ? d.rules[0].last : null;
  }, 8000, 'regola scattata').catch(function () { return null; });
  report.check('l\'evento di Claude fa scattare la regola', !!fired && fired.ok, JSON.stringify(fired));
  await hand.click('#ru-list [data-ru-del="0"]');
  report.check('Togli toglie la riga', await cdp.eval('document.querySelectorAll("#ru-list .ru-row").length===0'));
  await hand.click('#ru-save');
  await waitFor(function () { return cdp.eval('document.getElementById("ru-save").disabled'); }, 5000, 'salvataggio vuoto');
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const report = new Report();
  const s = new Session({ port: 8795, cdpPort: 9336 });
  try {
    await s.start();
    const cdp = s.cdp;
    const hand = new Hand(cdp);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__errors=window.__errors||[];window.addEventListener("error",function(e){window.__errors.push(e.message);});window.addEventListener("unhandledrejection",function(e){window.__errors.push(String(e.reason));});window.confirm=function(){return true;};' });
    await cdp.send('Page.navigate', { url: s.base + '/control' });
    await waitFor(function () { return cdp.eval('document.querySelectorAll("#hm-targets [data-hmgo]").length>=2'); }, 20000, 'editor pagine');

    report.group('Pannello: nuova pagina con widget');
    await hand.click('#hm-targets [data-hmgo="new"]');
    report.check('campi nome, descrizione, icona visibili', await cdp.eval('!document.getElementById("hm-meta").hidden'));
    report.check('senza nome e widget non si salva', await cdp.eval('document.getElementById("hm-save").disabled'));
    await hand.fill('#hm-title', 'Giochi');
    await hand.fill('#hm-desc', 'Musica e orologio mentre gioco');
    await hand.click('#hm-icon');
    report.check('scelta dell\'icona: griglia di icone', await cdp.eval('document.querySelectorAll("#hm-icons .hm-ic").length>40'));
    await hand.click('#hm-icons [data-hmicon="gamepad"]');
    await hand.click('#hm-catalog [data-hmadd="nowplaying"]');
    await hand.click('#hm-catalog [data-hmadd="clock"]');
    report.check('due widget nella griglia', await cdp.eval('document.querySelectorAll("#hm-board .hm-w").length===2'));
    report.check('titolo in maiuscolo e pulsante "Crea pagina"', (await cdp.eval('document.getElementById("hm-save").textContent')) === 'Crea pagina' && (await cdp.eval('document.getElementById("hm-label").textContent')) === 'GIOCHI sul tablet');
    await cdp.eval('window.scrollTo(0, document.getElementById("home-card").offsetTop - 10);true');
    await sleep(300);
    await shot(cdp, 'pages-editor-new.png');
    await hand.click('#hm-save');
    const made = await waitFor(async function () {
      const i = await s.api('GET', '/api/control/info', null, CTRL);
      return (i.customPages || []).filter(function (p) { return p.title === 'GIOCHI'; })[0];
    }, 5000, 'salvataggio').catch(function () { return null; });
    report.check('pagina creata sul PC', made && made.id === 'u-giochi' && made.icon === 'gamepad' && made.tiles.length === 2 && made.description === 'Musica e orologio mentre gioco', made ? JSON.stringify(made) : 'non trovata');
    const inOff = await waitFor(function () { return cdp.eval('!!document.querySelector("#off .item[data-id=u-giochi] .tag.mine")'); }, 4000, 'disponibili').catch(function () { return false; });
    report.check('compare tra le disponibili con l\'etichetta TUA', inOff);
    report.check('dopo la creazione l\'editor resta sulla pagina', await cdp.eval('!!document.querySelector("#hm-targets .chip.on[data-hmgo=u-giochi]")'));

    await hand.click('#off .item[data-id="u-giochi"] .ibtn.add');
    await hand.click('#save');
    const inBar = await waitFor(async function () {
      const i = await s.api('GET', '/api/control/info', null, CTRL);
      return i.tabs.indexOf('u-giochi') >= 0;
    }, 5000, 'barra').catch(function () { return false; });
    report.check('aggiunta alla barra del tablet', inBar);

    report.group('Tablet: la pagina nuova');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: true });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp.send('Page.navigate', { url: s.base + '/?t=' + s.token });
    await waitFor(function () { return cdp.eval('!!(window.D&&document.querySelector("#tabs .tab[data-page=u-giochi]"))'); }, 20000, 'scheda');
    const finger = new Finger(cdp);
    const r = await cdp.eval('(function(){var b=document.querySelector("#tabs .tab[data-page=u-giochi]").getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};})()');
    await finger.tap(r.x, r.y);
    await sleep(1200);
    report.check('scheda GIOCHI con l\'icona scelta', await cdp.eval('document.getElementById("page-title").textContent==="GIOCHI"'));
    report.check('i due widget sul tablet (musica e orologio)', await cdp.eval('document.querySelectorAll("#stage .tile").length===2&&!!document.querySelector("#stage .w-clock")'));
    await shot(cdp, 'pages-tablet.png');

    report.group('Pannello: modifica ed elimina');
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: s.base + '/control' });
    await waitFor(function () { return cdp.eval('!!document.querySelector("#on .item[data-id=u-giochi] .ibtn.edit")'); }, 20000, 'lista');
    await hand.click('#on .item[data-id="u-giochi"] .ibtn.edit');
    report.check('modifica dalla lista delle pagine', await cdp.eval('!!document.querySelector("#hm-targets .chip.on[data-hmgo=u-giochi]")&&document.getElementById("hm-title").value==="GIOCHI"'));
    await hand.fill('#hm-title', 'Gaming');
    await hand.click('#hm-save');
    const renamed = await waitFor(async function () {
      const i = await s.api('GET', '/api/control/info', null, CTRL);
      return (i.customPages || []).filter(function (p) { return p.id === 'u-giochi' && p.title === 'GAMING'; })[0];
    }, 5000, 'rinomina').catch(function () { return null; });
    report.check('rinominata, stesso id (resta nella barra)', !!renamed);
    await hand.click('#hm-targets [data-hmgo="main"]');
    report.check('HOME: niente nome/icona, pulsante "Salva HOME"', await cdp.eval('document.getElementById("hm-meta").hidden&&document.getElementById("hm-save").textContent==="Salva HOME"'));
    await hand.click('#hm-targets [data-hmgo="u-giochi"]');
    await hand.click('#hm-delete');
    const gone = await waitFor(async function () {
      const i = await s.api('GET', '/api/control/info', null, CTRL);
      return !(i.customPages || []).length && i.tabs.indexOf('u-giochi') < 0;
    }, 5000, 'eliminata').catch(function () { return false; });
    const dbg = await s.api('GET', '/api/control/info', null, CTRL);
    report.check('eliminata (e tolta dalla barra)', gone, JSON.stringify({ pages: dbg.customPages, tabs: dbg.tabs, del: await cdp.eval('document.getElementById("hm-delete").hidden'), target: await cdp.eval('document.querySelector("#hm-targets .chip.on").dataset.hmgo') }));
    report.check('nessun errore JavaScript nel pannello', (await cdp.eval('window.__errors.length')) === 0, JSON.stringify(await cdp.eval('window.__errors')));

    await singleGame(s, cdp, hand, report);
    await webhookCard(s, cdp, hand, report);
    await rulesCard(s, cdp, hand, report);
  } catch (e) {
    report.check('esecuzione', false, e.message);
  } finally {
    await s.stop();
  }
  console.log('Screenshot in ' + OUT);
  report.end();
}

main();
