'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sleep, waitFor, Session, Report, Hand, Finger } = require('./e2e-lib');

const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), 'vibe-e2e');
const CTRL = { 'x-dock-control': '1' };

function frame(cdp, expr) {
  return cdp.eval('(function(){var w=document.getElementById("th-frame").contentWindow;var d=w&&w.document;if(!d||!d.body)return null;' + expr + '})()');
}
const bodyBg = 'return w.getComputedStyle(d.body).backgroundColor;';

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const report = new Report();
  const s = new Session({ port: 8794, cdpPort: 9335 });
  try {
    await s.start();
    const cdp = s.cdp;
    const hand = new Hand(cdp);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1100, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__errors=window.__errors||[];window.addEventListener("error",function(e){window.__errors.push(e.message);});window.addEventListener("unhandledrejection",function(e){window.__errors.push(String(e.reason));});window.confirm=function(){return true;};' });
    await cdp.send('Page.navigate', { url: s.base + '/control' });
    await waitFor(function () { return cdp.eval('document.querySelectorAll("#th-colors .th-color").length===10'); }, 20000, 'scheda temi');

    report.group('Pannello: scheda Temi');
    report.check('10 colori e i preset', await cdp.eval('document.querySelectorAll("#th-presets .th-preset").length>=8'));
    report.check('4 temi di base nella lista', await cdp.eval('document.querySelectorAll("#th-pick option").length===4'));
    const ready = await waitFor(function () { return frame(cdp, 'return !!(w.VibeTheme&&/hidden/.test(d.getElementById("boot").className));'); }, 20000, 'anteprima').catch(function () { return false; });
    report.check('anteprima: il tablet vero dentro il pannello', ready);
    await sleep(800);

    await hand.click('#th-presets [data-preset="sunset"]');
    const sunset = await waitFor(function () { return frame(cdp, 'var st=d.getElementById("theme-draft");return st&&st.textContent.length>1000&&' + '(' + 'function(){' + bodyBg + '})()==="rgb(23, 17, 28)";'); }, 6000, 'preset').catch(function () { return false; });
    report.check('preset Tramonto: l\'anteprima cambia sfondo', sunset, await frame(cdp, bodyBg));
    report.check('stato NON SALVATO', (await cdp.eval('document.getElementById("th-state").textContent')) === 'NON SALVATO');

    await hand.fill('#th-colors .th-hex[data-tok="accent"]', '#ff00aa');
    const acc = await waitFor(function () { return frame(cdp, 'var st=d.getElementById("theme-draft");return st&&st.textContent.indexOf("#ff00aa")>=0;'); }, 6000, 'accento').catch(function () { return false; });
    report.check('accento scritto a mano: arriva all\'anteprima', acc);
    report.check('il selettore RGB segue il testo', (await cdp.eval('document.querySelector("#th-colors input[type=color][data-tok=accent]").value')) === '#ff00aa');
    await cdp.eval('window.scrollTo(0, document.getElementById("themes-card").offsetTop - 10);true');
    await sleep(500);
    fs.writeFileSync(path.join(OUT, 'themes-panel.png'), Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));

    await hand.click('#th-new');
    await hand.fill('#th-name', 'Prova e2e');
    await hand.click('#th-save');
    const saved = await waitFor(async function () {
      const d = await s.api('GET', '/api/control/themes', null, CTRL);
      return d.themes.filter(function (t) { return t.custom && t.name === 'Prova e2e'; })[0];
    }, 5000, 'salvataggio').catch(function () { return null; });
    report.check('nuovo tema salvato', saved && saved.style === 'classic' && saved.palette.accent === '#ff00aa', saved ? saved.id : 'non trovato');
    const cfg = await s.api('GET', '/api/config');
    const onTablet = cfg.themes.filter(function (t) { return saved && t.id === saved.id; })[0];
    report.check('il tablet riceve il tema con la sua versione', onTablet && onTablet.v && onTablet.sw[2] === '#ff00aa');
    const css = await (await fetch(s.base + '/theme-css/' + (saved ? saved.id : 'x') + '.css')).text();
    report.check('CSS del tema generato dal server', css.length > 2000 && css.indexOf('#ff00aa') >= 0, css.length + ' caratteri');

    await hand.choose('#th-pick', 'neon');
    await hand.click('#th-presets [data-preset="forest"]');
    await hand.click('#th-save');
    const neon = await waitFor(async function () {
      const d = await s.api('GET', '/api/control/themes', null, CTRL);
      return d.themes.filter(function (t) { return t.id === 'neon' && t.modified; })[0];
    }, 5000, 'neon').catch(function () { return null; });
    report.check('tema di base con i colori tuoi (Neon + Foresta)', neon && neon.palette.bg === '#0f1712');
    await hand.click('#th-reset');
    const back = await waitFor(async function () {
      const d = await s.api('GET', '/api/control/themes', null, CTRL);
      return d.themes.filter(function (t) { return t.id === 'neon' && !t.modified; })[0];
    }, 5000, 'reset').catch(function () { return null; });
    report.check('colori originali rimessi', !!back);

    await hand.click('#th-presets [data-preset="paper"]');
    await hand.fill('#th-colors .th-hex[data-tok="text"]', '#ffffff');
    report.check('avviso di contrasto con testo bianco su Carta', await waitFor(function () { return cdp.eval('document.getElementById("th-checks").className.indexOf("warn")>=0'); }, 3000, 'contrasto').catch(function () { return false; }));
    await hand.click('#th-undo');

    const exp = await s.api('GET', '/api/control/themes/export?id=' + (saved ? saved.id : ''), null, CTRL);
    report.check('esporta: formato condivisibile', exp.vibeDeckTheme === 1 && exp.name === 'Prova e2e' && Object.keys(exp.palette).length === 10);
    exp.name = 'Importato';
    const imp = await s.api('POST', '/api/control/themes/import', exp, CTRL);
    report.check('importa: nuovo tema', imp.theme && imp.theme.name === 'Importato' && imp.id !== (saved && saved.id));
    await hand.click('#th-new');
    for (const g of [['classic', 'paper'], ['neon', 'dracula'], ['material', 'nord'], ['brutal', 'solar'], ['classic', 'forest']]) {
      await hand.choose('#th-style', g[0]);
      await hand.click('#th-presets [data-preset="' + g[1] + '"]');
      await sleep(1500);
      const box = await cdp.eval('(function(){var e=document.getElementById("th-frame-box");e.scrollIntoView({block:"center"});var b=e.getBoundingClientRect();return {x:b.left+window.scrollX,y:b.top+window.scrollY,width:b.width,height:b.height,scale:1};})()');
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: box });
      fs.writeFileSync(path.join(OUT, 'themes-' + g[0] + '-' + g[1] + '.png'), Buffer.from(shot.data, 'base64'));
    }
    report.check('galleria stili × palette salvata', true, 'themes-<stile>-<preset>.png');
    await hand.click('#th-undo');
    await hand.choose('#th-pick', 'classic');
    report.check('nessun errore JavaScript nel pannello', (await cdp.eval('window.__errors.length')) === 0, JSON.stringify(await cdp.eval('window.__errors')));

    report.group('Tablet: scelta del tema');
    const finger = new Finger(cdp);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: true });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp.send('Page.navigate', { url: s.base + '/?t=' + s.token });
    await waitFor(function () { return cdp.eval('!!(window.D&&document.querySelectorAll("#stage .tile").length)'); }, 20000, 'tablet');
    await sleep(800);
    const tap = async function (sel) {
      const r = await cdp.eval('(function(){var n=document.querySelector(' + JSON.stringify(sel) + ');if(!n)return null;var b=n.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};})()');
      if (!r) throw new Error('Non trovo ' + sel);
      await finger.tap(r.x, r.y);
      await sleep(400);
    };
    await tap('#settings-btn');
    report.check('menu: i temi salvati compaiono', await cdp.eval('document.querySelectorAll(".set-themes .theme-opt").length===6'));
    fs.writeFileSync(path.join(OUT, 'themes-tablet-menu.png'), Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await tap('.theme-opt[data-theme="' + (saved ? saved.id : 'x') + '"]');
    const applied = await waitFor(function () { return cdp.eval('(function(){var l=document.getElementById("custom-theme-css");return !!l&&l.sheet&&getComputedStyle(document.body).backgroundColor==="rgb(23, 17, 28)";})()'); }, 6000, 'tema').catch(function () { return false; });
    report.check('tocco sul tema: colori applicati', applied, await cdp.eval('getComputedStyle(document.body).backgroundColor'));
    fs.writeFileSync(path.join(OUT, 'themes-tablet.png'), Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await cdp.send('Page.reload');
    await waitFor(function () { return cdp.eval('!!(window.D&&document.querySelectorAll("#stage .tile").length)'); }, 20000, 'ricarica');
    report.check('dopo il riavvio della pagina il tema resta', await cdp.eval('getComputedStyle(document.body).backgroundColor==="rgb(23, 17, 28)"'));
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Page.reload');
    await waitFor(function () { return cdp.eval('!!(window.D&&document.querySelectorAll("#stage .tile").length)'); }, 20000, 'telefono');
    await sleep(800);
    await tap('#settings-btn');
    const menu = await cdp.eval('(function(){var l=document.querySelector(".set-themes"),m=document.querySelector(".theme-menu").getBoundingClientRect();return {sh:l.scrollHeight,ch:l.clientHeight,bottom:m.bottom,h:innerHeight};})()');
    report.check('telefono: il menu dei temi sta nello schermo (scorre se serve)', menu.bottom <= menu.h + 1 || menu.sh > menu.ch, JSON.stringify(menu));
    fs.writeFileSync(path.join(OUT, 'themes-phone-menu.png'), Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await tap('#settings-btn');
    await s.api('POST', '/api/control/themes/reset', { id: saved ? saved.id : '' }, CTRL);
    const fell = await waitFor(function () { return cdp.eval('!document.getElementById("custom-theme-css")&&getComputedStyle(document.body).backgroundColor==="rgb(11, 15, 20)"'); }, 12000, 'tema eliminato').catch(function () { return false; });
    report.check('tema eliminato dal pannello: il tablet torna al Classico da solo', fell);
  } catch (e) {
    report.check('esecuzione', false, e.message);
  } finally {
    await s.stop();
  }
  console.log('Screenshot in ' + OUT);
  report.end();
}

main();
