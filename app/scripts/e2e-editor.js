'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sleep, waitFor, Session, Report } = require('./e2e-lib');

const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), 'vibe-e2e');
const PLUGINS = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-e2e-plugins-'));

class Hand {
  constructor(cdp) { this.cdp = cdp; }

  async point(selector) {
    const r = await this.cdp.eval('(function(){var n=document.querySelector(' + JSON.stringify(selector) + ');if(!n)return null;n.scrollIntoView({block:"center"});var b=n.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2,w:b.width};})()');
    if (!r) throw new Error('Non trovo ' + selector);
    return r;
  }

  async click(selector) {
    const p = await this.point(selector);
    await sleep(80);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await this.cdp.send('Input.dispatchMouseEvent', { type: type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
    }
    await sleep(120);
  }

  async type(text) {
    await this.cdp.send('Input.insertText', { text: text });
    await sleep(120);
  }

  async fill(selector, text) {
    await this.click(selector);
    await this.cdp.eval('(function(){var n=document.querySelector(' + JSON.stringify(selector) + ');n.select&&n.select();})()');
    await this.type(text);
  }

  async choose(selector, value) {
    await this.point(selector);
    const ok = await this.cdp.eval('(function(){var n=document.querySelector(' + JSON.stringify(selector) + ');if(!n)return false;n.value=' + JSON.stringify(value) + ';n.dispatchEvent(new Event("change",{bubbles:true}));return n.value===' + JSON.stringify(value) + ';})()');
    if (!ok) throw new Error('Opzione ' + value + ' non trovata in ' + selector);
    await sleep(200);
  }
}

const field = (p) => '#editor-card [data-path="' + p + '"] input, #editor-card [data-path="' + p + '"] textarea';

async function clickChip(cdp, hand, label, inside) {
  const id = await cdp.eval('(function(){var all=[].slice.call(document.querySelectorAll("' + (inside ? '#ed-fields .ed-subchips .ed-chip' : '#ed-fields .ed-chip') + '"));var n=all.filter(function(c){return c.querySelector("b").textContent.trim()===' + JSON.stringify(label) + ';})[0];if(!n)return null;n.id=n.id||("chip-"+Math.random().toString(36).slice(2));return n.id;})()');
  if (!id) throw new Error('Dato non trovato: ' + label);
  await hand.click('#' + id);
}

async function frame(cdp, expr) {
  return cdp.eval('(function(){var d=document.getElementById("ed-frame").contentDocument;if(!d)return null;' + expr + '})()');
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const report = new Report();
  const s = new Session({ port: 8793, cdpPort: 9334, env: { DOCK_PLUGINS_DIR: PLUGINS } });
  try {
    await s.start();
    const cdp = s.cdp;
    const hand = new Hand(cdp);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__errors=[];window.addEventListener("error",function(e){window.__errors.push(e.message);});window.addEventListener("unhandledrejection",function(e){window.__errors.push(String(e.reason));});' });
    await cdp.send('Page.navigate', { url: s.base + '/control' });
    await waitFor(function () { return cdp.eval('document.querySelectorAll("#ed-shapes .ed-shape").length===8'); }, 20000, 'editor');
    await cdp.eval('window.confirm=function(){return true;};true');

    report.group('Widget numero con i dati del PC');
    await hand.click('.ed-shape[data-shape="value"]');
    await hand.click(field('show.value'));
    await clickChip(cdp, hand, 'Uso CPU');
    report.check('tocco su un dato inserisce il segnaposto', (await cdp.eval('document.querySelector(' + JSON.stringify(field('show.value')) + ').value')) === '{{cpu.usage}}');
    await hand.fill(field('show.unit'), '%');
    await hand.fill(field('show.label'), 'PROCESSORE');
    await hand.fill('#editor-card [data-path="show.icon"] input', 'cpu');
    await hand.click(field('show.bar'));
    await clickChip(cdp, hand, 'Uso CPU');
    await hand.choose('#ed-actions .ed-action select', 'hotkey');
    await hand.fill(field('tap.keys'), 'CTRL+SHIFT+ESC');
    await hand.fill(field('name'), 'Mia CPU');
    const ready = await waitFor(function () { return cdp.eval('document.getElementById("ed-state").textContent==="PRONTO"&&!document.getElementById("ed-save").disabled'); }, 8000, 'pronto').catch(function () { return false; });
    report.check('editor senza problemi e Salva attivo', ready, await cdp.eval('document.getElementById("ed-problems").textContent'));
    const pv = await waitFor(function () { return frame(cdp, 'var t=d.querySelector(".w-title"),n=d.querySelector(".sh-num"),g=d.querySelector(".sh-glyph svg");return t&&n&&/\\d/.test(n.textContent)?{t:t.textContent,n:n.textContent,g:!!g}:null;'); }, 8000, 'anteprima').catch(function () { return null; });
    report.check('anteprima disegnata come sul tablet', pv && pv.t === 'PROCESSORE' && pv.g, JSON.stringify(pv));
    await cdp.eval('document.getElementById("editor-card").scrollIntoView();true');
    await sleep(300);
    await cdp.screenshot(path.join(OUT, 'editor-valore.png'));
    await hand.click('#ed-save');
    const saved = await waitFor(async function () { return (await s.api('GET', '/api/control/widgets', null, { 'x-dock-control': '1' })).filter(function (w) { return w.key === 'miei/mia-cpu'; })[0]; }, 5000, 'salvataggio').catch(function () { return null; });
    report.check('salvato in plugins/miei/widgets/mia-cpu.json', saved && fs.existsSync(path.join(PLUGINS, 'miei', 'widgets', 'mia-cpu.json')));
    report.check('azione del tocco salvata', saved && saved.def.tap && saved.def.tap.type === 'hotkey' && saved.def.tap.keys.join('+') === 'CTRL+SHIFT+ESC', saved ? JSON.stringify(saved.def.tap) : '');
    const info = await s.api('GET', '/api/control/info', null, { 'x-dock-control': '1' });
    report.check('compare nel catalogo della HOME', info.homeEditor.catalog.some(function (c) { return c.id === 'miei.mia-cpu'; }));
    const view = await s.api('GET', '/api/shapes/miei/mia-cpu');
    report.check('il tablet lo riceve', view.shape === 'value' && view.label === 'PROCESSORE', view.value + view.unit);

    report.group('Lista da dati scritti a mano, campi trovati con "Prova la fonte"');
    await hand.click('#ed-new');
    await hand.click('.ed-shape[data-shape="list"]');
    await hand.choose('#ed-source select[data-ed="source"]', 'static');
    await hand.fill(field('source.data'), '{"compiti":[{"nome":"Spesa","fatto":40},{"nome":"Palestra","fatto":100}]}');
    await hand.click('[data-ed="sample"]');
    const found = await waitFor(function () { return cdp.eval('document.querySelectorAll("#ed-fields .ed-chip").length>0'); }, 5000, 'dati trovati').catch(function () { return false; });
    report.check('"Prova la fonte" trova la lista e i campi delle righe', found && await cdp.eval('document.querySelectorAll("#ed-fields .ed-subchips .ed-chip").length===2'));
    await hand.click(field('show.items'));
    await clickChip(cdp, hand, 'compiti');
    await hand.click(field('show.item.title'));
    await clickChip(cdp, hand, 'nome', true);
    await hand.click(field('show.item.bar'));
    await clickChip(cdp, hand, 'fatto', true);
    await hand.fill(field('show.label'), 'DA FARE');
    await hand.fill(field('name'), 'Le mie cose');
    const rows = await waitFor(function () { return frame(cdp, 'var r=[].slice.call(d.querySelectorAll(".sh-row .sh-rtitle")).map(function(x){return x.textContent;});return r.length===2?r:null;'); }, 8000, 'righe').catch(function () { return null; });
    report.check('anteprima con le righe', rows && rows[0] === 'Spesa' && rows[1] === 'Palestra', JSON.stringify(rows));
    const bars = await frame(cdp, 'return d.querySelectorAll(".sh-rbar").length;');
    report.check('barre nelle righe', bars === 2);
    await cdp.eval('document.getElementById("editor-card").scrollIntoView();true');
    await sleep(300);
    await cdp.screenshot(path.join(OUT, 'editor-lista.png'));
    await hand.click('#ed-save');
    const list = await waitFor(async function () { return (await s.api('GET', '/api/control/widgets', null, { 'x-dock-control': '1' })).filter(function (w) { return w.key === 'miei/le-mie-cose'; })[0]; }, 5000, 'salvataggio lista').catch(function () { return null; });
    report.check('lista salvata', !!list, list ? JSON.stringify(list.def.show.item) : '');

    report.group('Problemi, modifica, tema ed eliminazione');
    await hand.click('#ed-new');
    await hand.choose('#ed-source select[data-ed="source"]', 'http');
    await hand.fill(field('source.url'), 'https://example.com/dati.json');
    await hand.fill(field('name'), 'Senza permesso');
    const warn = await waitFor(function () { return cdp.eval('/permissions/.test(document.getElementById("ed-problems").textContent)&&document.getElementById("ed-save").disabled'); }, 6000, 'problema').catch(function () { return false; });
    report.check('sito non consentito: problema mostrato e Salva bloccato', warn);
    await hand.click('#ed-mine [data-key="miei/mia-cpu"] .btn');
    const loaded = await waitFor(function () { return cdp.eval('document.getElementById("ed-title").textContent.indexOf("Mia CPU")>=0&&document.querySelector(' + JSON.stringify(field('show.label')) + ').value==="PROCESSORE"'); }, 4000, 'modifica').catch(function () { return false; });
    report.check('"Modifica" ricarica il widget nell\'editor', loaded);
    await hand.click('#theme-pick button[data-theme="neon"]');
    await sleep(900);
    await cdp.eval('document.getElementById("editor-card").scrollIntoView();true');
    await sleep(500);
    await cdp.screenshot(path.join(OUT, 'editor-neon.png'));
    report.check('anteprima nel tema del pannello', await frame(cdp, 'return d.body.className.indexOf("th-neon")>=0;'));
    await hand.click('#ed-mine [data-key="miei/le-mie-cose"] .ibtn.rm');
    const gone = await waitFor(function () { return cdp.eval('!document.querySelector(\'#ed-mine [data-key="miei/le-mie-cose"]\')'); }, 4000, 'eliminazione').catch(function () { return false; });
    report.check('eliminato', gone && !fs.existsSync(path.join(PLUGINS, 'miei', 'widgets', 'le-mie-cose.json')));
    const errors = await cdp.eval('window.__errors||[]');
    report.check('nessun errore JavaScript nel pannello', !errors.length, errors.join(' | '));
    console.log('\nScreenshot in ' + OUT);
  } catch (e) {
    report.check('prova completata', false, e.message);
  } finally {
    await s.stop();
    try { fs.rmSync(PLUGINS, { recursive: true, force: true }); } catch (e) { }
  }
  report.end();
}

main();
