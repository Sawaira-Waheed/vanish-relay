const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const PROTOCOL = 1;
const LIFETIME_MS = 30000;

const clients = new Set();   // joined clients: { ws, name }
const messages = new Map();  // memory only, never written to disk

const wss = new WebSocketServer({ host: '0.0.0.0', port: PORT, path: '/ws' });
console.log(`Relay listening on ws://0.0.0.0:${PORT}/ws`);

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(obj) {
  for (const c of clients) send(c.ws, obj);
}

wss.on('connection', ws => {
  console.log('client connected');
  let client = null;

  ws.on('message', raw => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      console.log('bad JSON received');
      return send(ws, { type: 'error', code: 'bad_json', message: 'not valid JSON' });
    }

    console.log('received:', msg.type);

    if (msg.type === 'ping') return send(ws, { type: 'pong' });

    if (msg.type === 'join') {
      if (msg.protocol !== PROTOCOL) {
        console.log('rejected join: protocol', msg.protocol);
        return send(ws, { type: 'error', code: 'bad_protocol', message: `relay speaks protocol ${PROTOCOL}` });
      }
      if (typeof msg.name !== 'string' || msg.name.trim() === '') {
        return send(ws, { type: 'error', code: 'bad_name', message: 'name is required' });
      }
      client = { ws, name: msg.name.trim().slice(0, 30) };
      clients.add(client);
      console.log('joined:', client.name, '| clients now:', clients.size);
      return send(ws, { type: 'welcome', protocol: PROTOCOL, server_time: Date.now() });
    }

    if (!client) {
      return send(ws, { type: 'error', code: 'not_joined', message: 'send join first' });
    }

    if (msg.type === 'message') {
      if (typeof msg.id !== 'string' || typeof msg.text !== 'string' ||
          msg.text.length === 0 || msg.text.length > 500) {
        return send(ws, { type: 'error', code: 'bad_message', message: 'id and text are required' });
      }
      if (messages.has(msg.id)) {
        console.log('duplicate ignored:', msg.id);
        return;
      }

      const sent_at = Date.now();
      const stored = {
        id: msg.id,
        sender: client.name,
        text: msg.text,
        sent_at,
        expires_at: sent_at + LIFETIME_MS,
      };
      messages.set(stored.id, stored);

      broadcast({ type: 'message', ...stored });
      send(ws, { type: 'delivered', id: stored.id, count: clients.size });

      setTimeout(() => {
        messages.delete(stored.id);
        broadcast({ type: 'expired', id: stored.id });
        console.log('expired:', stored.id);
      }, LIFETIME_MS);
      return;
    }

    send(ws, { type: 'error', code: 'unknown_type', message: String(msg.type) });
  });

  ws.on('close', () => {
    if (client) {
      clients.delete(client);
      console.log('left:', client.name, '| clients now:', clients.size);
    } else {
      console.log('connection closed before join');
    }
  });
});