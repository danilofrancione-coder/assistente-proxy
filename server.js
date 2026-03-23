const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.options('*', cors());
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  try {
    const messages = req.body.messages || [];
    
    // Prendi l'ultimo messaggio utente come prompt principale
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const prompt = lastUserMsg ? lastUserMsg.content : messages.map(m => m.content).join('\n');

    console.log('Prompt ricevuto:', prompt.slice(0, 200));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ 
            role: 'user',
            parts: [{ text: prompt }] 
          }],
          generationConfig: { 
            maxOutputTokens: 1000,
            temperature: 0.3
          }
        })
      }
    );

    const data = await response.json();
    console.log('Gemini response:', JSON.stringify(data).slice(0, 300));
    
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (!text) {
      console.error('Risposta vuota da Gemini:', JSON.stringify(data));
      return res.status(500).json({ error: 'Risposta vuota da Gemini', details: data });
    }

    res.json({ content: [{ type: 'text', text }] });
  } catch (err) {
    console.error('Errore proxy:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Proxy Gemini avviato su porta', process.env.PORT || 3000);
});
