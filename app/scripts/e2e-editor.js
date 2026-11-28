'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { sleep, waitFor, Session, Report, Hand, serveStatic } = require('./e2e-lib');

const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), 'vibe-e2e');
const PLUGINS = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-e2e-plugins-'));
const SITE = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-e2e-site-'));
const SITE_PORT = 8797;
const SITE_URL = 'http://127.0.0.1:' + SITE_PORT;

const field = (p) => '#editor-card [data-path="' + p + '"] input, #editor-card [data-path="' + p + '"] textarea';

async function clickChip(cdp, hand, label) {
  const id = await cdp.eval('(function(){var all=[].slice.call(document.querySelectorAll("#ed-fields .ed-chip"));var n=all.filter(function(c){return c.querySelector("b").textContent.trim()===' + JSON.stringify(label) + ';})[0];if(!n)return null;n.id=n.id||("chip-"+Math.random().toString(36).slice(2));return n.id;})()');
  if (!id) throw new Error('Dato non trovato: ' + label);
  await hand.click('#' + id);
}

function frame(cdp, expr) {
  return cdp.eval('(function(){var d=document.getElementById("ed-frame").contentDocument;if(!d)return null;' + expr + '})()');
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const report = new Report();
  execFileSync(process.execPath, [path.join(__dirname, 'build-site.js'), SITE], { stdio: 'ignore' });
  fs.writeFileSync(path.join(SITE, 'prova-dati.json'), JSON.stringify({ meteo: { temperatura: 21.5, cielo: 'sereno' }, citta: 'Roma' }));
  const site = await serveStatic(SITE, SITE_PORT);
  const s = new Session({ port: 8793, cdpPort: 9334, env: { DOCK_PLUGINS_DIR: PLUGINS } });
  try {
    await s.start();
    const cdp = s.cdp;
    const hand = new Hand(cdp);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__errors=window.__errors||[];window.addEventListener("error",function(e){window.__errors.push(e.message);});window.addEventListener("unhandledrejection",function(e){window.__errors.push(String(e.reason));});window.__opened=[];window.open=function(u){window.__opened.push(u);return null;};window.confirm=function(){return true;};' });
    await cdp.send('Page.navigate', { url: SITE_URL + '/create.html' });
    await waitFor(function () { return cdp.eval('document.querySelectorAll("#ed-shapes .ed-shape").length===8'); }, 20000, 'editor');
    await cdp.eval('localStorage.clear();localStorage.setItem("vd-panel",' + JSON.stringify(s.base) + ');true');
    await cdp.send('Page.reload');
    await waitFor(function () { return cdp.eval('document.querySelectorAll("#ed-shapes .ed-shape").length===8'); }, 20000, 'editor');

    report.group('Sito: widget numero con i dati del PC');
    const noName = await waitFor(function () { return cdp.eval('/PROBLEM/.test(document.getElementById("ed-state").textContent)&&document.getElementById("fin-local").disabled'); }, 5000, 'problema').catch(function () { return false; });
    report.check('senza nome: un problema e i pulsanti finali spenti', noName);
    report.check('le fonti di altri plugin non si offrono (un widget deve funzionare da solo)', await cdp.eval('![].slice.call(document.querySelectorAll("[data-ed=source] option")).some(function(o){return o.value.indexOf(".")>=0;})'));
    await hand.click('.ed-shape[data-shape="value"]');
    await hand.click(field('show.value'));
    await clickChip(cdp, hand, 'CPU usage');
    report.check('tocco su un dato inserisce il segnaposto', (await cdp.eval('document.querySelector(' + JSON.stringify(field('show.value')) + ').value')) === '{{cpu.usage}}');
    await hand.fill(field('show.unit'), '%');
    await hand.fill(field('show.label'), 'PROCESSORE');
    await hand.click(field('show.bar'));
    await clickChip(cdp, hand, 'CPU usage');
    await hand.choose('#ed-actions .ed-action select', 'hotkey');
    await hand.fill(field('tap.keys'), 'CTRL+SHIFT+ESC');
    await hand.fill(field('name'), 'Mia CPU');
    await hand.click(field('icon'));
    const grid = await cdp.eval('(function(){var g=document.querySelector("#editor-card [data-path=icon] .ed-icongrid");if(!g||g.hidden)return null;var r=g.getBoundingClientRect();return {h:r.height,sh:g.scrollHeight,n:g.querySelectorAll(".ed-ic").length};})()');
    report.check('icone: griglia con altezza massima (non una lista infinita)', grid && grid.h <= 260 && grid.n > 40 && grid.sh > grid.h, JSON.stringify(grid));
    fs.writeFileSync(path.join(OUT, 'site-icon-picker.png'), Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await hand.type('cp');
    const few = await cdp.eval('document.querySelectorAll("#editor-card [data-path=icon] .ed-ic").length');
    report.check('icone: scrivere filtra la griglia', few >= 1 && few < 10, few + ' icone');
    await hand.click('#editor-card [data-path="icon"] .ed-ic[data-icon="cpu"]');
    report.check('icone: il tocco sceglie e chiude la griglia', await cdp.eval('document.querySelector(' + JSON.stringify(field('icon')) + ').value==="cpu"&&document.querySelector("#editor-card [data-path=icon] .ed-icongrid").hidden'));
    const ready = await waitFor(function () { return cdp.eval('document.getElementById("ed-state").textContent==="READY"&&!document.getElementById("fin-local").disabled'); }, 8000, 'pronto').catch(function () { return false; });
    report.check('nessun problema: "Add to my deck" attivo', ready, await cdp.eval('document.getElementById("ed-problems").textContent'));
    const shown = await waitFor(function () { return frame(cdp, 'var t=d.body.textContent;return /PROCESSORE/.test(t)&&/37/.test(t)&&t;'); }, 8000, 'anteprima').catch(function () { return ''; });
    report.check('anteprima disegnata come sul tablet, con dati di esempio', !!shown, String(shown).replace(/\s+/g, ' ').slice(0, 80));
    await hand.choose('#ed-theme', 'neon');
    const neon = await waitFor(function () { return frame(cdp, 'return d.body.className.indexOf("th-neon")>=0;'); }, 5000, 'tema').catch(function () { return false; });
    report.check('il tema dell\'anteprima si cambia', neon);
    await cdp.eval('document.getElementById("finish").scrollIntoView({block:"center"});true');
    await sleep(300);
    await cdp.screenshot(path.join(OUT, 'editor-sito.png'));

    report.group('Sito: proporre al market con il nome dell\'autore');
    report.check('senza nome dell\'autore non si propone', await cdp.eval('document.getElementById("fin-market").disabled&&/name/.test(document.getElementById("fin-hint").textContent)'));
    await hand.fill('#fin-author', 'Stefano');
    await hand.click('#fin-market');
    const issue = await cdp.eval('window.__opened.pop()||""');
    let q = null;
    try { q = new URL(issue).searchParams; } catch (e) { q = null; }
    report.check('apre la proposta su GitHub con autore e JSON', !!q && /vibe-deck-plugins\/issues\/new/.test(issue) && q.get('author') === 'Stefano' && JSON.parse(q.get('widget')).author === 'Stefano' && q.get('name') === 'Mia CPU', issue.slice(0, 90));
    const warn = await cdp.eval('document.getElementById("fin-warn").textContent');
    report.check('nessun avviso per un widget adatto al market', !warn, warn);

    report.group('Sito → pannello: tenerlo nella propria dock');
    await hand.click('#fin-local');
    const link = await cdp.eval('window.__opened.pop()||""');
    report.check('apre il pannello della dock con il widget', link.indexOf(s.base + '/control#widget=') === 0, link.slice(0, 60));
    await cdp.send('Page.navigate', { url: link });
    const dlg = await waitFor(function () { return cdp.eval('document.getElementById("confirm-dlg").open&&!document.getElementById("cd-ok").hidden&&document.getElementById("cd-body").textContent'); }, 15000, 'conferma').catch(function () { return ''; });
    report.check('il pannello chiede conferma e mostra nome e autore', /Mia CPU/.test(dlg) && /di Stefano/.test(dlg), dlg.slice(0, 100));
    await cdp.screenshot(path.join(OUT, 'editor-conferma-pannello.png'));
    await hand.click('#cd-ok');
    const file = path.join(PLUGINS, 'miei', 'widgets', 'mia-cpu.json');
    const saved = await waitFor(function () { return fs.existsSync(file); }, 8000, 'salvato').catch(function () { return false; });
    report.check('salvato in plugins/miei con l\'autore', saved && JSON.parse(fs.readFileSync(file, 'utf8')).author === 'Stefano');
    const listed = await waitFor(function () { return cdp.eval('/Mia CPU/.test(document.getElementById("in-mine").textContent)&&/di Stefano/.test(document.getElementById("in-mine").textContent)'); }, 8000, 'installati').catch(function () { return false; });
    report.check('compare in "I tuoi widget" della scheda Installati', listed);
    report.check('il link è sparito dall\'indirizzo (niente doppia conferma)', await cdp.eval('location.hash===""'));
    const info = await s.api('GET', '/api/control/info', null, { 'x-dock-control': '1' });
    report.check('il widget è nel catalogo della HOME', info.homeEditor.catalog.some(function (c) { return c.id === 'miei.mia-cpu'; }));

    report.group('Sito: fonte da internet, bozza e link condiviso');
    await cdp.send('Page.navigate', { url: SITE_URL + '/create.html' });
    await waitFor(function () { return cdp.eval('document.querySelectorAll("#ed-shapes .ed-shape").length===8'); }, 20000, 'editor');
    report.check('la bozza resta dopo aver ricaricato', (await cdp.eval('document.querySelector(' + JSON.stringify(field('name')) + ').value')) === 'Mia CPU');
    await hand.click('.ed-shape[data-shape="text"]');
    await hand.choose('[data-ed="source"]', 'http');
    await hand.fill(field('source.url'), SITE_URL + '/prova-dati.json');
    await hand.click('[data-ed="sample"]');
    const chips = await waitFor(function () { return cdp.eval('document.querySelectorAll("#ed-fields .ed-chip").length'); }, 8000, 'dati').catch(function () { return 0; });
    report.check('"Try the address" legge il JSON dal browser e mostra i dati', chips >= 3, chips + ' dati');
    await hand.click(field('show.text'));
    await clickChip(cdp, hand, 'citta');
    const roma = await waitFor(function () { return frame(cdp, 'return /Roma/.test(d.body.textContent);'); }, 6000, 'anteprima http').catch(function () { return false; });
    report.check('anteprima con i dati veri dell\'indirizzo', roma);
    const sharedDef = { name: 'Condiviso', shape: 'text', source: { type: 'static', data: { t: 'ciao' } }, show: { text: '{{t}}' } };
    const b64 = Buffer.from(JSON.stringify({ id: 'condiviso', def: sharedDef }), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await cdp.send('Page.navigate', { url: SITE_URL + '/create.html#w=' + b64 });
    const imported = await waitFor(function () { return cdp.eval('document.getElementById("ed-title").textContent==="Condiviso"&&location.hash===""'); }, 10000, 'link').catch(function () { return false; });
    report.check('un link #w= apre il widget nell\'editor', imported);
    await cdp.send('Page.navigate', { url: SITE_URL + '/submit.html#w=' + b64 });
    const moved = await waitFor(function () { return cdp.eval('/create\\.html$/.test(location.pathname)&&document.getElementById("ed-title")&&document.getElementById("ed-title").textContent==="Condiviso"'); }, 10000, 'vecchio link').catch(function () { return false; });
    report.check('i vecchi link a submit.html arrivano all\'editor', moved);

    report.group('Sito: telefono');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Page.reload');
    await waitFor(function () { return cdp.eval('document.querySelectorAll("#ed-shapes .ed-shape").length===8'); }, 20000, 'editor');
    report.check('niente scorrimento orizzontale', await cdp.eval('document.documentElement.scrollWidth<=window.innerWidth+1'));
    await cdp.screenshot(path.join(OUT, 'editor-sito-telefono.png'));

    const errors = await cdp.eval('window.__errors||[]');
    report.check('nessun errore JavaScript', !errors.length, errors.join(' | '));
    console.log('\nScreenshot in ' + OUT);
  } catch (e) {
    report.check('prova completata', false, e.message);
  } finally {
    await s.stop();
    site.close();
    try { fs.rmSync(PLUGINS, { recursive: true, force: true }); fs.rmSync(SITE, { recursive: true, force: true }); } catch (e) { }
  }
  report.end();
}

main();
