'use strict';

require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
let QRCodeLib = null; try { QRCodeLib = require('qrcode'); } catch {}
let puppeteerLib = null; try { puppeteerLib = require('puppeteer'); } catch {}
const OpenAI = require('openai');
const express = require('express');
const cookieParser = require('cookie-parser');
const { createDashboardApp } = require('./dashboard');
const { getConfig } = require('./config');
const { appendMessage, buildContext, getLastSummary, saveSummary, countMessagesSinceLastSummary, getContactProfile, updateContactProfile, inferLanguageFromText } = require('./memory');
const { search } = require('./kb');
const fs = require('fs');
const path = require('path');

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiModelEnv = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const openaiClient = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

let activeProfile = getConfig().activeProfile || 'default';
let client = new Client({
  authStrategy: new LocalAuth({ clientId: `whatsapp-ai-agent-${activeProfile}` }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: puppeteerLib && typeof puppeteerLib.executablePath === 'function' ? puppeteerLib.executablePath() : undefined,
  },
});

let connectionState = { status: 'starting', lastQR: null };
let latestQRDataUrl = null;
client.on('qr', async (qr) => {
  console.log('Scan this QR code with your WhatsApp:');
  qrcode.generate(qr, { small: true });
  connectionState = { status: 'qr', lastQR: Date.now() };
  try {
    if (QRCodeLib) {
      latestQRDataUrl = await QRCodeLib.toDataURL(qr, { width: 240, margin: 1 });
    }
  } catch (error) {
    console.error('Error generating QR code for dashboard:', error);
  }
});

client.on('ready', () => {
  console.log('WhatsApp Web client is ready.');
  connectionState = { status: 'ready', lastQR: null };
});

client.on('authenticated', () => { connectionState = { status: 'authenticated', lastQR: null }; });
client.on('disconnected', () => { connectionState = { status: 'disconnected', lastQR: null }; });

client.on('message', async (msg) => {
  try {
    // Avoid loops and ignore group chats
    if (msg.fromMe) return;
    const chat = await msg.getChat();
    if (chat?.isGroup) return;

    const text = msg.body?.trim() || '';
    if (!text) return;
      const cfgNow = getConfig();
      if (cfgNow && cfgNow.botEnabled === false) return;
    
    // Auto-replies based on keyword
      const auto = (getConfig().autoReplies || []).filter(r => r.enabled !== false);
    const matched = auto.find(r => text.toLowerCase().includes(String(r.keyword||'').toLowerCase()));
    if (matched) {
      await sendAutoReply(msg.from, matched);
      return;
    }

    const reply = await handleMessage(msg.from, text);
    await msg.reply(reply);
  } catch (error) {
    console.error('Error handling message:', error?.response?.data || error.message || error);
  }
});

