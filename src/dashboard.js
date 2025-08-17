'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const { getConfig, setConfig } = require('./config');
const multer = require('multer');
const { addPdf, addText, stats, statsBySource } = require('./kb');
const { notify } = require('./notify');
const { listContacts, getConversation, addNote, clearConversation, updateMessage } = require('./memory');
const mime = require('mime-types');
const { renderNav, showToast, setLoading, validateForm, createModal, createProgressBar, createDataTable } = require('./ui');

function createDashboardApp(opts = {}) {
  const client = opts.client || null;
  const getClient = typeof opts.getClient === 'function' ? opts.getClient : () => client;
  const app = express.Router();
  app.use(express.urlencoded({ extended: true }));

  app.get('/', (req, res) => {
    const cfg = getConfig();
    const kbStats = stats();
    const kbSources = statsBySource();
    const contacts = listContacts();
    const conversationsCount = contacts.length;
    const messagesTotal = contacts.reduce((acc, c) => acc + (c.count || 0), 0);
    const lastActivityTs = contacts.reduce((acc, c) => Math.max(acc, c.lastTs || 0), 0);
    const lastActivityIso = lastActivityTs ? new Date(lastActivityTs).toLocaleString() : '—';
    const autoRules = Array.isArray(cfg.autoReplies) ? cfg.autoReplies : [];
    const autoEnabled = autoRules.filter(r => r.enabled !== false).length;
    const storageSize = calculateStorageSize();
    const insights = {
      conversationsCount,
      messagesTotal,
      lastActivityIso,
      kbChunks: kbStats.chunks || 0,
      autoTotal: autoRules.length,
      autoEnabled,
      kbTopSources: kbSources.slice(0, 3),
      storageSize,
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    };
    res.send(renderForm(cfg, kbStats, contacts, insights));
  });

  app.post('/save', (req, res) => {
    const { systemPrompt, model, temperature, maxTokens } = req.body;
    const parsed = {
      systemPrompt: systemPrompt ?? '',
      model: model ?? 'gpt-4o-mini',
      temperature: clampFloat(temperature, 0, 2, 0.7),
      maxTokens: clampInt(maxTokens, 1, 4000, 300),
    };
    setConfig(parsed);
    notify({ title: 'Settings Updated', message: 'System prompt/model/params were updated via dashboard.' });
    res.redirect('/?success=Settings updated successfully');
  });

  // Enhanced file uploads with progress tracking
  const upload = multer({ 
    storage: multer.memoryStorage(), 
    limits: { fileSize: 50 * 1024 * 1024 }, // Increased to 50MB
    fileFilter: (req, file, cb) => {
      // Enhanced file type validation
      const allowedTypes = [
        'application/pdf',
        'text/plain',
        'text/csv',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/html'
      ];
      
      if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(pdf|txt|csv|docx|xlsx|html)$/i)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only PDF, TXT, CSV, DOCX, XLSX, and HTML files are allowed.'));
      }
    }
  });

  app.post('/kb/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.redirect('/?error=No file selected');
    }
    
    try {
      const lower = (req.file.originalname || '').toLowerCase();
      let result;
      
      if (lower.endsWith('.pdf')) {
        result = await addPdf(req.file.buffer, req.file.originalname);
      } else if (lower.endsWith('.txt')) {
        result = await addText(req.file.buffer, req.file.originalname);
      } else if (lower.endsWith('.csv')) {
        result = await addText(req.file.buffer, req.file.originalname);
      } else if (lower.endsWith('.docx')) {
        result = await addText(req.file.buffer, req.file.originalname);
      } else if (lower.endsWith('.xlsx')) {
        result = await addText(req.file.buffer, req.file.originalname);
      } else if (lower.endsWith('.html')) {
        result = await addText(req.file.buffer, req.file.originalname);
      }
      
      await notify({ title: 'KB Updated', message: `Uploaded: ${req.file.originalname}` });
      res.redirect(`/?success=File uploaded successfully: ${req.file.originalname}`);
    } catch (e) {
      console.error('KB upload error:', e.message);
      res.redirect(`/?error=Upload failed: ${e.message}`);
    }
  });

  // Static serve for uploaded media with caching
  const mediaDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
  
  app.get('/media/:name', (req, res) => {
    const file = path.join(mediaDir, path.basename(req.params.name));
    if (!fs.existsSync(file)) return res.sendStatus(404);
    
    const type = mime.lookup(file) || 'application/octet-stream';
    const stats = fs.statSync(file);
    
    // Add caching headers
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
    res.setHeader('ETag', `"${stats.size}-${stats.mtime.getTime()}"`);
    res.setHeader('Last-Modified', stats.mtime.toUTCString());
    
    // Check if file hasn't changed
    const ifNoneMatch = req.headers['if-none-match'];
    const ifModifiedSince = req.headers['if-modified-since'];
    
    if (ifNoneMatch === `"${stats.size}-${stats.mtime.getTime()}"` || 
        (ifModifiedSince && new Date(ifModifiedSince) >= stats.mtime)) {
      return res.sendStatus(304);
    }
    
    fs.createReadStream(file).pipe(res);
  });

  // Enhanced Auto Replies management
  app.post('/autoreplies/add', upload.single('asset'), (req, res) => {
    const cfg = getConfig();
    const rules = Array.isArray(cfg.autoReplies) ? cfg.autoReplies : [];
    const keyword = String(req.body.keyword || '').trim().toLowerCase();
    const type = String(req.body.type || 'text');
    let value = String(req.body.value || '').trim();
    const caption = String(req.body.caption || '').trim();
    const extraText = String(req.body.extraText || '').trim();
    const enabled = req.body.enabled === 'true';
    
    if (!keyword) {
      return res.redirect('/?error=Keyword is required');
    }

    // Check for duplicate keywords
    if (rules.some(r => r.keyword === keyword)) {
      return res.redirect('/?error=Keyword already exists');
    }

    if (['image', 'audio', 'video', 'file'].includes(type) && req.file) {
      const ext = mime.extension(req.file.mimetype) || 'bin';
      const base = `${Date.now()}_${keyword}.${ext}`;
      const filePath = path.join(mediaDir, base);
      fs.writeFileSync(filePath, req.file.buffer);
      value = `/media/${base}`;
    }

    const newRule = {
      keyword,
      type,
      value,
      caption,
      extraText,
      enabled,
      createdAt: new Date().toISOString(),
      id: Date.now().toString()
    };

    rules.push(newRule);
    setConfig({ ...cfg, autoReplies: rules });
    notify({ title: 'Auto Reply Added', message: `Added rule for keyword: ${keyword}` });
    res.redirect('/?success=Auto reply rule added successfully');
  });

  app.post('/autoreplies/delete', (req, res) => {
    const cfg = getConfig();
    const rules = Array.isArray(cfg.autoReplies) ? cfg.autoReplies : [];
    const keyword = String(req.body.keyword || '').trim().toLowerCase();
    
    if (!keyword) {
      return res.redirect('/?error=Keyword is required');
    }

    const filteredRules = rules.filter(r => r.keyword !== keyword);
    if (filteredRules.length === rules.length) {
      return res.redirect('/?error=Rule not found');
    }

    setConfig({ ...cfg, autoReplies: filteredRules });
    notify({ title: 'Auto Reply Deleted', message: `Deleted rule for keyword: ${keyword}` });
    res.redirect('/?success=Auto reply rule deleted successfully');
  });

  app.post('/autoreplies/toggle', (req, res) => {
    const cfg = getConfig();
    const rules = Array.isArray(cfg.autoReplies) ? cfg.autoReplies : [];
    const keyword = String(req.body.keyword || '').trim().toLowerCase();
    
    if (!keyword) {
      return res.redirect('/?error=Keyword is required');
    }

    const rule = rules.find(r => r.keyword === keyword);
    if (!rule) {
      return res.redirect('/?error=Rule not found');
    }

    rule.enabled = !rule.enabled;
    setConfig({ ...cfg, autoReplies: rules });
    
    const status = rule.enabled ? 'enabled' : 'disabled';
    notify({ title: 'Auto Reply Updated', message: `Rule ${status}: ${keyword}` });
    res.redirect(`/?success=Auto reply rule ${status} successfully`);
  });

  // Enhanced conversation management
  app.get('/conversation/:id', (req, res) => {
    const conversation = getConversation(req.params.id);
    if (!conversation) {
      return res.status(404).send('Conversation not found');
    }
    
    res.json({
      success: true,
      conversation: conversation.messages,
      contact: conversation.contact
    });
  });

  app.post('/conversation/:id/note', (req, res) => {
    const { note } = req.body;
    if (!note || !note.trim()) {
      return res.status(400).json({ success: false, error: 'Note is required' });
    }
    
    try {
      addNote(req.params.id, note.trim());
      res.json({ success: true, message: 'Note added successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/conversation/:id/clear', (req, res) => {
    try {
      clearConversation(req.params.id);
      res.json({ success: true, message: 'Conversation cleared successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Enhanced API endpoints for AJAX requests
  app.get('/api/stats', (req, res) => {
    const kbStats = stats();
    const kbSources = statsBySource();
    const contacts = listContacts();
    const conversationsCount = contacts.length;
    const messagesTotal = contacts.reduce((acc, c) => acc + (c.count || 0), 0);
    const lastActivityTs = contacts.reduce((acc, c) => Math.max(acc, c.lastTs || 0), 0);
    const lastActivityIso = lastActivityTs ? new Date(lastActivityTs).toLocaleString() : '—';
    const autoRules = Array.isArray(getConfig().autoReplies) ? getConfig().autoReplies : [];
    const autoEnabled = autoRules.filter(r => r.enabled !== false).length;
    const storageSize = calculateStorageSize();
    
    res.json({
      success: true,
      stats: {
        conversationsCount,
        messagesTotal,
        lastActivityIso,
        kbChunks: kbStats.chunks || 0,
        autoTotal: autoRules.length,
        autoEnabled,
        kbTopSources: kbSources.slice(0, 3),
        storageSize,
        openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      }
    });
  });

  app.get('/api/contacts', (req, res) => {
    const contacts = listContacts();
    res.json({
      success: true,
      contacts: contacts.map(contact => ({
        ...contact,
        lastActivity: contact.lastTs ? new Date(contact.lastTs).toLocaleString() : '—',
        avatar: contact.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name || contact.id)}&background=random`
      }))
    });
  });

  app.get('/api/autoreplies', (req, res) => {
    const autoRules = Array.isArray(getConfig().autoReplies) ? getConfig().autoReplies : [];
    res.json({
      success: true,
      rules: autoRules
    });
  });

  return app;
}

function renderForm(cfg, kbStats, contacts, insights) {
  const nav = renderNav('dashboard');
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard - WhatsApp AI</title>
  <link rel="stylesheet" href="/assets/style.css">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🤖</text></svg>">
</head>
<body>
  <div class="layout">
    ${nav}
    <main class="main">
      <div class="container">
        <div class="dashboard-header">
          <h1>🤖 Dashboard</h1>
          <p class="dashboard-subtitle">Welcome to your WhatsApp AI assistant</p>
        </div>

        <!-- Success/Error Messages -->
        <div id="messageContainer"></div>

        <!-- Stats Overview -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon">💬</div>
            <div class="stat-content">
              <h3>${insights.conversationsCount}</h3>
              <p>Conversations</p>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">📨</div>
            <div class="stat-content">
              <h3>${insights.messagesTotal}</h3>
              <p>Total Messages</p>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">🧠</div>
            <div class="stat-content">
              <h3>${insights.kbChunks}</h3>
              <p>KB Chunks</p>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">⚡</div>
            <div class="stat-content">
              <h3>${insights.autoEnabled}/${insights.autoTotal}</h3>
              <p>Auto Replies</p>
            </div>
          </div>
        </div>

        <!-- WhatsApp Status -->
        <div class="whatsapp-status-section">
          <h2>📱 WhatsApp Status</h2>
          <div id="whatsappStatus" class="status-card">
            <div class="status-content">
              <div class="status-indicator">
                <span id="statusIcon">⏳</span>
                <span id="statusText">Loading...</span>
              </div>
              <div id="profileInfo" class="profile-info">
                <strong>Profile:</strong> <span id="profileName">Loading...</span>
              </div>
              <div id="qrCodeContainer" class="qr-container" style="display: none;">
                <h4>Scan QR Code to Connect</h4>
                <img id="qrCodeImage" alt="QR Code" style="max-width: 200px;">
                <p class="qr-instructions">Open WhatsApp on your phone and scan this QR code</p>
              </div>
            </div>
            <div class="status-actions">
              <button class="btn btn-outline" onclick="refreshWhatsAppStatus()">
                <span>🔄</span>
                Refresh Status
              </button>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="quick-actions">
          <h2>Quick Actions</h2>
          <div class="action-buttons">
            <button class="btn btn-success" onclick="location.href='/kb'">
              <span>📄</span>
              Knowledge Base
            </button>
            <button class="btn btn-info" onclick="location.href='/auto'">
              <span>⚡</span>
              Auto Replies
            </button>
            <button class="btn btn-warning" onclick="location.href='/convos'">
              <span>💬</span>
              Conversations
            </button>
            <button class="btn btn-outline" onclick="location.href='/settings'">
              <span>⚙️</span>
              Settings
            </button>
          </div>
        </div>

        <!-- Settings Form -->
        <div class="settings-section">
          <h2>AI Configuration</h2>
          <form method="POST" action="/save" id="settingsForm">
            <div class="row">
              <div>
                <label for="model">Model</label>
                <select name="model" id="model" required>
                  <option value="gpt-4o-mini" ${cfg.model === 'gpt-4o-mini' ? 'selected' : ''}>GPT-4o Mini (Fast & Cheap)</option>
                  <option value="gpt-4o" ${cfg.model === 'gpt-4o' ? 'selected' : ''}>GPT-4o (Best Quality)</option>
                  <option value="gpt-3.5-turbo" ${cfg.model === 'gpt-3.5-turbo' ? 'selected' : ''}>GPT-3.5 Turbo (Legacy)</option>
                </select>
              </div>
              <div>
                <label for="temperature">Temperature</label>
                <input type="range" name="temperature" id="temperature" min="0" max="2" step="0.1" value="${cfg.temperature || 0.7}" oninput="updateTemperatureValue(this.value)">
                <span id="temperatureValue">${cfg.temperature || 0.7}</span>
              </div>
            </div>
            <div class="row">
              <div>
                <label for="maxTokens">Max Tokens</label>
                <input type="number" name="maxTokens" id="maxTokens" min="1" max="4000" value="${cfg.maxTokens || 300}" required>
              </div>
              <div>
                <label for="systemPrompt">System Prompt</label>
                <textarea name="systemPrompt" id="systemPrompt" rows="4" placeholder="You are a helpful WhatsApp assistant...">${cfg.systemPrompt || ''}</textarea>
              </div>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-success" id="saveBtn">
                <span>💾</span>
                Save Settings
              </button>
            </div>
          </form>
        </div>

        <!-- Knowledge Base Upload -->
        <div class="upload-section">
          <h2>Upload to Knowledge Base</h2>
          <form method="POST" action="/kb/upload" enctype="multipart/form-data" id="uploadForm">
            <div class="file-upload-container">
              <div class="file-upload-area" id="uploadArea">
                <div class="file-upload-content">
                  <span class="file-upload-icon">📁</span>
                  <p>Drag & drop files here or <span class="file-upload-browse">browse</span></p>
                  <p class="file-upload-hint">Supports: PDF, TXT, CSV, DOCX, XLSX, HTML</p>
                  <input type="file" name="file" id="fileInput" accept=".pdf,.txt,.csv,.docx,.xlsx,.html" style="display: none;">
                </div>
              </div>
              <div class="upload-progress" id="uploadProgress" style="display: none;">
                <div class="progress">
                  <div class="progress-bar" id="progressBar"></div>
                </div>
                <p id="uploadStatus">Uploading...</p>
              </div>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-info" id="uploadBtn" disabled>
                <span>📤</span>
                Upload File
              </button>
            </div>
          </form>
        </div>

        <!-- Recent Contacts -->
        <div class="contacts-section">
          <h2>Recent Contacts</h2>
          <div class="contacts-grid" id="contactsGrid">
            ${renderContactsGrid(contacts.slice(0, 6))}
          </div>
          ${contacts.length > 6 ? '<div class="text-center mt-16"><a href="/convos" class="btn btn-outline">View All Contacts</a></div>' : ''}
        </div>

        <!-- Auto Replies Summary -->
        <div class="autoreplies-section">
          <h2>Auto Replies Summary</h2>
          <div class="autoreplies-grid" id="autorepliesGrid">
            ${renderAutoRepliesGrid(getConfig().autoReplies || [])}
          </div>
          <div class="text-center mt-16">
            <a href="/auto" class="btn btn-outline">Manage Auto Replies</a>
          </div>
        </div>
      </div>
    </main>
  </div>

  <script>
    // Initialize UI enhancements
    (function() {
      // Handle URL parameters for success/error messages
      const urlParams = new URLSearchParams(window.location.search);
      const successMsg = urlParams.get('success');
      const errorMsg = urlParams.get('error');
      const messageContainer = document.getElementById('messageContainer');
      
      if (successMsg) {
        messageContainer.innerHTML = '<div class="alert alert-success">✅ ' + escapeHtml(successMsg) + '</div>';
      } else if (errorMsg) {
        messageContainer.innerHTML = '<div class="alert alert-error">❌ ' + escapeHtml(errorMsg) + '</div>';
      }

      // Temperature slider
      function updateTemperatureValue(value) {
        document.getElementById('temperatureValue').textContent = value;
      }

      // File upload enhancements
      const uploadArea = document.getElementById('uploadArea');
      const fileInput = document.getElementById('fileInput');
      const uploadBtn = document.getElementById('uploadBtn');
      const uploadProgress = document.getElementById('uploadProgress');
      const progressBar = document.getElementById('progressBar');
      const uploadStatus = document.getElementById('uploadStatus');

      // Drag & drop
      uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
      });

      uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
      });

      uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          fileInput.files = files;
          handleFileSelect();
        }
      });

      // Click to browse
      uploadArea.querySelector('.file-upload-browse').addEventListener('click', () => {
        fileInput.click();
      });

      fileInput.addEventListener('change', handleFileSelect);

      function handleFileSelect() {
        const file = fileInput.files[0];
        if (file) {
          uploadBtn.disabled = false;
          uploadArea.querySelector('p').textContent = 'Selected: ' + file.name;
        } else {
          uploadBtn.disabled = true;
          uploadArea.querySelector('p').textContent = 'Drag & drop files here or browse';
        }
      }

      // Form submission with loading state
      const settingsForm = document.getElementById('settingsForm');
      const saveBtn = document.getElementById('saveBtn');

      settingsForm.addEventListener('submit', () => {
        saveBtn.classList.add('loading');
        saveBtn.textContent = 'Saving...';
      });

      // Upload form with progress
      const uploadForm = document.getElementById('uploadForm');
      uploadForm.addEventListener('submit', () => {
        uploadBtn.classList.add('loading');
        uploadBtn.textContent = 'Uploading...';
        uploadProgress.style.display = 'block';
        
        // Simulate progress (in real app, use XMLHttpRequest for actual progress)
        let progress = 0;
        const interval = setInterval(() => {
          progress += Math.random() * 20;
          if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
          }
          progressBar.style.width = progress + '%';
          uploadStatus.textContent = 'Uploading... ' + Math.round(progress) + '%';
        }, 200);
      });

      // Real-time stats updates
      function updateStats() {
        fetch('/api/stats')
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              // Update stats in real-time
              const stats = data.stats;
              // You can update specific elements here
            }
          })
          .catch(error => console.error('Error updating stats:', error));
      }

      // Update stats every 30 seconds
      setInterval(updateStats, 30000);

      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + S to save settings
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
          if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            settingsForm.requestSubmit();
          }
        }
      });

      function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
      }

      // WhatsApp Status Management
      function updateWhatsAppStatus() {
        fetch('/status/whatsapp')
          .then(response => response.json())
          .then(data => {
            const statusIcon = document.getElementById('statusIcon');
            const statusText = document.getElementById('statusText');
            const profileName = document.getElementById('profileName');
            const qrCodeContainer = document.getElementById('qrCodeContainer');
            const qrCodeImage = document.getElementById('qrCodeImage');
            const statusCard = document.getElementById('whatsappStatus');

            // Update profile name
            profileName.textContent = data.profile || 'default';

            // Update status based on connection state
            switch (data.status) {
              case 'ready':
                statusIcon.textContent = '✅';
                statusText.textContent = 'Connected';
                statusCard.className = 'status-card connected';
                qrCodeContainer.style.display = 'none';
                break;
              case 'authenticated':
                statusIcon.textContent = '🔐';
                statusText.textContent = 'Authenticated';
                statusCard.className = 'status-card authenticated';
                qrCodeContainer.style.display = 'none';
                break;
              case 'qr':
                statusIcon.textContent = '📱';
                statusText.textContent = 'QR Code Available';
                statusCard.className = 'status-card qr';
                qrCodeContainer.style.display = 'block';
                if (data.qrDataUrl) {
                  qrCodeImage.src = data.qrDataUrl;
                } else {
                  // Show a placeholder or message
                  qrCodeImage.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjNGNEY2Ii8+Cjx0ZXh0IHg9IjEwMCIgeT0iMTAwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM2Qjc0OEIiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5RUiBDb2RlIExvYWRpbmcuLi48L3RleHQ+Cjwvc3ZnPgo=';
                }
                break;
              case 'disconnected':
                statusIcon.textContent = '❌';
                statusText.textContent = 'Disconnected';
                statusCard.className = 'status-card disconnected';
                qrCodeContainer.style.display = 'none';
                break;
              case 'restarting':
                statusIcon.textContent = '🔄';
                statusText.textContent = 'Restarting...';
                statusCard.className = 'status-card restarting';
                qrCodeContainer.style.display = 'none';
                break;
              default:
                statusIcon.textContent = '⏳';
                statusText.textContent = 'Starting...';
                statusCard.className = 'status-card starting';
                qrCodeContainer.style.display = 'none';
            }
          })
          .catch(error => {
            console.error('Error fetching WhatsApp status:', error);
            const statusIcon = document.getElementById('statusIcon');
            const statusText = document.getElementById('statusText');
            statusIcon.textContent = '❌';
            statusText.textContent = 'Status Error';
          });
      }

      // Refresh WhatsApp status
      window.refreshWhatsAppStatus = function() {
        updateWhatsAppStatus();
      };



      // Initial status update
      updateWhatsAppStatus();

      // Update status every 5 seconds
      setInterval(updateWhatsAppStatus, 5000);
    })();
  </script>
</body>
</html>`;
}

function renderContactsGrid(contacts) {
  if (contacts.length === 0) {
    return '<div class="empty-state"><p>No conversations yet</p></div>';
  }

  return contacts.map(contact => `
    <div class="contact-card" onclick="location.href='/convos'">
      <div class="contact-avatar">
        <img src="${contact.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name || contact.id)}&background=random`}" alt="${contact.name || contact.id}">
      </div>
      <div class="contact-info">
        <h4>${contact.name || contact.id}</h4>
        <p>${contact.count || 0} messages</p>
        <small>${contact.lastTs ? new Date(contact.lastTs).toLocaleDateString() : '—'}</small>
      </div>
    </div>
  `).join('');
}

function renderAutoRepliesGrid(rules) {
  if (rules.length === 0) {
    return '<div class="empty-state"><p>No auto reply rules configured</p></div>';
  }

  return rules.slice(0, 4).map(rule => `
    <div class="rule-card ${rule.enabled ? 'enabled' : 'disabled'}">
      <div class="rule-header">
        <h4>${rule.keyword}</h4>
        <span class="badge ${rule.enabled ? 'badge-success' : 'badge-warning'}">
          ${rule.enabled ? 'Active' : 'Inactive'}
        </span>
      </div>
      <p>${rule.type}: ${rule.value.substring(0, 50)}${rule.value.length > 50 ? '...' : ''}</p>
    </div>
  `).join('');
}

function calculateStorageSize() {
  try {
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) return '0 MB';
    
    const files = fs.readdirSync(uploadsDir);
    let totalSize = 0;
    
    files.forEach(file => {
      const filePath = path.join(uploadsDir, file);
      const stats = fs.statSync(filePath);
      totalSize += stats.size;
    });
    
    return formatBytes(totalSize);
  } catch (error) {
    return '0 MB';
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function clampFloat(value, min, max, defaultValue) {
  const parsed = parseFloat(value);
  if (isNaN(parsed)) return defaultValue;
  return Math.max(min, Math.min(max, parsed));
}

function clampInt(value, min, max, defaultValue) {
  const parsed = parseInt(value);
  if (isNaN(parsed)) return defaultValue;
  return Math.max(min, Math.min(max, parsed));
}

module.exports = { createDashboardApp };


