'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sleep, waitFor, Session, Report } = require('./e2e-lib');
const { FakeDeepSeek } = require('../tests/fake-deepseek');

const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), 'vibe-e2e');
const DEVICES = [
  { name: 'tablet', width: 1280, height: 800, dpr: 1 },
  { name: 'tablet-piccolo', width: 1024, height: 600, dpr: 1 },
  { name: 'telefono', width: 844, height: 390, dpr: 2 },
  { name: 'telefono-verticale', width: 390, height: 844, dpr: 2 }
];

function touch(cdp, type, x, y) {
  return cdp.send('Input.dispatchTouchEvent', { type: type, touchPoints: type === 'touchEnd' ? [] : [{ x: x, y: y, id: 1 }] });
}
async function press(cdp, selector) {
  const r = await cdp.eval('(function(){var n=document.querySelector(' + JSON.stringify(selector) + ');if(!n)return null;var b=n.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};})()');
  if (!r) throw new Error('Non trovo ' + selector);
  await touch(cdp, 'touchStart', r.x, r.y);
  await sleep(60);
  await touch(cdp, 'touchEnd', r.x, r.y);
  await sleep(200);
}
function write(cdp, text) {
  return cdp.eval('(function(){var i=document.querySelector(".ds-input");i.value=' + JSON.stringify(text) + ';return true;})()');
}
function count(cdp, sel) { return cdp.eval('document.querySelectorAll(' + JSON.stringify(sel) + ').length'); }
function lastText(cdp) { return cdp.eval('(function(){var m=document.querySelectorAll(".w-deepseek .msg.assistant");return m.length?m[m.length-1].textContent:"";})()'); }

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const report = new Report();
  const fake = await new FakeDeepSeek('sk-e2e-chiave-1234').listen();
  const s = new Session({ port: 8803, cdpPort: 9341, env: { DEMO_DRY: '1', DEEPSEEK_URL: fake.url } });
  try {
    await s.start();
    const cdp = s.cdp;
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__errors=[];window.addEventListener("error",function(e){window.__errors.push(e.message);});' });

    report.group('Pannello');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: s.base + '/control' });
    const card = await waitFor(function () { return cdp.eval('(function(){var c=document.getElementById("ds-status");return c&&c.textContent;})()'); }, 20000, 'scheda DeepSeek').catch(function () { return ''; });
    report.check('scheda DeepSeek "da configurare" senza chiave', card === 'DA CONFIGURARE', card);
    await cdp.eval('(function(){document.getElementById("ds-key").value="sk-e2e-chiave-1234";document.getElementById("ds-save").click();return true;})()');
    const ready = await waitFor(function () { return cdp.eval('document.getElementById("ds-status").textContent==="COLLEGATO"&&document.getElementById("ds-msg").textContent'); }, 10000, 'chiave salvata').catch(function () { return ''; });
    report.check('chiave salvata: collegato, credito mostrato', /\$4\.20/.test(ready), ready);
    await cdp.eval('document.getElementById("deepseek-card").scrollIntoView()');
    await sleep(300);
    await cdp.screenshot(path.join(OUT, 'deepseek-pannello.png'));

    for (const dev of DEVICES) {
      report.group('DeepSeek sul ' + dev.name);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: dev.width, height: dev.height, deviceScaleFactor: dev.dpr, mobile: true });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await cdp.send('Page.navigate', { url: s.base + '/?shot=1&page=deepseek' });
      const head = await waitFor(function () { return cdp.eval('(function(){var s=document.querySelector(".w-deepseek .chat-model");var b=document.querySelector(".ds-balance");return s&&s.options.length===2&&b&&b.textContent&&{models:s.options.length,sel:s.value,bal:b.textContent};})()'); }, 20000, 'modelli e saldo').catch(function () { return null; });
      report.check('modelli dal server e saldo in alto', head && head.sel === 'deepseek-v4-flash' && head.bal === '$4.20', JSON.stringify(head));

      fake.reply = 'Ecco una risposta un po\' lunga che arriva a pezzi, parola dopo parola, così si vede crescere sul tablet.';
      fake.delayMs = 60;
      await write(cdp, 'Ciao DeepSeek ' + dev.name);
      await press(cdp, '.ds-send');
      const live = await waitFor(function () { return cdp.eval('(function(){var l=document.querySelector(".ds-live");return l&&l.textContent.length>3&&document.querySelector(".ds-send.ds-stop")&&l.textContent;})()'); }, 8000, 'risposta in diretta').catch(function () { return ''; });
      report.check('la risposta compare mentre viene scritta (e INVIA diventa STOP)', !!live && live.length < fake.reply.length, live);
      await cdp.screenshot(path.join(OUT, 'deepseek-' + dev.name + '-diretta.png'));
      const full = await waitFor(async function () { return !(await count(cdp, '.ds-live')) && (await lastText(cdp)) === fake.reply; }, 15000, 'risposta completa').catch(function () { return false; });
      report.check('risposta completa e pulsante di nuovo INVIA', full && !(await count(cdp, '.ds-send.ds-stop')));
      const sent = fake.requests.filter(function (q) { return q.url === '/chat/completions'; }).pop();
      report.check('il messaggio arriva a DeepSeek col modello scelto', sent && sent.body.model === 'deepseek-v4-flash' && sent.body.messages.pop().content === 'Ciao DeepSeek ' + dev.name);

      fake.hold = true;
      fake.delayMs = 5;
      await write(cdp, 'Fermati');
      await press(cdp, '.ds-send');
      await waitFor(function () { return cdp.eval('!!document.querySelector(".ds-send.ds-stop")'); }, 5000, 'in corso').catch(function () {});
      await sleep(400);
      await press(cdp, '.ds-send');
      const stopped = await waitFor(async function () { return /\(fermata\)$/.test(await lastText(cdp)) && !(await count(cdp, '.ds-send.ds-stop')); }, 8000, 'fermata').catch(function () { return false; });
      report.check('toccare STOP ferma la risposta e tiene quello che era scritto', stopped, await lastText(cdp));
      fake.hold = false;

      const scroll = await cdp.eval('(function(){var l=document.querySelector(".w-deepseek .chat-log");return l.scrollHeight-l.scrollTop-l.clientHeight<4;})()');
      report.check('la chat resta in fondo all\'ultimo messaggio', scroll);
      const fits = await cdp.eval('(function(){var r=document.querySelector(".w-deepseek"),f=document.querySelector(".ds-form"),h=document.querySelector(".w-deepseek .chat-tools"),m=h.querySelector(".chat-model"),n=h.querySelector(".sbtn");var o={formIn:f.offsetTop+f.offsetHeight<=r.clientHeight+1,toolsIn:h.offsetLeft>=0&&h.offsetLeft+h.offsetWidth<=r.clientWidth+1,selVisible:m.offsetWidth>40,noOverlap:m.offsetLeft+m.offsetWidth<=n.offsetLeft+1};o.ok=o.formIn&&o.toolsIn&&o.selVisible&&o.noOverlap;return o;})()');
      report.check('campo, microfono, saldo e modello stanno nel riquadro (NUOVA non copre il menu)', fits && fits.ok, JSON.stringify(fits));
      await cdp.screenshot(path.join(OUT, 'deepseek-' + dev.name + '.png'));

      await press(cdp, '.w-deepseek .chat-tools .sbtn');
      report.check('NUOVA svuota la chat', (await count(cdp, '.w-deepseek .msg')) === 0);
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
