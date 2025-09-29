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
      <Say>Welcome! Please say sales, support, or billing after the beep.</Say>
      <Gather input="speech dtmf"
              hints="sales,support,billing"
              language="en-US"
              action="/handle-gather"
              method="POST"
              timeout="5" />
      <!-- Optional: start a unidirectional media stream to your WSS bridge -->
      <Start>
        <Stream url="wss://n8n-twilio-bridge.vercel.app/stream" track="both_tracks" name="n8n-audio"/>
      </Start>
      <Say>No input received. Goodbye.</Say>
      <Hangup/>
    </Response>
  `.trim();

  // Tell Twilio we're returning XML/TwiML
  res.type('text/xml'); // equivalent to res.set('Content-Type','text/xml')
  res.send(twiml);
});

// Handle the <Gather> callback (Twilio will POST speechResult/digits here)
app.post('/handle-gather', express.urlencoded({ extended: false }), (req, res) => {
  const digits = req.body?.Digits;
  const speech = req.body?.SpeechResult;

  let message = 'Routing you to an agent.';
  if (digits) message = `You pressed ${digits}.`;
  if (speech) message = `You said: ${speech}.`;

  const reply = `
    <Response>
      <Say>${message}</Say>
      <Hangup/>
    </Response>
  `.trim();

  res.type('text/xml');
  res.send(reply);
});

// --- Existing WSS bridge for Twilio Media Streams ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/stream' });

wss.on('connection', (ws) => {
  ws.on('message', async (msg) => {
    // Forward raw Twilio media/JSON messages into n8n
    await fetch('https://devops-novitas.app.n8n.cloud/webhook/1e766315-e1ab-4256-aa2c-fd51db320566/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: msg
    });
  });
});

server.listen(8081, () => console.log('HTTP+WS server on :8080'));
