// Optional zero-dependency LAN / Classroom Server for Quiz Live
// Serves static files + provides a native RFC 6455 WebSocket relay on /ws
// Usage: node server.js [port]

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

const PORT = Number(process.env.PORT || process.argv[2] || 3000);
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

// Active rooms: code -> { host: socket, clients: Map<clientId, socket> }
const rooms = new Map();

function wsSend(socket, obj) {
  if (!socket || socket.destroyed) return;
  const payload = Buffer.from(JSON.stringify(obj), 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  try {
    socket.write(Buffer.concat([header, payload]));
  } catch {}
}

function wsPong(socket, data) {
  if (!socket || socket.destroyed) return;
  const len = Math.min(data.length, 125);
  const frame = Buffer.alloc(2 + len);
  frame[0] = 0x8a;
  frame[1] = len;
  data.copy(frame, 2, 0, len);
  try { socket.write(frame); } catch {}
}

function attachWs(socket) {
  let buf = Buffer.alloc(0);
  const meta = { role: null, code: null, clientId: null };

  function handleJson(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    if (msg.op === 'host') {
      const code = String(msg.code || '').toUpperCase().slice(0, 8);
      if (!code || rooms.has(code)) {
        wsSend(socket, { op: 'err', reason: 'taken' });
        return;
      }
      meta.role = 'host';
      meta.code = code;
      rooms.set(code, { host: socket, clients: new Map() });
      wsSend(socket, { op: 'hosted', code });
      return;
    }

    if (msg.op === 'join') {
      const code = String(msg.code || '').toUpperCase().slice(0, 8);
      const clientId = String(msg.clientId || ('c-' + Math.random().toString(36).slice(2, 8)));
      const room = rooms.get(code);
      if (!room) {
        wsSend(socket, { op: 'err', reason: 'not_found' });
        return;
      }
      meta.role = 'client';
      meta.code = code;
      meta.clientId = clientId;
      room.clients.set(clientId, socket);
      wsSend(socket, { op: 'joined_room', code });
      return;
    }

    const room = meta.code ? rooms.get(meta.code) : null;
    if (!room) return;

    if (msg.op === 'send') {
      if (meta.role === 'host' && msg.to) {
        const target = room.clients.get(msg.to);
        if (target) wsSend(target, { op: 'msg', data: msg.data });
      } else if (meta.role === 'client') {
        wsSend(room.host, { op: 'msg', from: meta.clientId, data: msg.data });
      }
    } else if (msg.op === 'broadcast' && meta.role === 'host') {
      for (const c of room.clients.values()) {
        wsSend(c, { op: 'msg', data: msg.data });
      }
    }
  }

  function cleanup() {
    if (!meta.code) return;
    const room = rooms.get(meta.code);
    if (!room) return;
    if (meta.role === 'host' && room.host === socket) {
      for (const c of room.clients.values()) {
        wsSend(c, { op: 'host_left' });
      }
      rooms.delete(meta.code);
    } else if (meta.role === 'client' && meta.clientId) {
      if (room.clients.get(meta.clientId) === socket) {
        room.clients.delete(meta.clientId);
        wsSend(room.host, { op: 'peer_left', from: meta.clientId });
      }
    }
    meta.code = null;
  }

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const b0 = buf[0];
      const b1 = buf[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let payloadLen = b1 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (buf.length < 4) break;
        payloadLen = buf.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (buf.length < 10) break;
        payloadLen = Number(buf.readBigUInt64BE(2));
        offset = 10;
      }

      const maskLen = masked ? 4 : 0;
      if (buf.length < offset + maskLen + payloadLen) break;

      let payload = buf.subarray(offset + maskLen, offset + maskLen + payloadLen);
      if (masked) {
        const mask = buf.subarray(offset, offset + 4);
        const unmasked = Buffer.alloc(payloadLen);
        for (let i = 0; i < payloadLen; i++) {
          unmasked[i] = payload[i] ^ mask[i & 3];
        }
        payload = unmasked;
      }

      buf = buf.subarray(offset + maskLen + payloadLen);

      if (opcode === 0x8) {
        cleanup();
        socket.end();
        return;
      }
      if (opcode === 0x9) {
        wsPong(socket, payload);
        continue;
      }
      if (opcode === 0x1) {
        handleJson(payload.toString('utf8'));
      }
    }
  });

  socket.on('close', cleanup);
  socket.on('error', cleanup);
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  if (urlPath === '/api/mode') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ws: true, rooms: rooms.size }));
    return;
  }

  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const fullPath = path.resolve(ROOT, rel);
  if (!fullPath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.on('upgrade', (req, socket) => {
  if (!req.url || !req.url.startsWith('/ws')) {
    socket.destroy();
    return;
  }
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  attachWs(socket);
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🎮 Quiz Live LAN Server running at:`);
    console.log(`   Local:   http://localhost:${PORT}`);
    const nets = os.networkInterfaces();
    for (const list of Object.values(nets)) {
      for (const iface of list || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`   Network: http://${iface.address}:${PORT}`);
        }
      }
    }
    console.log('');
  });
}

module.exports = { server, rooms };
