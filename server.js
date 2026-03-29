const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const webpush = require('web-push');

const app = express();
app.use(cors());
app.options('*', cors());
app.use(express.json());

// VAPID keys per le push notifications
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

webpush.setVapidDetails(
  'mailto:danilo.francione@metadonors.it',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Memoria dei timer attivi e delle subscription
const timers = {};
const subscriptions = {}; // { deviceId: subscription }

// ===== PROXY ANTHROPIC =====
app.post('/api/chat', async (req, res) => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== REGISTRA DISPOSITIVO =====
app.post('/api/subscribe', (req, res) => {
  const { deviceId, subscription } = req.body;
  if (!deviceId || !subscription) return res.status(400).json({ error: 'Mancano deviceId o subscription' });
  subscriptions[deviceId] = subscription;
  console.log('Dispositivo registrato:', deviceId);
  res.json({ ok: true });
});

// ===== SCHEDULA NOTIFICA =====
app.post('/api/schedule', (req, res) => {
  const { deviceId, reminderId, text, date } = req.body;
  if (!deviceId || !reminderId || !text || !date) {
    return res.status(400).json({ error: 'Parametri mancanti' });
  }

  const fireAt = new Date(date).getTime();
  const delay = fireAt - Date.now();

  // Cancella eventuale timer precedente per lo stesso promemoria
  if (timers[reminderId]) {
    clearTimeout(timers[reminderId]);
    delete timers[reminderId];
  }

  if (delay <= 0) {
    return res.json({ ok: true, skipped: true, reason: 'Data già passata' });
  }

  if (delay > 7 * 24 * 3600 * 1000) {
    return res.json({ ok: true, skipped: true, reason: 'Oltre 7 giorni, non schedulo' });
  }

  timers[reminderId] = setTimeout(async () => {
    const sub = subscriptions[deviceId];
    if (!sub) {
      console.warn('Nessuna subscription per deviceId:', deviceId);
      return;
    }
    try {
      await webpush.sendNotification(sub, JSON.stringify({
        title: '⏰ ' + text,
        body: 'Tocca per gestire',
        id: reminderId
      }));
      console.log('Notifica inviata per:', text);
    } catch (err) {
      console.error('Errore invio notifica:', err.message);
      if (err.statusCode === 410) {
        // Subscription scaduta
        delete subscriptions[deviceId];
      }
    }
    delete timers[reminderId];
  }, delay);

  console.log(`Notifica schedulata: "${text}" tra ${Math.round(delay/60000)} minuti`);
  res.json({ ok: true, delay: Math.round(delay / 1000) });
});

// ===== CANCELLA NOTIFICA =====
app.post('/api/unschedule', (req, res) => {
  const { reminderId } = req.body;
  if (timers[reminderId]) {
    clearTimeout(timers[reminderId]);
    delete timers[reminderId];
    console.log('Timer cancellato per:', reminderId);
  }
  res.json({ ok: true });
});

// ===== VAPID PUBLIC KEY =====
app.get('/api/vapid-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Server avviato su porta', process.env.PORT || 3000);
});
