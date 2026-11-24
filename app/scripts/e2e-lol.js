'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sleep, waitFor, Session, Report, Finger } = require('./e2e-lib');

const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), 'vibe-e2e');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-e2e-lol-'));
const DEVICES = [
  { name: 'tablet', width: 1280, height: 800, dpr: 1 },
  { name: 'telefono', width: 844, height: 390, dpr: 2 },
  { name: 'telefono-verticale', width: 390, height: 844, dpr: 2 }
];

function center(r) { return [r.x + r.w / 2, r.y + r.h / 2]; }

async function rect(cdp, selector, index) {
  return cdp.eval('(function(){var n=document.querySelectorAll(' + JSON.stringify(selector) + ')[' + (index || 0) + '];if(!n)return null;n.scrollIntoView({block:"nearest",behavior:"instant"});var b=n.getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height};})()');
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const report = new Report();
  const s = new Session({ port: 8798, cdpPort: 9337, env: {} });
  try {
    await s.start();
    const cdp = s.cdp;
    const finger = new Finger(cdp);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__errors=[];window.addEventListener("error",function(e){window.__errors.push(e.message);});' });
    for (const dev of DEVICES) {
      report.group('League of Legends (' + dev.name + ')');
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: dev.width, height: dev.height, deviceScaleFactor: dev.dpr, mobile: true });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await cdp.send('Page.navigate', { url: s.base + '/?shot=1&page=lol' });
      const count = await waitFor(function () { return cdp.eval('document.querySelectorAll(".lol-champ").length>150&&document.querySelectorAll(".lol-champ").length'); }, 60000, 'campioni').catch(function () { return 0; });
      report.check('griglia dei campioni (dati Riot)', count > 150, count + ' campioni');
      const loaded = await waitFor(function () { return cdp.eval('(function(){var i=[].slice.call(document.querySelectorAll(".lol-champ img")).slice(0,8);return i.length===8&&i.every(function(x){return x.complete&&x.naturalWidth>0;});})()'); }, 30000, 'icone').catch(function () { return false; });
      report.check('icone caricate passando dal PC', loaded);

      const grid = await rect(cdp, '.lol-grid');
      const drags = [[grid.x + grid.w / 2, grid.y + grid.h * 0.8, grid.x + grid.w / 2, grid.y + grid.h * 0.2], [grid.x + grid.w * 0.8, grid.y + grid.h / 2, grid.x + grid.w * 0.2, grid.y + grid.h / 2], [grid.x + grid.w * 0.2, grid.y + grid.h / 2, grid.x + grid.w * 0.8, grid.y + grid.h / 2]];
      let top = 0;
      for (let i = 0; i < drags.length && !top; i++) {
        await finger.drag(drags[i][0], drags[i][1], drags[i][2], drags[i][3]);
        await sleep(400);
        top = await cdp.eval('document.querySelector(".lol-grid").scrollTop');
      }
      report.check('la griglia scorre col dito', top > 0, 'scrollTop=' + top);

      const mid = await rect(cdp, '.lol-role', 3);
      await finger.tap.apply(finger, center(mid));
      await sleep(500);
      const roleState = await cdp.eval('(function(){var c=[].slice.call(document.querySelectorAll(".lol-champ span")).map(function(s){return s.textContent;});return {n:c.length,ahri:c.indexOf("Ahri")>=0,garen:c.indexOf("Garen")>=0,on:document.querySelector(".lol-role.on").textContent};})()');
      report.check('filtro per ruolo MID', roleState.on === 'MID' && roleState.ahri && !roleState.garen && roleState.n < count, JSON.stringify(roleState));
      await finger.tap.apply(finger, center(await rect(cdp, '.lol-role', 0)));
      await cdp.eval('(function(){var s=document.querySelector(".lol-search");s.value="kaisa";s.dispatchEvent(new Event("input"));return true;})()');
      await sleep(400);
      const found = await cdp.eval('[].slice.call(document.querySelectorAll(".lol-champ span")).map(function(s){return s.textContent;})');
      report.check('ricerca senza apostrofi e accenti ("kaisa")', found.length === 1 && found[0] === "Kai'Sa", JSON.stringify(found));
      await cdp.eval('(function(){var s=document.querySelector(".lol-search");s.value="ahri";s.dispatchEvent(new Event("input"));return true;})()');
      await sleep(400);
      await finger.tap.apply(finger, center(await rect(cdp, '.lol-champ', 0)));
      const detail = await waitFor(function () { return cdp.eval('document.querySelectorAll(".lol-ability").length===5&&document.querySelector(".lol-name").textContent'); }, 20000, 'scheda').catch(function () { return ''; });
      report.check('scheda del campione con passiva e Q W E R', detail === 'Ahri', detail);
      const icons = await waitFor(function () { return cdp.eval('[].slice.call(document.querySelectorAll(".lol-ability img")).every(function(x){return x.complete&&x.naturalWidth>0;})'); }, 20000, 'icone abilità').catch(function () { return false; });
      report.check('icone delle abilità', icons);
      const keys = await cdp.eval('[].slice.call(document.querySelectorAll(".lol-key")).map(function(k){return k.textContent;}).join("")');
      report.check('tasti P Q W E R', keys === 'PQWER', keys);
      await cdp.screenshot(path.join(OUT, 'lol-' + dev.name + '-scheda.png'));
      const before = (await s.api('GET', '/api/demo/actions')).length;
      await finger.tap.apply(finger, center(await rect(cdp, '.lol-build', 0)));
      const act = await waitFor(async function () { const a = await s.api('GET', '/api/demo/actions'); return a.length > before ? a[a.length - 1] : null; }, 8000, 'build').catch(function () { return null; });
      report.check('"Build su u.gg" apre la pagina giusta sul PC', act && act.type === 'open_url' && /^https:\/\/u\.gg\/lol\/champions\/ahri\/build\?role=mid$/.test(act.url), act ? act.url : 'nessuna azione');
      await finger.tap.apply(finger, center(await rect(cdp, '.lol-back')));
      await sleep(300);
      report.check('"Indietro" torna alla griglia', await cdp.eval('document.querySelector(".lol-grid").style.display===""&&document.querySelector(".lol-detail").style.display==="none"'));
      await cdp.eval('(function(){var s=document.querySelector(".lol-search");s.value="";s.dispatchEvent(new Event("input"));document.querySelector(".lol-grid").scrollTop=0;return true;})()');
      await sleep(1500);
      await cdp.screenshot(path.join(OUT, 'lol-' + dev.name + '-griglia.png'));
    }
    const errors = await cdp.eval('window.__errors||[]');
    report.check('nessun errore JavaScript', !errors.length, errors.join(' | '));
    console.log('\nScreenshot in ' + OUT);
  } catch (e) {
    report.check('prova completata', false, e.message);
  } finally {
    await s.stop();
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { }
  }
  report.end();
}

main();
