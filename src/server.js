'use strict';

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const OpenAI = require('openai');

const app = express();
app.use(express.json());

const port = process.env.PORT || 3000;
const verifyToken = process.env.META_VERIFY_TOKEN;
const whatsappToken = process.env.META_WHATSAPP_TOKEN;
const phoneNumberId = process.env.META_PHONE_NUMBER_ID;

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const openaiClient = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

app.get('/', (req, res) => {
  res.send('WhatsApp AI agent is running');
});

// Webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token && mode === 'subscribe' && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Incoming messages
app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (message && message.type === 'text') {
      const from = message.from; // WhatsApp user phone number (international format)
      const userText = message.text?.body || '';

      const replyText = await generateReply(userText);
      await sendWhatsAppText(from, replyText);
    }

    // Always respond 200 within 10s
    res.sendStatus(200);
  } catch (error) {
    console.error('Error handling webhook:', error?.response?.data || error.message || error);
    // Still 200 so Meta doesn't retry aggressively
    res.sendStatus(200);
  }
});

async function generateReply(userText) {
  if (!openaiClient) {
    return 'Thanks for your message. The AI is not configured yet.';
  }

  const systemPrompt =
    process.env.SYSTEM_PROMPT || 'You are a helpful WhatsApp assistant. Keep replies brief and friendly.';

  const completion = await openaiClient.chat.completions.create({
    model: openaiModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ],
    temperature: 0.7,
    max_tokens: 300,
  });

  return completion.choices?.[0]?.message?.content?.trim() || '…';
}

async function sendWhatsAppText(to, text) {
  if (!whatsappToken || !phoneNumberId) {
    console.warn('WhatsApp environment variables are missing. Cannot send message.');
    return;
  }

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      to,
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${whatsappToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
  if (!verifyToken) console.warn('Missing META_VERIFY_TOKEN');
  if (!whatsappToken) console.warn('Missing META_WHATSAPP_TOKEN');
  if (!phoneNumberId) console.warn('Missing META_PHONE_NUMBER_ID');
  if (!openaiApiKey) console.warn('Missing OPENAI_API_KEY');
});

module.exports = app;