async function handleMessage(contactId, userText) {
  if (userText === '/menu') {
    await sendMenu(contactId);
    return 'Please choose an option above.';
  }
  if (userText === '/help') {
    return 'Commands: /menu, /reset, /help';
  }
  if (userText === '/reset') {
    appendMessage(contactId, '__reset__', '');
    return 'Context reset.';
  }

  // Profile management commands
  try {
    const trimmed = String(userText || '').trim();
    const langPref = getContactProfile(contactId).language || inferLanguageFromText(userText);
    const t = (en, ar) => (langPref === 'ar' ? ar : en);

    // /set name <Name>
    let m = trimmed.match(/^\s*\/set\s+name\s+(.+)/i);
    if (m && m[1]) {
      const name = m[1].trim().split(/[;,\.\-\|!]/)[0].trim().split(/\s+/).slice(0, 3).join(' ');
      if (name) {
        updateContactProfile(contactId, { name });
        return t(`Saved name: ${name}`, `تم حفظ الاسم: ${name}`);
      }
    }

    // /set lang <ar|en>
    m = trimmed.match(/^\s*\/set\s+(?:lang|language)\s+(ar|en)\b/i);
    if (m && m[1]) {
      const language = m[1].toLowerCase();
      updateContactProfile(contactId, { language });
      return language === 'ar' ? 'تم ضبط اللغة: العربية' : 'Language set: English';
    }

    // /set window <window>
    m = trimmed.match(/^\s*\/set\s+(?:window|delivery|delivery\s*window)\s+(.+)/i);
    if (m && m[1]) {
      const deliveryWindow = m[1].trim();
      if (deliveryWindow) {
        updateContactProfile(contactId, { deliveryWindow });
        return t(`Saved delivery window: ${deliveryWindow}`, `تم حفظ ميعاد التسليم: ${deliveryWindow}`);
      }
    }
  } catch {}

  // Update profile heuristics (language, name extraction)
  try {
    const lang = inferLanguageFromText(userText);
    const profile = getContactProfile(contactId);
    if (!profile.language || profile.language !== lang) {
      updateContactProfile(contactId, { language: lang });
    }
    // Naive name capture: "أنا اسمي X" or "my name is X" → store first token of X
    const arMatch = userText.match(/(?:انا|أنا)\s+اسمي\s+([^\n\r]+)/i);
    const enMatch = userText.match(/my name is\s+([^\n\r]+)/i);
    const nameRaw = (arMatch && arMatch[1]) || (enMatch && enMatch[1]) || '';
    if (nameRaw) {
      const name = String(nameRaw).split(/[;,\.\-\|!]/)[0].trim().split(/\s+/).slice(0, 3).join(' ');
      if (name && (!profile.name || profile.name.toLowerCase() !== name.toLowerCase())) {
        updateContactProfile(contactId, { name });
      }
    }
  } catch {}

  return generateReply(contactId, userText);
}

async function generateReply(contactId, userText) {
  if (!openaiClient) {
    return 'Thanks for your message. The AI is not configured yet. Set OPENAI_API_KEY in .env to enable smart replies.';
  }
  const cfg = getConfig();
  const systemPrompt = cfg.systemPrompt || 'You are a helpful WhatsApp assistant. Keep replies brief and friendly.';

  // RAG retrieval
  let kbContext = '';
  let top = [];
  try {
    top = await search(userText, 4);
    if (top.length) {
      kbContext = top.map((t, i) => `Source ${i + 1} (${t.source}):\n${t.chunk}`).join('\n\n');
    }
  } catch {}

  // Build short per-contact memory
  const memoryMsgs = buildContext(contactId);

  // Lightweight conversation summary to keep continuity without long histories
  const lastSummary = getLastSummary(contactId);

  const profile = getContactProfile(contactId);
  const messages = [
    { role: 'system', content: [
      systemPrompt,
      'Write naturally and warmly. Use short paragraphs, emojis sparingly where appropriate, and confirm understanding before answering if the user is unclear.',
      'Mirror the user\'s language and tone (Arabic vs English). If the user writes in Arabic, answer in Arabic.',
      profile.language ? `Preferred language (from profile): ${profile.language}` : '',
      profile.name ? `User name (from profile): ${profile.name}` : '',
      profile.deliveryWindow ? `Preferred delivery window (from profile): ${profile.deliveryWindow}` : '',
      'Prefer actionable, concise answers with one follow-up question when helpful.',
    ].filter(Boolean).join('\n') },
    ...(kbContext ? [{ role: 'system', content: `Relevant knowledge base context:\n${kbContext}` }] : []),
    ...(lastSummary ? [{ role: 'system', content: `Conversation summary so far (use to stay consistent):\n${lastSummary}` }] : []),
    ...memoryMsgs,
    { role: 'user', content: userText },
  ];

  const completion = await openaiClient.chat.completions.create({
    model: cfg.model || openaiModelEnv,
    messages,
    temperature: cfg.temperature ?? 0.7,
    max_tokens: cfg.maxTokens ?? 300,
  });
  const answer = completion.choices?.[0]?.message?.content?.trim() || '…';

  if (userText !== '/reset') {
    appendMessage(contactId, 'user', userText);
    const sourcesMeta = Array.isArray(top) ? top.map((t) => ({
      source: t.source,
      score: typeof t.score === 'number' ? Number(t.score.toFixed(3)) : undefined,
      preview: (t.chunk || '').slice(0, 180),
    })) : [];
    appendMessage(contactId, 'assistant', answer, sourcesMeta.length ? { sources: sourcesMeta } : {});

    // Periodically refresh summary to keep context compact
    try {
      const since = countMessagesSinceLastSummary(contactId);
      if (since >= 12) {
        const freshContext = buildContext(contactId);
        const summaryPrompt = [
          { role: 'system', content: 'Summarize the recent conversation between the assistant and the user into 5-8 bullet points capturing user preferences, open questions, decisions, and key facts. Be specific and concise. Keep it neutral and third-person.' },
          ...freshContext.slice(-20),
        ];
        const sum = await openaiClient.chat.completions.create({
          model: cfg.model || openaiModelEnv,
          messages: summaryPrompt,
          temperature: 0.3,
          max_tokens: 200,
        });
        const sumText = sum.choices?.[0]?.message?.content?.trim() || '';
        if (sumText) saveSummary(contactId, sumText);
      }
    } catch {}
  } else {
    appendMessage(contactId, 'system', '[conversation reset]');
  }

  return answer;
}

