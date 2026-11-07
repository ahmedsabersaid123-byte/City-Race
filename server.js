// سيرفر سباق المدينة — شغّله على جهاز الهوتسبوت:  node server.js
// بدون أي مكتبات خارجية. حط الملف جنب city_race.html
const http = require('http'), fs = require('fs'), crypto = require('crypto'), os = require('os'), path = require('path');
const PORT = process.env.PORT || 8080, HTML = path.join(__dirname, 'city_race.html');
const clients = new Map(); let nextId = 1, host = 0;
function frame(str) {
  const p = Buffer.from(str), n = p.length; let h;
  if (n < 126) h = Buffer.from([0x81, n]); else if (n < 65536) h = Buffer.from([0x81, 126, n >> 8, n & 255]);
  else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeUInt32BE(n, 6); }
  return Buffer.concat([h, p]);
}
function send(c, o) { try { c.sock.write(frame(JSON.stringify(o))); } catch (e) { } }
function all(o, except) { clients.forEach(c => { if (c.id !== except) send(c, o); }); }
function lobby() { const players = [...clients.values()].map(c => ({ id: c.id, name: c.name, car: c.car })); clients.forEach(c => send(c, { t: 'lobby', you: c.id, host: host, players: players })); }
function drop(c) {
  if (!clients.delete(c.id)) return;
  if (host === c.id) host = clients.size ? [...clients.keys()][0] : 0;
  all({ t: 'left', id: c.id }); lobby();
}
function onMsg(c, m) {
  if (m.t === 'hello') { c.name = String(m.name || 'لاعب').slice(0, 14); c.car = m.car | 0; lobby(); }
  else if (m.t === 's') { m.id = c.id; all(m, c.id); }
  else if (m.t === 'start' && c.id === host) all({ t: 'go', order: [...clients.keys()] });
  else if (m.t === 'fin') all({ t: 'fin', id: c.id, time: m.time }, c.id);
}
function parse(c) {
  for (;;) {
    const b = c.buf; if (b.length < 2) return;
    const op = b[0] & 15; let len = b[1] & 127, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; } else if (len === 127) { if (b.length < 10) return; len = b.readUInt32BE(6); off = 10; }
    const masked = b[1] & 128; if (b.length < off + (masked ? 4 : 0) + len) return;
    let payload = b.slice(off + (masked ? 4 : 0), off + (masked ? 4 : 0) + len);
    if (masked) { const mk = b.slice(off, off + 4); payload = Buffer.from(payload.map((v, i) => v ^ mk[i & 3])); }
    c.buf = b.slice(off + (masked ? 4 : 0) + len);
    if (op === 8) { drop(c); try { c.sock.end(); } catch (e) { } return; }
    if (op === 9) { try { c.sock.write(Buffer.from([0x8a, 0])); } catch (e) { } continue; }
    if (op === 1) { let m; try { m = JSON.parse(payload.toString()); } catch (e) { continue; } onMsg(c, m); }
  }
}
const srv = http.createServer((req, res) => {
  fs.readFile(HTML, (e, d) => {
    if (e) { res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('ملف city_race.html مش موجود جنب server.js'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d);
  });
});
srv.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key']; if (!key) { sock.destroy(); return; }
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  const c = { id: nextId++, sock: sock, buf: Buffer.alloc(0), name: 'لاعب', car: 0 }; clients.set(c.id, c); if (!host) host = c.id;
  sock.setNoDelay(true); sock.on('data', d => { c.buf = Buffer.concat([c.buf, d]); parse(c); }); sock.on('close', () => drop(c)); sock.on('error', () => drop(c));
});
srv.listen(PORT, '0.0.0.0', () => {
  console.log('السيرفر شغال على المنفذ ' + PORT + '\nافتحوا من المتصفح (كل الأجهزة بعد الاتصال بالهوتسبوت):');
  Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).forEach(i => console.log('  http://' + i.address + ':' + PORT));
  console.log('  (غالبا في هوتسبوت الأندرويد: http://192.168.43.1:' + PORT + ')');
});
