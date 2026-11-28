'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sleep, waitFor, Session, Report, Hand, serveStatic } = require('./e2e-lib');
const { build } = require('./build-demo');

const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), 'vibe-e2e');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const report = new Report();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-e2e-demo-'));
  const s = new Session({ port: 8797, cdpPort: 9338 });
  let site = null;
  try {
    report.group('Demo online: build statico');
    const built = await build(dir);
    report.check('build con le risposte registrate', built.calls >= 6, built.calls + ' risposte');
    ['index.html', 'demo-shim.js', 'demo-data.js', 'js/app.js', 'css/dock.css'].forEach(function (f) { report.check('file ' + f, fs.existsSync(path.join(dir, f))); });
    report.check('nessun file segreto (token, chiavi) nei dati', !/webhooks|"key":"[0-9a-f]{20}/.test(fs.readFileSync(path.join(dir, 'demo-data.js'), 'utf8')));
    site = await serveStatic(dir, 8798);
    await s.start();
    const cdp = s.cdp;
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__errors=[];window.addEventListener("error",function(e){window.__errors.push(e.message);});' });
    for (const z of [['tablet', 1280, 800, 1], ['phone-land', 844, 390, 3], ['phone-port', 390, 844, 3]]) {
      report.group('Demo online sul ' + z[0]);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: z[1], height: z[2], deviceScaleFactor: z[3], mobile: z[0] !== 'tablet' });
      await cdp.send('Page.navigate', { url: 'http://127.0.0.1:8798/' });
      const shown = await waitFor(function () { return cdp.eval('document.querySelectorAll("#stage .w-shape").length>=3'); }, 20000, 'widget').then(function () { return true; }, function () { return false; });
      report.check('la HOME mostra i widget con i dati registrati', shown);
      await sleep(800);
      report.check('nome del PC in alto', await cdp.eval('document.getElementById("host").textContent.indexOf("MY-PC")>=0'));
      report.check('niente schermata di collegamento', await cdp.eval('document.getElementById("pair").className.indexOf("hidden")>=0'));
      report.check('niente errori JavaScript', (await cdp.eval('window.__errors.length')) === 0, JSON.stringify(await cdp.eval('window.__errors')));
      await cdp.screenshot(path.join(OUT, 'demo-' + z[0] + '.png'));
    }
    report.group('Demo online: un tocco non fa danni');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:8798/' });
    await waitFor(function () { return cdp.eval('document.querySelectorAll("#tabs .tab").length>=2'); }, 20000, 'schede');
    await new Hand(cdp).click('#tabs .tab:nth-child(2)');
    await sleep(600);
    report.check('si può cambiare pagina', await cdp.eval('typeof D!=="undefined"&&D.store.get("page","")!=="main"'));
  } catch (e) {
    report.check('prova completata', false, e.message);
  } finally {
    await s.stop();
    if (site) site.close();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { }
  }
  report.end();
}

main();
