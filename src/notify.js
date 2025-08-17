'use strict';

const axios = require('axios');
const { getConfig } = require('./config');

async function notify({ title, message, client = null }) {
  const cfg = getConfig();
  if (!cfg.notifications || !cfg.notifications.enabled) return;

  const text = `*${title}*\n${message}`;

  await Promise.all([
    sendSlack(cfg.notifications.slackWebhookUrl, text),
    sendWhatsApp(cfg.notifications.adminWhatsApp, text, client),
  ]);
}

async function sendSlack(webhookUrl, text) {
  try {
    if (!webhookUrl) return;
    await axios.post(webhookUrl, { text });
  } catch (e) {
    console.warn('Slack notify failed:', e.message);
  }
}

async function sendWhatsApp(adminNumber, text, client) {
  try {
    if (!adminNumber) return;
    if (client && typeof client.getChatById === 'function') {
      // whatsapp-web.js path
      const chat = await client.getChatById(adminNumber);
      await chat.sendMessage(text);
      return;
    }
    // Fallback: Cloud API via env vars
    const token = process.env.META_WHATSAPP_TOKEN;
    const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) return;
    const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
    await axios.post(
      url,
      { messaging_product: 'whatsapp', to: adminNumber, text: { body: text } },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.warn('WhatsApp notify failed:', e.message);
  }
}

module.exports = { notify };


