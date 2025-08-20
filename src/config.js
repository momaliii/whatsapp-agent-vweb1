'use strict';

const fs = require('fs');
const path = require('path');

const configDir = path.join(__dirname, '..', 'config');
const configPath = path.join(configDir, 'config.json');
function activeProfileSafe(){
  try {
    const p = (getConfigRaw().activeProfile || process.env.WHATSAPP_PROFILE || 'default').toString();
    return p.replace(/[^a-z0-9_\-]/gi, '_');
  } catch { return 'default'; }
}
function profileScoped(key){
  return `${key}.${activeProfileSafe()}`;
}

const defaultConfig = {
  systemPrompt: process.env.SYSTEM_PROMPT || 'You are a helpful WhatsApp assistant. Keep replies brief and friendly.',
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  temperature: 0.7,
  maxTokens: 300,
  botEnabled: true,
  performanceMode: false,
  debugMode: false,
  // Licensing
  licenseKey: process.env.LICENSE_KEY || '',
  licenseValid: false,
  licenseValidUntil: null,
  licenseVerifiedAt: null,
  licenseVerifiedKeyHash: null,
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

function getConfigRaw() {
  try {
    ensureConfigFile();
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...defaultConfig, ...parsed };
  } catch {
    return { ...defaultConfig };
  }
}

function getConfig() {
  const raw = getConfigRaw();
  const ap = activeProfileSafe();
  // Scope arrays/collections by active profile if profile-specific keys exist
  const autoRepliesKey = profileScoped('autoReplies');
  const bulkTemplatesKey = profileScoped('bulkTemplates');
  const cfg = { ...raw };
  if (Array.isArray(raw[autoRepliesKey])) cfg.autoReplies = raw[autoRepliesKey];
  if (Array.isArray(raw[bulkTemplatesKey])) cfg.bulkTemplates = raw[bulkTemplatesKey];
  // Scope additional settings per profile if present
  const scopedKeys = [
    'systemPrompt',
    'model',
    'temperature',
    'maxTokens',
    'botEnabled',
    'performanceMode',
    'debugMode',
    'notifications',
    'easyOrders',
  ];
  for (const key of scopedKeys) {
    const pKey = profileScoped(key);
    if (Object.prototype.hasOwnProperty.call(raw, pKey)) {
      cfg[key] = raw[pKey];
    }
  }
  // always expose activeProfile
  cfg.activeProfile = ap;
  return cfg;
}

function setConfig(partialUpdate) {
  ensureConfigFile();
  const current = getConfigRaw();
  const ap = activeProfileSafe();
  const updated = { ...current };
  // When updating arrays that should be profile-scoped, write to profile key
  if (Object.prototype.hasOwnProperty.call(partialUpdate, 'autoReplies')) {
    updated[profileScoped('autoReplies')] = partialUpdate.autoReplies;
  }
  if (Object.prototype.hasOwnProperty.call(partialUpdate, 'bulkTemplates')) {
    updated[profileScoped('bulkTemplates')] = partialUpdate.bulkTemplates;
  }
  // Profile-scope additional settings if provided
  const scopedKeys = [
    'systemPrompt',
    'model',
    'temperature',
    'maxTokens',
    'botEnabled',
    'performanceMode',
    'debugMode',
    'notifications',
    'easyOrders',
  ];
  for (const key of scopedKeys) {
    if (Object.prototype.hasOwnProperty.call(partialUpdate, key)) {
      updated[profileScoped(key)] = partialUpdate[key];
    }
  }
  // Other scalar values remain global
  for (const k of Object.keys(partialUpdate)) {
    if (k === 'autoReplies' || k === 'bulkTemplates') continue;
    if (scopedKeys.includes(k)) continue;
    updated[k] = partialUpdate[k];
  }
  fs.writeFileSync(configPath, JSON.stringify(updated, null, 2));
  return updated;
}

module.exports = { getConfig, setConfig, configPath };