client.initialize();

// Dashboard server
const app = express();
app.use('/assets', express.static(require('path').join(__dirname, '..', 'public')));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
function getClient() { return client; }
app.use('/', createDashboardApp({ client, getClient }));
const { createKbPage } = require('./kb_page');
app.use('/kb', createKbPage());
const { createConvosPage } = require('./convos_page');
app.use('/convos', createConvosPage());
const { createAutoPage } = require('./auto_page');
app.use('/auto', createAutoPage());
const { createSettingsPage } = require('./settings_page');
app.use('/settings', createSettingsPage());
const { createProfilesPage } = require('./profiles_page');
app.use('/profiles', createProfilesPage());
const { createDeployPage } = require('./deploy_page');
app.use('/deploy', createDeployPage());
const { createContactsPage } = require('./contacts_page');
app.use('/contacts', createContactsPage({ getClient }));
const { createCheckerPage } = require('./checker_page');
app.use('/checker', createCheckerPage({ getClient }));
const { createBulkPage } = require('./bulk_page');
app.use('/bulk', createBulkPage({ getClient }));
const { createEasyOrdersPage } = require('./easyorders_page');
app.use('/easy', createEasyOrdersPage({ getClient }));
const { startEasyOrdersPoller } = require('./easyorders_page');

// Simple admin auth
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
function requireAuth(req, res, next) {
  if (!ADMIN_PASSWORD) return next();
  const token = req.cookies.admin || '';
  if (token === ADMIN_PASSWORD) return next();
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="/assets/style.css"/><title>Login</title></head><body><div class="container"><h1>Login</h1><form method="post" action="/login" class="card"><label>Password</label><input type="password" name="password"/><button class="btn" type="submit">Sign in</button></form></div></body></html>`);
}

app.post('/login', (req, res) => {
  if (!ADMIN_PASSWORD) return res.redirect('/');
  const pw = String(req.body.password || '');
  if (pw === ADMIN_PASSWORD) {
    res.cookie('admin', ADMIN_PASSWORD, { httpOnly: true, sameSite: 'lax' });
    return res.redirect('/');
  }
  return res.redirect('/');
});

// Protect all pages if password set
app.use(requireAuth);
app.get('/status/whatsapp', (req, res) => {
  try {
    const response = { 
      profile: activeProfile, 
      status: connectionState.status, 
      lastQR: connectionState.lastQR, 
      qrDataUrl: latestQRDataUrl 
    };
    res.json(response);
  } catch (e) {
    console.error('Status endpoint error:', e);
    res.json({ profile: activeProfile, status: 'unknown' });
  }
});



// Hot switch: recreate client with new profile
app.get('/profiles/switch-now', async (req, res) => {
  const name = String(req.query.name || '').trim();
  const cfg = getConfig();
  if (!name || !(cfg.profiles||[]).includes(name)) return res.redirect('/profiles');
  try {
    connectionState = { status: 'restarting', lastQR: null };
    try { await client.destroy(); } catch {}
    activeProfile = name;
    client = new Client({
      authStrategy: new LocalAuth({ clientId: `whatsapp-ai-agent-${activeProfile}` }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: puppeteerLib && typeof puppeteerLib.executablePath === 'function' ? puppeteerLib.executablePath() : undefined,
      },
    });
    client.on('qr', (qr) => { qrcode.generate(qr, { small: true }); connectionState = { status: 'qr', lastQR: Date.now() }; });
    client.on('ready', () => { connectionState = { status: 'ready', lastQR: null }; });
    client.on('authenticated', () => { connectionState = { status: 'authenticated', lastQR: null }; });
    client.on('disconnected', () => { connectionState = { status: 'disconnected', lastQR: null }; });
    client.on('message', async (msg) => {
      try {
        if (msg.fromMe) return;
        const chat = await msg.getChat();
        if (chat?.isGroup) return;
        const text = msg.body?.trim() || '';
        if (!text) return;
        const cfgNow = getConfig();
        if (cfgNow && cfgNow.botEnabled === false) return;
        const auto = (getConfig().autoReplies || []).filter(r => r.enabled !== false);
        const matched = auto.find(r => text.toLowerCase().includes(String(r.keyword||'').toLowerCase()));
        if (matched) { await sendAutoReply(msg.from, matched); return; }
        const reply = await handleMessage(msg.from, text);
        await msg.reply(reply);
      } catch (error) { console.error('Error handling message:', error?.response?.data || error.message || error); }
    });
    client.initialize();
  } catch (e) {
    console.error('Hot switch error:', e.message);
  }
  res.redirect('/profiles');
});
// Lightweight router for simple pages
app.get('/page/:section', (req, res) => {
  const sec = req.params.section;
  if (sec === 'kb' || sec === 'convos' || sec === 'auto') {
    // anchor navigation handled client-side; return the same HTML
    res.redirect('/#' + (sec === 'kb' ? 'kb' : sec === 'convos' ? 'convos' : 'auto'));
  } else {
    res.redirect('/');
  }
});
const dashboardPort = process.env.DASHBOARD_PORT || 4000;
app.listen(dashboardPort, () => {
  console.log(`Dashboard available at http://localhost:${dashboardPort}`);
});

