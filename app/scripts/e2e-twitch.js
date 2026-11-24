'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sleep, waitFor, Session, Report } = require('./e2e-lib');
const { FakeTwitch } = require('../tests/fake-twitch');

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
async function spot(cdp, selector, index) {
  const r = await cdp.eval('(function(){var n=document.querySelectorAll(' + JSON.stringify(selector) + ')[' + (index || 0) + '];if(!n)return null;n.scrollIntoView({block:"nearest",behavior:"instant"});var b=n.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2,h:b.height};})()');
  if (!r) throw new Error('Non trovo ' + selector);
  return r;
}
async function press(cdp, selector, holdMs, index) {
  const r = await spot(cdp, selector, index);
  await touch(cdp, 'touchStart', r.x, r.y);
  await sleep(holdMs || 60);
  await touch(cdp, 'touchEnd', r.x, r.y);
  await sleep(300);
}
async function swipe(cdp, selector, older) {
  const r = await cdp.eval('(function(){var c=document.querySelector(' + JSON.stringify(selector) + ');var b=c.getBoundingClientRect(),f=c.firstChild.getBoundingClientRect(),l=c.lastChild.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2,w:b.width,h:b.height,dx:l.left-f.left,dy:l.top-f.top};})()');
  const vertical = Math.abs(r.dy) >= Math.abs(r.dx);
  const sign = (vertical ? r.dy : r.dx) >= 0 ? 1 : -1;
  const reach = (vertical ? r.h : r.w) * 0.35 * sign * (older ? 1 : -1);
  const from = vertical ? [r.x, r.y - reach] : [r.x - reach, r.y];
  const to = vertical ? [r.x, r.y + reach] : [r.x + reach, r.y];
  const steps = 10;
  await touch(cdp, 'touchStart', from[0], from[1]);
  for (let i = 1; i <= steps; i++) { await touch(cdp, 'touchMove', from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps); await sleep(16); }
  await touch(cdp, 'touchEnd', to[0], to[1]);
  await sleep(300);
}
function q(cdp, js) { return cdp.eval('(function(){try{' + js + '}catch(e){return "ERR "+e.message;}})()'); }

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const report = new Report();
  const fake = await new FakeTwitch().listen();
  const s = new Session({ port: 8801, cdpPort: 9339, env: { DEMO_DRY: '1', TWITCH_IRC: fake.url('ws'), TWITCH_API: fake.url('api'), TWITCH_ID: fake.url('id') } });
  try {
    await s.start();
    const cdp = s.cdp;
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__errors=[];window.addEventListener("error",function(e){window.__errors.push(e.message);});' });
    const H = { 'x-dock-control': '1' };
    report.group('Pannello');
    let info = await s.api('POST', '/api/control/twitch/login', { clientId: 'abcdefghij0123456789' }, H);
    report.check('"Collega Twitch" mostra il codice da inserire', info.twitch && info.twitch.pending && info.twitch.pending.code === 'ABCD1234', JSON.stringify(info.twitch));
    fake.approved = true;
    info = await s.api('POST', '/api/control/twitch/check', {}, H);
    report.check('dopo la conferma su Twitch il pannello mostra l\'account', info.twitch && info.twitch.status === 'ready' && info.twitch.user && info.twitch.user.login === 'stefano', JSON.stringify(info.twitch));
    await waitFor(function () { return fake.sockets.size > 0 && fake.lines.indexOf('JOIN #stefano') >= 0; }, 8000, 'chat');
    await sleep(300);
    for (let i = 0; i < 40; i++) fake.say(i % 3 ? 'Pippo' : 'Pluto', 'messaggio numero ' + i + (i === 5 ? ' <img src=x onerror=alert(1)>' : ''), i === 0 ? { badges: 'moderator/1' } : {});
    fake.sub('Paperino', 7);

    for (const dev of DEVICES) {
      report.group('Twitch sul ' + dev.name);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: dev.width, height: dev.height, deviceScaleFactor: dev.dpr, mobile: true });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await cdp.send('Page.navigate', { url: s.base + '/?shot=1&page=twitch' });
      const first = await waitFor(function () { return q(cdp, 'var l=document.querySelectorAll(".tw-line");return l.length>=41&&{n:l.length,pill:document.querySelector(".tw-pill").textContent,info:document.querySelector(".tw-info").textContent,img:document.querySelectorAll(".tw-chat img").length,notice:document.querySelectorAll(".tw-line.notice").length};'); }, 20000, 'chat sul tablet').catch(function () { return null; });
      report.check('chat caricata, con la notifica di abbonamento', first && first.notice === 1, JSON.stringify(first));
      report.check('l\'HTML dei messaggi non viene eseguito', first && first.img === 0);
      report.check('spettatori e durata nella pillola LIVE', first && /^LIVE · 128 · 1:0\d$/.test(first.pill) && /1500 follower/.test(first.info), first && (first.pill + ' / ' + first.info));
      const bottom = await q(cdp, 'var c=document.querySelector(".tw-chat");return c.scrollHeight-c.scrollTop-c.clientHeight<40;');
      report.check('la chat parte dall\'ultimo messaggio', bottom === true);
      const top0 = await q(cdp, 'return document.querySelector(".tw-chat").scrollTop;');
      await swipe(cdp, '.tw-chat', true);
      const top1 = await q(cdp, 'return document.querySelector(".tw-chat").scrollTop;');
      report.check('la chat scorre col dito', top1 < top0, top0 + ' -> ' + top1);
      fake.say('Topolino', 'mentre leggo indietro');
      await sleep(2500);
      const stay = await q(cdp, 'return document.querySelector(".tw-chat").scrollTop;');
      report.check('un messaggio nuovo non fa saltare chi sta leggendo più su', Math.abs(stay - top1) < 5, top1 + ' -> ' + stay);
      for (let k = 0; k < 8; k++) await swipe(cdp, '.tw-chat', false);
      fake.say('Topolino', 'ultimo ' + dev.name);
      const follow = await waitFor(function () { return q(cdp, 'var c=document.querySelector(".tw-chat");var l=c.lastChild;return l&&/ultimo/.test(l.textContent)&&c.scrollHeight-c.scrollTop-c.clientHeight<40;'); }, 6000, 'segue').catch(function () { return false; });
      report.check('in fondo alla chat i messaggi nuovi si vedono subito', follow === true);

      const controls = await q(cdp, 'var s=document.querySelector(".tw-side");return !!s&&s.offsetWidth>0&&s.querySelectorAll(".tw-btn").length;');
      const compact = !controls;
      report.check(compact ? 'schermo stretto: solo chat, controlli nascosti' : 'controlli della diretta accanto alla chat', compact ? /^telefono/.test(dev.name) : controls >= 8, String(controls));
      await cdp.screenshot(path.join(OUT, 'twitch-' + dev.name + '.png'));

      await press(cdp, '.tw-input');
      await cdp.send('Input.insertText', { text: 'ciao da ' + dev.name });
      await press(cdp, '.tw-send');
      const sent = await waitFor(function () { return q(cdp, 'var l=document.querySelector(".tw-chat").lastChild;return l&&l.textContent.indexOf("ciao da ' + dev.name + '")>=0&&document.querySelector(".tw-input").value==="";'); }, 6000, 'inviato').catch(function () { return false; });
      report.check('scrivi in chat e il messaggio compare', sent === true);

      if (compact) continue;
      const markers = fake.calls.filter(function (c) { return c.path === '/helix/streams/markers'; }).length;
      await press(cdp, '.tw-grid .tw-btn', 60, 0);
      await waitFor(function () { return fake.calls.filter(function (c) { return c.path === '/helix/streams/markers'; }).length > markers; }, 5000, 'marker').catch(function () {});
      report.check('MARKER segna il momento', fake.calls.filter(function (c) { return c.path === '/helix/streams/markers'; }).length === markers + 1);
      const ads = function () { return fake.calls.filter(function (c) { return c.path === '/helix/channels/commercial'; }).length; };
      const ad0 = ads();
      await press(cdp, '.tw-btn.warn', 60);
      await sleep(400);
      report.check('un tocco breve NON manda la pubblicità', ads() === ad0);
      await press(cdp, '.tw-btn.warn', 1000);
      await waitFor(function () { return ads() > ad0; }, 5000, 'pubblicità').catch(function () {});
      report.check('tenendo premuto parte la pubblicità', ads() === ad0 + 1);
      await press(cdp, '.tw-modes .tw-btn', 60, 1);
      const emote = await waitFor(function () { return fake.chat.emote_mode && q(cdp, 'return document.querySelectorAll(".tw-modes .tw-btn")[1].className.indexOf(" on")>=0;'); }, 6000, 'emote').catch(function () { return false; });
      report.check('SOLO EMOTE si accende (su Twitch e sul tablet)', emote === true);
      await press(cdp, '.tw-modes .tw-btn', 60, 1);
      await waitFor(function () { return !fake.chat.emote_mode; }, 5000, 'emote off').catch(function () {});
      report.check('e si spegne', fake.chat.emote_mode === false);

      await press(cdp, '.tw-side .tw-btn.small');
      const edit = await waitFor(function () { return q(cdp, 'return document.querySelectorAll(".tw-edit").length===2;'); }, 3000, 'editor').catch(function () { return false; });
      report.check('MODIFICA apre titolo e categoria', edit === true);
      await press(cdp, '.tw-edit', 60, 0);
      await cdp.eval('document.querySelectorAll(".tw-edit")[0].select()');
      await cdp.send('Input.insertText', { text: 'Titolo dal ' + dev.name });
      await press(cdp, '.tw-btn.go');
      await waitFor(function () { return fake.channel.title === 'Titolo dal ' + dev.name; }, 5000, 'titolo').catch(function () {});
      const shown = await waitFor(function () { return q(cdp, 'var t=document.querySelector(".tw-title b");return t&&t.textContent==="Titolo dal ' + dev.name + '";'); }, 6000, 'titolo sul tablet').catch(function () { return false; });
      report.check('nuovo titolo salvato su Twitch e mostrato', fake.channel.title === 'Titolo dal ' + dev.name && shown === true, fake.channel.title);
      await press(cdp, '.tw-side .tw-btn.small');
      await press(cdp, '.tw-edit', 60, 1);
      await cdp.send('Input.insertText', { text: 'just' });
      const found = await waitFor(function () { return q(cdp, 'var r=document.querySelectorAll(".tw-result");return r.length===1&&r[0].textContent;'); }, 5000, 'categorie').catch(function () { return ''; });
      report.check('cerca una categoria', found === 'Just Chatting', found);
      if (dev.name === 'tablet') await cdp.screenshot(path.join(OUT, 'twitch-' + dev.name + '-modifica.png'));
      await press(cdp, '.tw-result');
      const game = await waitFor(function () { return fake.channel.game_name === 'Just Chatting' && q(cdp, 'var t=document.querySelector(".tw-title span");return t&&t.textContent==="Just Chatting";'); }, 6000, 'categoria').catch(function () { return false; });
      report.check('tocco sulla categoria la imposta e chiude il modulo', game === true);
      fake.channel.game_name = 'League of Legends'; fake.channel.game_id = '21779';
    }
    report.group('Scheda Twitch nel pannello');
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: s.base + '/control#twitch-card' });
    const card = await waitFor(function () { return q(cdp, 'var c=document.getElementById("twitch-card");var p=document.getElementById("tw-status");return c&&p&&p.textContent&&{pill:p.textContent,who:(c.querySelector(".who")||{}).textContent,out:!!document.getElementById("tw-logout"),channel:document.getElementById("tw-channel").value};'); }, 15000, 'scheda').catch(function () { return null; });
    report.check('account collegato, canale e "Scollega"', card && card.pill === 'COLLEGATO' && card.who === 'Stefano' && card.out && card.channel === 'stefano', JSON.stringify(card));
    await cdp.eval('document.getElementById("twitch-card").scrollIntoView()');
    await sleep(300);
    await cdp.screenshot(path.join(OUT, 'twitch-pannello.png'));
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
