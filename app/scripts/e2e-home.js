'use strict';
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { sleep, waitFor, Session, Report, Hand, Finger } = require('./e2e-lib');

const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), 'vibe-e2e');
const CTRL = { 'x-dock-control': '1' };
const TOKEN = 'e2e-token-' + 'x'.repeat(30);

const STATES = [
  { entity_id: 'light.salotto', state: 'on', attributes: { friendly_name: 'Luce salotto' } },
  { entity_id: 'switch.stampante', state: 'off', attributes: { friendly_name: 'Stampante' } },
  { entity_id: 'sensor.temperatura', state: '21.5', attributes: { friendly_name: 'Temperatura', unit_of_measurement: '°C' } },
  { entity_id: 'lock.porta', state: 'locked', attributes: { friendly_name: 'Porta' } }
];

function fakeHa(calls) {
  const server = http.createServer(function (req, res) {
    let body = '';
    req.on('data', function (d) { body += d; });
    req.on('end', function () {
      if (req.headers.authorization !== 'Bearer ' + TOKEN) { res.statusCode = 401; res.end('no'); return; }
      calls.push({ method: req.method, url: req.url, body: body });
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/states') return res.end(JSON.stringify(STATES));
      res.end('[]');
    });
  });
  return new Promise(function (resolve) { server.listen(0, '127.0.0.1', function () { resolve(server); }); });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const report = new Report();
  const calls = [];
  const ha = await fakeHa(calls);
  const s = new Session({ port: 8801, cdpPort: 9342 });
  try {
    await s.start();
    const cdp = s.cdp;
    const hand = new Hand(cdp);
    const finger = new Finger(cdp);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: s.base + '/control' });
    await waitFor(function () { return cdp.eval('!!document.getElementById("ha-save")'); }, 20000, 'scheda casa');

    report.group('Pannello: Casa (Home Assistant)');
    report.check('all\'inizio "da collegare"', await cdp.eval('/DA COLLEGARE/.test(document.getElementById("ha-status").textContent)'));
    await hand.fill('#ha-url', 'http://127.0.0.1:' + ha.address().port + '/');
    await hand.fill('#ha-token', TOKEN);
    await hand.click('#ha-save');
    const listed = await waitFor(function () { return cdp.eval('document.querySelectorAll("#ha-list [data-ha]").length===4'); }, 10000, 'elenco').then(function () { return true; }, function () { return false; });
    report.check('collegato: i 4 dispositivi compaiono', listed);
    report.check('stato "collegato"', await cdp.eval('/COLLEGATO/.test(document.getElementById("ha-status").textContent)'));
    report.check('il token non resta nel campo', await cdp.eval('document.getElementById("ha-token").value===""'));
    await hand.fill('#ha-filter', 'stamp');
    report.check('la ricerca filtra', await cdp.eval('document.querySelectorAll("#ha-list [data-ha]").length===1'));
    await hand.fill('#ha-filter', '');
    await hand.click('#ha-list [data-ha="light.salotto"]');
    await hand.click('#ha-list [data-ha="switch.stampante"]');
    await hand.click('#ha-list [data-ha="sensor.temperatura"]');
    report.check('contatore 3 / 24', await cdp.eval('document.getElementById("ha-count").textContent==="3 / 24"'));
    await cdp.eval('window.scrollTo(0, document.getElementById("ha-card").offsetTop - 10);true');
    await sleep(300);
    await cdp.screenshot(path.join(OUT, 'home-panel.png'));
    await hand.click('#ha-save-fav');
    await sleep(500);
    const info = await s.api('GET', '/api/control/info', null, CTRL);
    report.check('la scelta è salvata', JSON.stringify(info.homeassistant.favorites) === JSON.stringify(['light.salotto', 'switch.stampante', 'sensor.temperatura']));
    report.check('il token non esce mai dalle API del pannello', !JSON.stringify(info).includes(TOKEN));

    await s.api('POST', '/api/control/home', { columns: 6, rows: 4, tiles: [{ id: 'homeassistant.casa', x: 0, y: 0, w: 3, h: 3 }, { id: 'clock', x: 3, y: 0, w: 3, h: 1 }] }, CTRL);
    for (const z of [['tablet', 1280, 800, 1, false], ['phone-land', 844, 390, 3, true], ['phone-port', 390, 844, 3, true]]) {
      report.group('Tablet: widget Smart home sul ' + z[0]);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: z[1], height: z[2], deviceScaleFactor: z[3], mobile: z[4] });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await cdp.send('Page.navigate', { url: s.base + '/?t=DEMO1234&page=main' });
      const rows = await waitFor(function () { return cdp.eval('document.querySelectorAll(".w-shape .sh-row").length>=3'); }, 20000, 'righe').then(function () { return true; }, function () { return false; });
      report.check('tre dispositivi con il loro stato', rows && await cdp.eval('/ACCESO/.test(document.querySelector(".w-shape").textContent)&&/21.5/.test(document.querySelector(".w-shape").textContent)&&!/Porta/.test(document.querySelector(".w-shape").textContent)'));
      await cdp.screenshot(path.join(OUT, 'home-' + z[0] + '.png'));
      if (z[0] === 'tablet') {
        const before = calls.length;
        const r = await cdp.eval('(function(){var n=[].slice.call(document.querySelectorAll(".w-shape .sh-row")).filter(function(x){return /Stampante/.test(x.textContent);})[0];if(!n)return null;n.scrollIntoView({block:"center"});var b=n.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};})()');
        if (r) await finger.tap(r.x, r.y);
        const hit = await waitFor(function () { return calls.slice(before).filter(function (c) { return c.method === 'POST'; })[0]; }, 8000, 'chiamata').catch(function () { return null; });
        report.check('il tocco su "Stampante" fa il toggle su Home Assistant', !!hit && hit.url === '/api/services/switch/toggle' && JSON.parse(hit.body).entity_id === 'switch.stampante', JSON.stringify(hit));
      }
    }
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  } catch (e) {
    report.check('prova completata', false, e.message);
  } finally {
    await s.stop();
    ha.close();
  }
  report.end();
}

main();
