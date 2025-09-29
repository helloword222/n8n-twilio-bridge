// server.js
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const fetch = require('node-fetch');
const { spawn } = require('child_process');

const app = express();

// --- TwiML endpoint: Twilio will POST here when your number receives a call ---
app.post('/voice', (req, res) => {
  // Example TwiML: greet, gather speech/DTMF, then (optionally) start a Media Stream
  const twiml = `
    <Response>
        <Say>123</Say>
        <Start>
            <Stream url="wss://n8n-twilio-bridge-production.up.railway.app/ws/twilio"
                    track="both_tracks"
                    name="n8n-audio"/>
        </Start>

        <!-- Keep the call alive -->
        <Pause length="60"/>
        <!-- Optionally loop by redirecting back to this TwiML to extend beyond 60s -->
        <!--Redirect method="POST">/voice</Redirect-->
        </Response>

  `.trim();

  // Tell Twilio we're returning XML/TwiML
  res.type('text/xml'); // equivalent to res.set('Content-Type','text/xml')
  res.send(twiml);
});

const N8N_WEBHOOK = process.env.N8N_WEBHOOK_URL;
const XI_API_KEY = process.env.ELEVEN_API_KEY;

// μ-law decoder (8-bit → PCM16)
function decodeMulaw(buffer) {
  const out = new Int16Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    let uVal = ~buffer[i];
    let sign = uVal & 0x80;
    let exponent = (uVal >> 4) & 0x07;
    let mantissa = uVal & 0x0F;
    let magnitude = ((mantissa << 4) + 0x08) << (exponent + 3);
    out[i] = sign ? (0x84 - magnitude) : (magnitude - 0x84);
  }
  return Buffer.from(out.buffer);
}

// helper: spawn ffmpeg to upsample 8k PCM16 → 16k PCM16 (mono)
function upsamplePcm16(rawPcm8k) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-f','s16le','-ar','8000','-ac','1','-i','pipe:0',
      '-f','s16le','-ar','16000','-ac','1','pipe:1'
    ]);
    const chunks = [];
    ff.stdout.on('data', d => chunks.push(d));
    ff.on('close', code => code === 0 ? resolve(Buffer.concat(chunks)) : reject(code));
    ff.stdin.end(rawPcm8k);
  });
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/stream' });

wss.on('connection', async (twilio) => {
  // Connect to ElevenLabs realtime WS
  const eleven = new WebSocket(
    'wss://api.elevenlabs.io/v1/convai/conversation', // ElevenLabs realtime WS
    { headers: { 'xi-api-key': XI_API_KEY } }
  );

  let ready = false;
  eleven.on('open', () => { ready = true; });

  // Receive Twilio media frames
  twilio.on('message', async (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.event === 'media') {
      // decode μ-law base64 → PCM16 @ 8k
      const ulaw = Buffer.from(data.media.payload, 'base64');
      const pcm8k = Buffer.from(decodeMulaw(ulaw)); // 16-bit PCM @ 8k

      // upsample to 16k for ElevenLabs
      const pcm16k = await upsamplePcm16(pcm8k);

      if (ready) {
        eleven.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: pcm16k.toString('base64')
        }));
      }
    } else if (data.event === 'stop') {
      if (ready) eleven.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
    }
  });

  // Receive transcripts from ElevenLabs and forward to n8n
  eleven.on('message', async (evt) => {
    const e = JSON.parse(evt.toString());
    if (e.type === 'transcript' || e.type === 'response.transcript.delta') {
      await fetch(N8N_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(e)
      });
    }
  });
});

server.listen(8081, () => console.log('HTTP+WS server on :8081'));
