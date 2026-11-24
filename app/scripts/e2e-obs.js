'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sleep, waitFor, Session, Report } = require('./e2e-lib');
const { FakeObs } = require('../tests/fake-obs');

const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), 'vibe-e2e');
const DEVICES = [
  { name: 'tablet', width: 1280, height: 800, dpr: 1 },
  { name: 'telefono', width: 844, height: 390, dpr: 2 }
];

function touch(cdp, type, x, y) {
  return cdp.send('Input.dispatchTouchEvent', { type: type, touchPoints: type === 'touchEnd' ? [] : [{ x: x, y: y, id: 1 }] });
}
async function press(cdp, selector, holdMs, index) {
  const r = await cdp.eval('(function(){var n=document.querySelectorAll(' + JSON.stringify(selector) + ')[' + (index || 0) + '];if(!n)return null;n.scrollIntoView({block:"nearest",behavior:"instant"});var b=n.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};})()');
  if (!r) throw new Error('Non trovo ' + selector);
  await touch(cdp, 'touchStart', r.x, r.y);
  await sleep(holdMs || 60);
  await touch(cdp, 'touchEnd', r.x, r.y);
  await sleep(300);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const report = new Report();
  const fake = await new FakeObs('pw-segreta').listen();
  const s = new Session({ port: 8800, cdpPort: 9338, env: { DEMO_DRY: '1' } });
  try {
    await s.start();
    const cdp = s.cdp;
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__errors=[];window.addEventListener("error",function(e){window.__errors.push(e.message);});' });
    const info = await s.api('POST', '/api/control/obs', { host: '127.0.0.1', port: fake.port, password: 'pw-segreta' }, { 'x-dock-control': '1' });
    report.group('Pannello');
    report.check('OBS collegato dal pannello con la password', info.obs && info.obs.status === 'ready', info.obs && (info.obs.status + ' ' + info.obs.message));
    for (const dev of DEVICES) {
      report.group('OBS sul ' + dev.name);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: dev.width, height: dev.height, deviceScaleFactor: dev.dpr, mobile: true });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await cdp.send('Page.navigate', { url: s.base + '/?shot=1&page=obs' });
      const first = await waitFor(function () { return cdp.eval('(function(){var s=document.querySelectorAll(".obs-scene");return s.length===3&&{pill:document.querySelector(".obs-pill").textContent,on:document.querySelector(".obs-scene.on").textContent,mics:document.querySelectorAll(".obs-chip").length};})()'); }, 20000, 'pagina OBS').catch(function () { return null; });
      report.check('stato, scene e sorgenti audio', first && first.pill === 'OFFLINE' && first.on === fake.state.scene && first.mics === 2, JSON.stringify(first));
      const shot = await waitFor(function () { return cdp.eval('(function(){var i=document.querySelector(".obs-shot img");return i&&/^data:image\\/jpeg/.test(i.src)&&i.naturalWidth>0;})()'); }, 10000, 'anteprima').catch(function () { return false; });
      report.check('anteprima della scena in onda', shot);
      await press(cdp, '.obs-btn.go');
      const live = await waitFor(function () { return cdp.eval('/^LIVE /.test(document.querySelector(".obs-pill").textContent)&&document.querySelector(".obs-pill").textContent'); }, 8000, 'live').catch(function () { return ''; });
      report.check('"Avvia live" manda OBS in diretta', fake.state.stream && !!live, live);
      await press(cdp, '.obs-scene', 60, 0);
      await waitFor(function () { return fake.state.scene === 'Cam'; }, 5000, 'scena').catch(function () {});
      const on = await waitFor(function () { return cdp.eval('document.querySelector(".obs-scene.on")&&document.querySelector(".obs-scene.on").textContent==="Cam"'); }, 5000, 'scena evidenziata').catch(function () { return false; });
      report.check('tocco su una scena la mette in onda', fake.state.scene === 'Cam' && on, fake.state.scene);
      const micBefore = fake.state.inputs['Mic/Aux'];
      await press(cdp, '.obs-chip', 60, 0);
      await waitFor(function () { return fake.state.inputs['Mic/Aux'] !== micBefore; }, 5000, 'muto').catch(function () {});
      const red = await waitFor(function () { return cdp.eval('document.querySelectorAll(".obs-chip")[0].className.indexOf("muted")>=0===' + !micBefore); }, 5000, 'microfono rosso').catch(function () { return false; });
      report.check('microfono in muto (e torna rosso sul tablet)', fake.state.inputs['Mic/Aux'] !== micBefore && red);
      await press(cdp, '.obs-btn.danger', 60);
      await sleep(500);
      report.check('un tocco breve su "Ferma live" NON ferma la diretta', fake.state.stream === true);
      await cdp.screenshot(path.join(OUT, 'obs-' + dev.name + '.png'));
      await press(cdp, '.obs-btn.danger', 1000);
      await waitFor(function () { return !fake.state.stream; }, 5000, 'stop').catch(function () {});
      report.check('tenendo premuto la diretta si ferma', fake.state.stream === false);
      fake.handle('SetCurrentProgramScene', { sceneName: 'Gioco' });
      if (fake.state.inputs['Mic/Aux']) fake.handle('ToggleInputMute', { inputName: 'Mic/Aux' });
      await sleep(300);
    }
    const errors = await cdp.eval('window.__errors||[]');
    report.check('nessun errore JavaScript', !errors.length, errors.join(' | '));
    console.log('\nScreenshot in ' + OUT);
  } catch (e) {
    report.check('prova completata', false, e.message);
  } finally {
    await s.stop();
    fake.close();
  }
  report.end();
}

main();
