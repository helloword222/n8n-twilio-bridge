// server.js
import http from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';
import fetch from 'node-fetch';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/stream' });

wss.on('connection', (ws) => {
  ws.on('message', async (msg) => {
    // Twilio sends JSON messages (media, start, mark, stop)
    // Forward to n8n webhook for processing/transcription
    await fetch('https://devops-novitas.app.n8n.cloud/webhook/1e766315-e1ab-4256-aa2c-fd51db320566/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: msg
    });
  });
});

server.listen(8080, () => console.log('WS bridge on :8080'));
