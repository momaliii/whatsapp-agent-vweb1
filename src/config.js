'use strict';

const fs = require('fs');
const path = require('path');

const configDir = path.join(__dirname, '..', 'config');
const configPath = path.join(configDir, 'config.json');

const defaultConfig = {
  systemPrompt: process.env.SYSTEM_PROMPT || 'You are a helpful WhatsApp assistant. Keep replies brief and friendly.',
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  temperature: 0.7,
  maxTokens: 300,
  botEnabled: true,
  easyOrders: {
    enabled: false,
    webhookSecret: '',
    phoneField: 'customer',
    countryCodePrefix: '',
    sendOn: 'created',
    template: 'Hi {{name}}, your order {{order_id}} total {{total}} was received on {{date}}.',
    apiKey: '',
    listUrl: 'https://api.easy-orders.net/api/v1/external-apps/orders?limit=50&updated_after={{updated_after}}',
    pollEnabled: false,
    pollEverySec: 60,
    pollSinceIso: ''
  },
  notifications: {
    enabled: false,
    adminWhatsApp: '',
    slackWebhookUrl: '',
  },
  autoReplies: [
    // Example rule
    // { keyword: 'hello', type: 'text', value: 'Hi there! How can I help you?' }
  ],
  profiles: ['default'],
  activeProfile: process.env.WHATSAPP_PROFILE || 'default',
  bulkTemplates: []
};

function ensureConfigFile() {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
  }
}

function getConfig() {
  try {
    ensureConfigFile();
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...defaultConfig, ...parsed };
  } catch {
    return { ...defaultConfig };
  }
}

function setConfig(partialUpdate) {
  ensureConfigFile();
  const current = getConfig();
  const updated = { ...current, ...partialUpdate };
  fs.writeFileSync(configPath, JSON.stringify(updated, null, 2));
  return updated;
}

module.exports = { getConfig, setConfig, configPath };