// Start EasyOrders API poller (if enabled in settings)
try { startEasyOrdersPoller({ getClient }); } catch {}

async function sendMenu(to) {
  try {
    const chat = await client.getChatById(to);
    const menuText = [
      'Menu:',
      '1) Ask a question',
      '2) Upload a PDF in the dashboard and ask from it',
      '3) Reset context with /reset',
      '',
      'Profile settings:',
      '- /set name <Your Name>',
      '- /set lang ar|en',
      '- /set window <e.g. 9-17 or evenings>',
    ].join('\n');
    await chat.sendMessage(menuText);
  } catch (e) {
    console.error('sendMenu error:', e.message);
  }
}



async function sendAutoReply(to, rule) {
  try {
    const chat = await client.getChatById(to);
    switch (rule.type) {
      case 'text':
        await chat.sendMessage(rule.value || '');
        if (rule.extraText) await chat.sendMessage(rule.extraText);
        break;
      case 'image':
      case 'video':
      case 'audio':
      case 'file': {
        // If value points to our local media route, send the actual file via WhatsApp
        if (typeof rule.value === 'string' && rule.value.startsWith('/media/')) {
          const filename = path.basename(rule.value);
          const absPath = path.join(__dirname, '..', 'uploads', filename);
          try {
            const media = MessageMedia.fromFilePath(absPath);
            await chat.sendMessage(media, { caption: rule.caption || undefined });
          } catch (e) {
            // Fallback to sending the link if file not found
            await chat.sendMessage(rule.value);
          }
        } else {
          // External URL or unknown path: send as link
          await chat.sendMessage(rule.value);
        }
        if (rule.extraText) await chat.sendMessage(rule.extraText);
        break;
      }
      default:
        await chat.sendMessage(String(rule.value || ''));
        if (rule.extraText) await chat.sendMessage(rule.extraText);
    }
  } catch (e) {
    console.error('sendAutoReply error:', e.message);
  }
}


