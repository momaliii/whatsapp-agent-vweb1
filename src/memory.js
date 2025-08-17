'use strict';

const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const memoryPath = path.join(dataDir, 'memory.json');
const profilesPath = path.join(dataDir, 'profiles.json');
const MAX_MESSAGES_PER_CONTACT = 500; // retain larger history for viewer

function ensureFile() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(memoryPath)) fs.writeFileSync(memoryPath, JSON.stringify({}, null, 2));
}

function readAll() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
  } catch {
    return {};
  }
}

function writeAll(all) {
  ensureFile();
  fs.writeFileSync(memoryPath, JSON.stringify(all, null, 2));
}

function getConversation(contactId) {
  const all = readAll();
  return Array.isArray(all[contactId]) ? all[contactId] : [];
}

function saveConversation(contactId, messages) {
  const all = readAll();
  all[contactId] = messages.slice(-MAX_MESSAGES_PER_CONTACT);
  writeAll(all);
}

function appendMessage(contactId, role, content, meta = {}) {
  const msgs = getConversation(contactId);
  const safeMeta = typeof meta === 'object' && meta ? meta : {};
  msgs.push({ role, content, ts: Date.now(), starred: false, labels: [], ...safeMeta });
  saveConversation(contactId, msgs);
}

function buildContext(contactId) {
  const msgs = getConversation(contactId);
  // Convert stored messages to OpenAI chat messages.
  // Treat manual 'note' entries as 'system'. Ignore internal reset markers.
  return msgs
    .filter(m => m.role !== '__reset__')
    .map(({ role, content }) => ({ role: role === 'note' ? 'system' : role, content }));
}

function listContacts() {
  const all = readAll();
  return Object.keys(all).map((contactId) => {
    const msgs = Array.isArray(all[contactId]) ? all[contactId] : [];
    const lastTs = msgs.length ? msgs[msgs.length - 1].ts : 0;
    return { contactId, count: msgs.length, lastTs };
  }).sort((a, b) => b.lastTs - a.lastTs);
}

function addNote(contactId, content) {
  appendMessage(contactId, 'note', content);
}

function clearConversation(contactId) {
  saveConversation(contactId, []);
}

module.exports = {
  getConversation,
  saveConversation,
  appendMessage,
  buildContext,
  updateMessage,
  deleteMessage,
  starMessage,
  addLabel,
  listContacts,
  addNote,
  clearConversation,
  renameContact,
  mergeContacts,
  getLastSummary,
  saveSummary,
  countMessagesSinceLastSummary,
  getContactProfile,
  updateContactProfile,
  inferLanguageFromText,
};

function updateMessage(contactId, index, updates) {
  const msgs = getConversation(contactId);
  if (index < 0 || index >= msgs.length) return;
  const current = msgs[index];
  const next = { ...current, ...updates };
  // Preserve required fields
  if (!next.ts) next.ts = current.ts;
  if (!next.role) next.role = current.role;
  if (!next.content && next.content !== '') next.content = current.content;
  msgs[index] = next;
  saveConversation(contactId, msgs);
}

function deleteMessage(contactId, index) {
  const msgs = getConversation(contactId);
  if (index < 0 || index >= msgs.length) return;
  msgs.splice(index, 1);
  saveConversation(contactId, msgs);
}

function starMessage(contactId, index, value) {
  const msgs = getConversation(contactId);
  if (index < 0 || index >= msgs.length) return;
  msgs[index].starred = Boolean(value);
  saveConversation(contactId, msgs);
}

function addLabel(contactId, index, label) {
  const msgs = getConversation(contactId);
  if (index < 0 || index >= msgs.length) return;
  const labels = Array.isArray(msgs[index].labels) ? msgs[index].labels : [];
  const normalized = String(label || '').trim();
  if (normalized && !labels.includes(normalized)) labels.push(normalized);
  msgs[index].labels = labels;
  saveConversation(contactId, msgs);
}

function renameContact(oldId, newId) {
  const all = readAll();
  if (!all[oldId]) return;
  all[newId] = (all[newId] || []).concat(all[oldId]);
  delete all[oldId];
  writeAll(all);
}

function mergeContacts(sourceId, targetId) {
  const all = readAll();
  const src = all[sourceId] || [];
  const tgt = all[targetId] || [];
  const merged = tgt.concat(src).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  all[targetId] = merged;
  delete all[sourceId];
  writeAll(all);
}


// Conversation summaries
function getLastSummary(contactId) {
  const msgs = getConversation(contactId);
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    const isSummary = m && m.role === 'note' && (m.kind === 'summary' || (Array.isArray(m.labels) && m.labels.includes('summary')));
    if (isSummary) return String(m.content || '');
  }
  return '';
}

function saveSummary(contactId, content) {
  const trimmed = String(content || '').trim();
  if (!trimmed) return;
  appendMessage(contactId, 'note', trimmed, { kind: 'summary' });
}

function countMessagesSinceLastSummary(contactId) {
  const msgs = getConversation(contactId);
  let count = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    const isSummary = m && m.role === 'note' && (m.kind === 'summary' || (Array.isArray(m.labels) && m.labels.includes('summary')));
    if (isSummary) break;
    count++;
  }
  return count;
}

// -------- Profiles (persistent per-contact preferences) --------
function ensureProfilesFile() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(profilesPath)) fs.writeFileSync(profilesPath, JSON.stringify({}, null, 2));
}

function readProfiles() {
  ensureProfilesFile();
  try {
    return JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
  } catch {
    return {};
  }
}

function writeProfiles(all) {
  ensureProfilesFile();
  fs.writeFileSync(profilesPath, JSON.stringify(all, null, 2));
}

function getContactProfile(contactId) {
  const all = readProfiles();
  const profile = all[contactId] || {};
  // Normalize keys
  return {
    name: typeof profile.name === 'string' ? profile.name : '',
    language: typeof profile.language === 'string' ? profile.language : '',
    deliveryWindow: typeof profile.deliveryWindow === 'string' ? profile.deliveryWindow : '',
    notes: typeof profile.notes === 'string' ? profile.notes : '',
  };
}

function updateContactProfile(contactId, updates) {
  const all = readProfiles();
  const current = all[contactId] || {};
  const next = { ...current };
  if (typeof updates.name === 'string') next.name = updates.name.trim();
  if (typeof updates.language === 'string') next.language = updates.language.trim().toLowerCase();
  if (typeof updates.deliveryWindow === 'string') next.deliveryWindow = updates.deliveryWindow.trim();
  if (typeof updates.notes === 'string') next.notes = updates.notes.trim();
  all[contactId] = next;
  writeProfiles(all);
  return next;
}

function inferLanguageFromText(text) {
  const t = String(text || '');
  // Simple heuristic: presence of Arabic Unicode range
  const hasArabic = /[\u0600-\u06FF]/.test(t);
  if (hasArabic) return 'ar';
  // If many Latin letters and few Arabic, assume English
  return 'en';
}


