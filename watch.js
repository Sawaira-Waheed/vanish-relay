const WebSocket = require('ws');
console.log('Connecting to relay...');

const ws = new WebSocket('wss://vanish-relay-sawaira.bonto.page/ws');
ws.on('open', () => {
  console.log('Connected, sending join');
  ws.send(JSON.stringify({type: 'join', protocol: 1, device_id: 'watcher', name: 'Watcher'}));
});

ws.on('message', raw => {
  console.log(new Date().toLocaleTimeString(), raw.toString());
});

ws.on('error', err => console.log('ERROR:', err.message));
ws.on('close', () => console.log('Connection closed'));