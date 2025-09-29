// server.js
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/stream' });

wss.on('connection', (ws) => {
  ws.on('message', async (msg) => {
    await fetch('https://YOUR-N8N-WEBHOOK/stream-ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: msg
    });
  });
});

server.listen(8081, () => console.log('WS bridge on :8080'));
