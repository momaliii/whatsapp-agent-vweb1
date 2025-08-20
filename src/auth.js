'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const JWT_EXPIRES_DAYS = Number(process.env.JWT_EXPIRES_DAYS || 7);

// Connect once (idempotent)
let mongoConnected = false;
async function ensureMongoConnection() {
  if (mongoConnected) return;
  const uri = process.env.MONGODB_URI || '';
  if (!uri) throw new Error('MONGODB_URI not set');
  await mongoose.connect(uri, { autoIndex: true });
  mongoConnected = true;
}

// Schemas
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  phone: { type: String },
  createdAt: { type: Date, default: () => new Date() },
});

const licenseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  key: { type: String, required: true, unique: true, index: true },
  validUntil: { type: Date, required: true },
  singleUse: { type: Boolean, default: true },
  used: { type: Boolean, default: false },
  boundInstanceId: { type: String, default: null },
  createdAt: { type: Date, default: () => new Date() },
});

const leadSchema = new mongoose.Schema({
  name: { type: String },
  email: { type: String, index: true },
  company: { type: String },
  phone: { type: String },
  message: { type: String },
  monthlyConversations: { type: Number },
  createdAt: { type: Date, default: () => new Date() },
});

const User = mongoose.models.User || mongoose.model('User', userSchema);
const License = mongoose.models.License || mongoose.model('License', licenseSchema);
const Lead = mongoose.models.Lead || mongoose.model('Lead', leadSchema);

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${JWT_EXPIRES_DAYS}d` });
}

function authMiddleware(req, res, next) {
  try {
    const token = req.cookies && req.cookies.auth;
    if (!token) return res.redirect('/login');
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.redirect('/login');
  }
}

function createAuthRouter() {
  const router = express.Router();
  router.use(express.urlencoded({ extended: true }));
  router.use(express.json());

  const limiter = rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.RATE_LIMIT_MAX || 100),
    standardHeaders: true,
    legacyHeaders: false,
  });
  // Note: Do not apply limiter globally to avoid throttling dashboard GETs.

  // Landing page (unauthenticated)
  router.get('/', async (req, res, next) => {
    const token = req.cookies && req.cookies.auth;
    if (token) {
      try { jwt.verify(token, JWT_SECRET); return next(); } catch {}
    }
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <link rel="stylesheet" href="/assets/style.css"/>
  <link rel="stylesheet" href="/assets/landing.css"/>
  <title>WhatsApp AI – Web Tools</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🤖</text></svg>">
  <meta name="description" content="WhatsApp AI web tools: Dashboard, Knowledge Base, Auto Replies, Conversations, Bulk, Contacts, Easy Orders, Deploy & more."/>
  <meta name="theme-color" content="#0b1220"/>
  <meta property="og:title" content="WhatsApp AI – Smart 24/7 Agent"/>
  <meta property="og:description" content="Auto replies, bulk messages, RAG from your docs, and a modern dashboard."/>
  <meta property="og:type" content="website"/>
  <meta property="og:url" content="/"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <script>document.documentElement.classList.add('js')</script>
  <noscript><style>.tabs,.panel{display:none!important}</style></noscript>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"WhatsApp AI Agent","applicationCategory":"BusinessApplication","operatingSystem":"Web","offers":{"@type":"Offer","price":"0","priceCurrency":"USD"}}</script>
  </head>
<body>
  <div class="landing">
  <div class="container">
    <div class="landing-nav">
      <div class="landing-logo">
        <div class="landing-logo-badge">🤖</div>
        <div class="landing-logo-text">WhatsApp AI</div>
      </div>
      <div class="landing-links">
        <a href="#services">Services</a>
        <a href="#pricing">Pricing</a>
        <a href="#contact">Contact</a>
        <a href="/login">Login</a>
        <a class="btn btn-success" href="/signup">Sign up</a>
      </div>
    </div>
  </div>
  <div class="hero">
    <div class="container hero-grid">
      <div>
        <div class="pill">🤖 <span class="logo-word">WhatsApp AI</span> Web Tools</div>
        <h1>Grow faster with an AI-powered WhatsApp workspace</h1>
        <p>Centralized dashboard for your conversations, knowledge base, and automated replies. Upload docs, configure rules, send bulk messages, and monitor performance — all in one place.</p>
        <div class="cta">
          <a class="btn btn-success" href="/signup">Create free account</a>
          <a class="btn btn-outline" href="#services">Explore services</a>
          <a class="btn" href="/login">Login</a>
        </div>
        <form id="ctaEmailForm" class="cta" style="gap:8px;align-items:center">
          <input type="email" name="email" class="input" placeholder="Work email for a quick demo link" style="max-width:320px" required/>
          <button class="btn" type="submit">Send me a demo</button>
          <span id="ctaEmailThanks" class="muted" style="display:none">Sent! Check your inbox.</span>
        </form>
        <div class="badges">
          <span class="badge">24/7 Agent</span><span class="badge">Auto Replies</span><span class="badge">Bulk</span><span class="badge">RAG</span>
        </div>
      </div>
      <div class="hero-right">
        <div class="device">
          <div class="device-notch"></div>
          <div class="device-chat">
            <div class="bubble bot">Hello! 👋 How can I help you today?</div>
            <div class="bubble me">Do you support PDF uploads?</div>
            <div class="bubble bot">Yes! Upload PDFs in the dashboard and ask from them. Want a quick demo?</div>
            <div class="bubble me">Yes please</div>
            <div class="bubble bot">Awesome — check your dashboard → KB to get started 🚀</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="container section reveal" id="trusted">
    <div class="trusted">
      <span class="note">Trusted by</span>
      <span class="brand">Alpha</span>
      <span class="brand">Beta</span>
      <span class="brand">Gamma</span>
      <span class="brand">Delta</span>
    </div>
  </div>

  <div class="container" id="services">
      <div class="services reveal">
        <h2 class="h2">Core services</h2>
        <div class="grid cols-3">
          <div class="card">
            <div class="service-icon">🤖</div>
            <h3>24/7 Smart WhatsApp Agent</h3>
            <p>Always-on AI that reads context and responds naturally, day and night.</p>
            <div class="cta"><a class="btn btn-success" href="/signup">Start now</a></div>
          </div>
          <div class="card">
            <div class="service-icon">🧭</div>
            <h3>Custom Prompt</h3>
            <p>Set your brand voice and goals so replies feel authentic and on-message.</p>
            <div class="cta"><a class="btn btn-outline" href="/settings">Set prompt</a></div>
          </div>
          <div class="card">
            <div class="service-icon">⚡</div>
            <h3>Auto Replies</h3>
            <p>Rules for instant answers and menus. Send text or media on specific keywords.</p>
            <div class="cta"><a class="btn btn-outline" href="/auto">Configure</a></div>
          </div>
          <div class="card">
            <div class="service-icon">📣</div>
            <h3>Bulk Messages</h3>
            <p>Upload CSV and send targeted campaigns with placeholders and safe throttling.</p>
            <div class="cta"><a class="btn btn-outline" href="/bulk">Send bulk</a></div>
          </div>
          <div class="card">
            <div class="service-icon">📇</div>
            <h3>Extract Numbers</h3>
            <p>Pull numbers from chats and contacts to build clean, ready-to-use lists.</p>
            <div class="cta"><a class="btn btn-outline" href="/contacts">View contacts</a></div>
          </div>
          <div class="card">
            <div class="service-icon">📚</div>
            <h3>RAG Knowledge</h3>
            <p>Upload docs and answer from them using Retrieval-Augmented Generation.</p>
            <div class="cta"><a class="btn btn-outline" href="/kb">Upload KB</a></div>
          </div>
        </div>
      </div>
  </div>

  <div class="container section reveal" id="usecases">
    <h2 class="h2">Use cases</h2>
    <div class="grid cols-3 usecases">
      <div class="card"><h3>Support</h3><p>Instant answers with friendly tone and KB context.</p></div>
      <div class="card"><h3>Sales</h3><p>Qualify leads, collect numbers, and send follow-ups.</p></div>
      <div class="card"><h3>Operations</h3><p>Order notifications and reminders via Easy Orders.</p></div>
    </div>
  </div>

  <div class="container section reveal" id="stats">
    <div class="grid cols-3">
      <div class="card"><h3><span class="counter" data-target="25000">0</span>+ messages/day</h3><p class="note">Across all active agents</p></div>
      <div class="card"><h3><span class="counter" data-target="12">0</span>s average reply</h3><p class="note">Fast, friendly responses</p></div>
      <div class="card"><h3><span class="counter" data-target="50000">0</span> KB chunks</h3><p class="note">Indexed for accurate answers</p></div>
    </div>
  </div>

  <div class="container section reveal" id="pricing">
    <h2 class="h2">Pricing</h2>
    <div class="toggle-row"><label class="toggle"><input id="billingToggle" type="checkbox"/><span>Yearly (save 20%)</span></label></div>
    <div class="grid cols-3 pricing-cards">
      <div class="card price-card">
        <h3>Starter</h3>
        <div class="price" data-monthly="$0" data-yearly="$0">$0</div>
        <ul><li>1 profile</li><li>KB + Auto replies</li><li>Email support</li></ul>
        <div class="cta"><a class="btn btn-success" href="/signup">Get started</a></div>
      </div>
      <div class="card price-card">
        <h3>Growth</h3>
        <div class="price" data-monthly="$29" data-yearly="$23">$29</div>
        <ul><li>2 profiles</li><li>Priority support</li><li>Bulk sender</li></ul>
        <div class="cta"><a class="btn btn-success" href="/signup">Choose Growth</a></div>
      </div>
      <div class="card price-card">
        <h3>Scale</h3>
        <div class="price" data-monthly="$99" data-yearly="$79">$99</div>
        <ul><li>5 profiles</li><li>SLA support</li><li>Advanced automations</li></ul>
        <div class="cta"><a class="btn btn-success" href="/signup">Choose Scale</a></div>
      </div>
    </div>
  </div>

  <div class="container section reveal" id="compare">
    <h2 class="h2">Why choose us</h2>
    <div class="card compare">
      <div class="row">
        <div><strong>Feature</strong></div>
        <div><strong>WhatsApp AI</strong></div>
        <div><strong>Generic bot</strong></div>
      </div>
      <div class="row"><div>RAG from PDFs/Docs</div><div>✅</div><div>❌</div></div>
      <div class="row"><div>Bulk CSV sender</div><div>✅</div><div>❌</div></div>
      <div class="row"><div>Auto replies (media)</div><div>✅</div><div>⚠️ Limited</div></div>
      <div class="row"><div>Easy Orders integration</div><div>✅</div><div>❌</div></div>
      <div class="row"><div>Profiles & quick switch</div><div>✅</div><div>❌</div></div>
    </div>
  </div>
  
  <div class="container section reveal" id="testimonials">
    <h2 class="h2">What customers say</h2>
    <div class="card" id="testimonialCard">
      <blockquote id="quote">“Super easy to set up and our response time dropped by 70%.”</blockquote>
      <div class="note" id="author">— Retail brand</div>
    </div>
  </div>

  <div class="container section reveal" id="contact">
    <h2 class="h2">Book a live demo</h2>
    <div class="grid cols-2">
      <form class="card" id="leadForm">
        <div class="input-row"><input class="input" name="name" placeholder="Your name" required/></div>
        <div class="input-row"><input class="input" name="email" type="email" placeholder="Work email" required/></div>
        <div class="input-row"><input class="input" name="company" placeholder="Company"/></div>
        <div class="input-row"><input class="input" name="phone" placeholder="Phone (optional)"/></div>
        <div class="input-row"><textarea class="input" name="message" rows="4" placeholder="Tell us about your use case (optional)"></textarea></div>
        <div class="input-row"><button class="btn btn-success" type="submit">Request demo</button></div>
        <div id="leadThanks" class="note" style="display:none">Thanks! We'll reach out shortly.</div>
      </form>
      <div class="card">
        <h3>What to expect</h3>
        <ul>
          <li>15–20 minute walkthrough tailored to your workflow</li>
          <li>Best-practice tips for KB and automation</li>
          <li>Clear next steps to go live</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="landing-footer">
    <div class="container">© ${new Date().getFullYear()} WhatsApp AI Tools</div>
  </div>
  <div class="sticky-cta"><div class="container"><a href="/signup" class="btn btn-success">Start free</a><a href="/login" class="btn btn-outline">Login</a></div></div>
  <a class="whatsapp-fab" href="https://wa.me/201060098267" aria-label="Contact on WhatsApp">💬</a>
  <a href="#top" class="top-fab" aria-label="Back to top">↑</a>
  <script src="/assets/landing.js"></script>
</body>
</html>`);
  });

  router.get('/signup', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="/assets/style.css"/><title>Sign up</title>
    <style>
      .auth-wrap{max-width:980px;margin:40px auto;display:grid;gap:16px}
      @media(min-width:900px){.auth-wrap{grid-template-columns:1fr 1fr}}
      .auth-card{padding:0}
      .auth-card .inner{padding:24px}
      .auth-aside{display:flex;flex-direction:column;gap:12px}
      .auth-title{margin:0 0 8px 0}
      .auth-sub{color:var(--muted);margin:0 0 16px 0}
      .input-row{margin-top:10px}
      .actions{display:flex;gap:10px;align-items:center;margin-top:14px}
      .pw-toggle{position:relative}
      .pw-toggle-btn{position:absolute;right:10px;top:10px;background:transparent;border:0;color:var(--muted);cursor:pointer}
    </style>
    </head><body>
      <div class="auth-wrap container">
        <div class="card auth-aside">
          <h2 class="auth-title">Create your account</h2>
          <p class="auth-sub">Set up access to your WhatsApp AI tools and dashboard.</p>
          <ul>
            <li>24/7 smart agent with custom prompt</li>
            <li>Upload PDFs/Docs and answer from them (RAG)</li>
            <li>Auto replies and bulk messaging</li>
          </ul>
        </div>
        <div class="card auth-card">
          <div class="inner">
            <form method="post" action="/signup">
              <label>Email</label>
              <div class="input-row"><input name="email" type="email" placeholder="you@company.com" required/></div>
              <label>Password</label>
              <div class="input-row pw-toggle">
                <input id="pw" name="password" type="password" placeholder="••••••••" required/>
                <button id="pwToggle" class="pw-toggle-btn" aria-label="Toggle password">Show</button>
              </div>
              <label>Phone (optional)</label>
              <div class="input-row"><input name="phone" type="tel" placeholder="+201234567890"/></div>
              <div class="actions">
                <button class="btn btn-success" type="submit">Sign up</button>
                <span class="muted">Already have an account? <a href="/login">Login</a></span>
              </div>
            </form>
          </div>
        </div>
      </div>
      <script>
        (function(){
          const pw = document.getElementById('pw');
          const btn = document.getElementById('pwToggle');
          if(pw && btn){
            btn.addEventListener('click', function(e){ e.preventDefault(); const t = pw.getAttribute('type')==='password' ? 'text' : 'password'; pw.setAttribute('type', t); btn.textContent = t==='password' ? 'Show' : 'Hide'; });
          }
        })();
      </script>
    </body></html>`);
  });

  router.post('/signup', limiter, async (req, res) => {
    try {
      await ensureMongoConnection();
      const email = String(req.body.email || '').toLowerCase().trim();
      const password = String(req.body.password || '');
      const phone = String(req.body.phone || '').trim();
      if (!email || !password) return res.redirect('/signup');
      const existing = await User.findOne({ email }).lean();
      if (existing) return res.redirect('/login');
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await User.create({ email, passwordHash, phone });
      const token = signToken({ id: user._id.toString(), email });
      res.cookie('auth', token, { httpOnly: true, sameSite: 'lax' });
      return res.redirect('/license');
    } catch (e) {
      console.error('Signup error:', e.message);
      return res.redirect('/signup');
    }
  });

  router.get('/login', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="/assets/style.css"/><title>Login</title>
    <style>
      .auth-wrap{max-width:980px;margin:40px auto;display:grid;gap:16px}
      @media(min-width:900px){.auth-wrap{grid-template-columns:1fr 1fr}}
      .auth-card{padding:0}
      .auth-card .inner{padding:24px}
      .auth-aside{display:flex;flex-direction:column;gap:12px}
      .auth-title{margin:0 0 8px 0}
      .auth-sub{color:var(--muted);margin:0 0 16px 0}
      .input-row{margin-top:10px}
      .actions{display:flex;gap:10px;align-items:center;margin-top:14px}
      .pw-toggle{position:relative}
      .pw-toggle-btn{position:absolute;right:10px;top:10px;background:transparent;border:0;color:var(--muted);cursor:pointer}
    </style>
    </head><body>
      <div class="auth-wrap container">
        <div class="card auth-aside">
          <h2 class="auth-title">Welcome back</h2>
          <p class="auth-sub">Log in to access your WhatsApp AI dashboard and tools.</p>
          <ul>
            <li>Manage conversations and contacts</li>
            <li>Upload or update knowledge base</li>
            <li>Configure automations and bulk sends</li>
          </ul>
        </div>
        <div class="card auth-card">
          <div class="inner">
            <form method="post" action="/login">
              <label>Email</label>
              <div class="input-row"><input name="email" type="email" placeholder="you@company.com" required/></div>
              <label>Password</label>
              <div class="input-row pw-toggle">
                <input id="lpw" name="password" type="password" placeholder="••••••••" required/>
                <button id="lpwToggle" class="pw-toggle-btn" aria-label="Toggle password">Show</button>
              </div>
              <div class="actions">
                <button class="btn" type="submit">Login</button>
                <span class="muted">No account? <a href="/signup">Sign up</a></span>
              </div>
            </form>
          </div>
        </div>
      </div>
      <script>
        (function(){
          const pw = document.getElementById('lpw');
          const btn = document.getElementById('lpwToggle');
          if(pw && btn){
            btn.addEventListener('click', function(e){ e.preventDefault(); const t = pw.getAttribute('type')==='password' ? 'text' : 'password'; pw.setAttribute('type', t); btn.textContent = t==='password' ? 'Show' : 'Hide'; });
          }
        })();
      </script>
    </body></html>`);
  });

  router.post('/login', limiter, async (req, res) => {
    try {
      await ensureMongoConnection();
      const email = String(req.body.email || '').toLowerCase().trim();
      const password = String(req.body.password || '');
      const user = await User.findOne({ email });
      if (!user) return res.redirect('/login');
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return res.redirect('/login');
      const token = signToken({ id: user._id.toString(), email });
      res.cookie('auth', token, { httpOnly: true, sameSite: 'lax' });
      return res.redirect('/license');
    } catch (e) {
      console.error('Login error:', e.message);
      return res.redirect('/login');
    }
  });

  router.post('/logout', (req, res) => {
    res.clearCookie('auth');
    res.redirect('/');
  });

  router.get('/logout', (req, res) => {
    res.clearCookie('auth');
    res.redirect('/');
  });

  // Lead capture (public)
  router.post('/contact-lead', limiter, async (req, res) => {
    try {
      await ensureMongoConnection();
      const body = req.body || {};
      const lead = await Lead.create({
        name: String(body.name || '').slice(0, 120),
        email: String(body.email || '').toLowerCase().slice(0, 180),
        company: String(body.company || '').slice(0, 180),
        phone: String(body.phone || '').slice(0, 60),
        message: String(body.message || '').slice(0, 4000),
        monthlyConversations: Number(body.monthlyConversations || 0) || 0,
      });
      return res.json({ success: true, id: lead._id.toString() });
    } catch (e) {
      console.error('Lead save error:', e.message);
      return res.status(500).json({ success: false });
    }
  });

  // License entry page -> saves to Mongo and optionally binds
  router.get('/license', authMiddleware, async (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="/assets/style.css"/><title>License</title></head><body>
      <div class="container"><h1>Enter License Key</h1>
        <form class="card" method="post" action="/license">
          <label>License Key or buy one <a href="https://wa.me/201060098267">Contact us</a></label><input name="key" placeholder="ABC123-DEF456-GHI" required/>
          <button class="btn btn-success" type="submit">Activate</button>
        </form>
      </div>
    </body></html>`);
  });

  router.post('/license', limiter, authMiddleware, async (req, res) => {
    try {
      await ensureMongoConnection();
      const userId = req.user && req.user.id;
      const key = String(req.body.key || '').trim().toUpperCase();
      if (!key) return res.redirect('/license');
      // Save license record if not exists
      let lic = await License.findOne({ key });
      const defaultValid = new Date(Date.now() + 365*24*60*60*1000);
      if (!lic) {
        lic = await License.create({ userId, key, validUntil: defaultValid, singleUse: true, used: false, boundInstanceId: null });
      } else if (!lic.userId) {
        lic.userId = userId;
        await lic.save();
      }
      // Bind via local verifier if configured
      const { verifyLicense } = require('./license');
      try { await verifyLicense({ save: true }); } catch {}
      // Also persist key to config so existing flows work
      const { setConfig } = require('./config');
      setConfig({ licenseKey: key });
      return res.redirect('/dashboard');
    } catch (e) {
      console.error('License save error:', e.message);
      return res.redirect('/license');
    }
  });

  // Simple dashboard redirect so unauthenticated landing stays clean
  router.get('/dashboard', authMiddleware, (req, res) => {
    return res.redirect('/');
  });

  return { router, authMiddleware, ensureMongoConnection, User, License };
}

module.exports = { createAuthRouter, authMiddleware, ensureMongoConnection };



