// server.js
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const fetch = require('node-fetch');

const app = express();

// --- TwiML endpoint: Twilio will POST here when your number receives a call ---
app.post('/voice', (req, res) => {
  // Example TwiML: greet, gather speech/DTMF, then (optionally) start a Media Stream
  const twiml = `
    <Response>
        <Say>123</Say>
        <Start>
            <Stream url="wss://n8n-twilio-bridge-production.up.railway.app/stream"
                    track="both_tracks"
                    name="n8n-audio"/>
        </Start>

        <!-- Keep the call alive -->
        <Pause length="60"/>
        <!-- Optionally loop by redirecting back to this TwiML to extend beyond 60s -->
        <Redirect method="POST">/voice</Redirect>
        </Response>

  `.trim();

  // Tell Twilio we're returning XML/TwiML
  res.type('text/xml'); // equivalent to res.set('Content-Type','text/xml')
  res.send(twiml);
});



// --- Existing WSS bridge for Twilio Media Streams ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/stream' });
const prod_n8n = 'https://devops-novitas.app.n8n.cloud/webhook/1e766315-e1ab-4256-aa2c-fd51db320566/webhook';
const test_n8n = 'https://devops-novitas.app.n8n.cloud/webhook-test/1e766315-e1ab-4256-aa2c-fd51db320566/webhook';
wss.on('connection', (ws) => {
  ws.on('message', async (msg) => {
    // Forward raw Twilio media/JSON messages into n8n
    await fetch(test_n8n, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: msg
    });
  });
});

server.listen(8081, () => console.log('HTTP+WS server on :8080'));
