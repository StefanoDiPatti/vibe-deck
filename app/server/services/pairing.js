const os = require('os');
const QRCode = require('qrcode');
const auth = require('../auth');

const VIRTUAL = /vEthernet|VirtualBox|VMware|WSL|docker|br-|virbr|veth|Loopback|tailscale|zerotier/i;

function lanAddresses() {
  if (process.env.SERVER_IP) return [{ name: 'SERVER_IP', address: process.env.SERVER_IP }];
  const out = [];
  const ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach(function (name) {
    if (VIRTUAL.test(name)) return;
    (ifaces[name] || []).forEach(function (d) {
      if ((d.family === 'IPv4' || d.family === 4) && !d.internal && auth.isPrivateIp(d.address)) out.push({ name: name, address: d.address });
    });
  });
  return out;
}

function token() { return (process.env.DOCK_TOKEN || '').trim(); }

function links(port) {
  const t = token();
  return lanAddresses().map(function (ip) {
    const url = 'http://' + ip.address + ':' + port;
    return { name: ip.name, url: url, link: t ? url + '/?t=' + encodeURIComponent(t) : url };
  });
}

const svgCache = {};
function svg(text) {
  if (svgCache[text]) return Promise.resolve(svgCache[text]);
  return QRCode.toString(text, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
    .then(function (s) { svgCache[text] = s; return s; });
}

function terminal(text, indent) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'L' });
  const size = qr.modules.size;
  const quiet = 2;
  const light = function (r, c) {
    if (r < 0 || c < 0 || r >= size || c >= size) return true;
    return !qr.modules.get(r, c);
  };
  const lines = [];
  for (let r = -quiet; r < size + quiet; r += 2) {
    let line = indent || '';
    for (let c = -quiet; c < size + quiet; c++) {
      const top = light(r, c), bottom = light(r + 1, c);
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' ';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

module.exports = { lanAddresses: lanAddresses, links: links, svg: svg, terminal: terminal };
