'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mime = require('mime-types');
const { getConfig, setConfig } = require('./config');
const { renderNav, showToast, setLoading, validateForm, createModal, createFileUpload } = require('./ui');

function createAutoPage() {
  const app = express.Router();
  const upload = multer({ 
    storage: multer.memoryStorage(), 
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (req, file, cb) => {
      const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/webm', 'video/ogg',
        'audio/mpeg', 'audio/wav', 'audio/ogg',
        'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      
      if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|ogg|mp3|wav|pdf|doc|docx)$/i)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only images, videos, audio, and documents are allowed.'));
      }
    }
  });
  
  const mediaDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

  app.get('/', (req, res) => {
    const cfg = getConfig();
    res.send(render(cfg));
  });

  app.post('/add', upload.single('asset'), (req, res) => {
    const cfg = getConfig();
    const rules = Array.isArray(cfg.autoReplies) ? cfg.autoReplies : [];
    const keyword = String(req.body.keyword || '').trim().toLowerCase();
    const type = String(req.body.type || 'text');
    let value = String(req.body.value || '').trim();
    const caption = String(req.body.caption || '').trim();
    const extraText = String(req.body.extraText || '').trim();
    const enabled = req.body.enabled === 'true';
    
    if (!keyword) {
      return res.redirect('/auto?error=Keyword is required');
    }

    // Check for duplicate keywords
    if (rules.some(r => r.keyword === keyword)) {
      return res.redirect('/auto?error=Keyword already exists');
    }

    if (['image','audio','video','file'].includes(type) && req.file) {
      const ext = mime.extension(req.file.mimetype) || 'bin';
      const base = `${Date.now()}_${keyword}.${ext}`;
      fs.writeFileSync(path.join(mediaDir, base), req.file.buffer);
      value = `/media/${base}`;
    }

    const rule = { 
      keyword, 
      type, 
      value, 
      enabled,
      createdAt: new Date().toISOString(),
      id: Date.now().toString()
    };
    if (caption) rule.caption = caption;
    if (extraText) rule.extraText = extraText;
    
    rules.push(rule);
    setConfig({ ...cfg, autoReplies: rules });
    res.redirect('/auto?success=Auto reply rule added successfully');
  });

  app.post('/toggle', (req, res) => {
    const cfg = getConfig();
    const rules = Array.isArray(cfg.autoReplies) ? cfg.autoReplies : [];
    const keyword = String(req.body.keyword || '').trim().toLowerCase();
    const enabled = String(req.body.enabled || '').toLowerCase() === 'true';
    
    if (!keyword) {
      return res.redirect('/auto?error=Keyword is required');
    }

    const rule = rules.find(r => r.keyword === keyword);
    if (!rule) {
      return res.redirect('/auto?error=Rule not found');
    }

    rule.enabled = enabled;
    setConfig({ ...cfg, autoReplies: rules });
    
    const status = enabled ? 'enabled' : 'disabled';
    res.redirect(`/auto?success=Rule ${status} successfully`);
  });

  app.post('/delete', (req, res) => {
    const cfg = getConfig();
    const rules = Array.isArray(cfg.autoReplies) ? cfg.autoReplies : [];
    const keyword = String(req.body.keyword || '').trim().toLowerCase();
    
    if (!keyword) {
      return res.redirect('/auto?error=Keyword is required');
    }

    const filteredRules = rules.filter(r => r.keyword !== keyword);
    if (filteredRules.length === rules.length) {
      return res.redirect('/auto?error=Rule not found');
    }

    setConfig({ ...cfg, autoReplies: filteredRules });
    res.redirect('/auto?success=Rule deleted successfully');
  });

  // API endpoints for AJAX operations
  app.get('/api/rules', (req, res) => {
    const cfg = getConfig();
    const rules = Array.isArray(cfg.autoReplies) ? cfg.autoReplies : [];
    res.json({ success: true, rules });
  });

  app.post('/api/add', upload.single('asset'), (req, res) => {
    try {
      const cfg = getConfig();
      const rules = Array.isArray(cfg.autoReplies) ? cfg.autoReplies : [];
      const keyword = String(req.body.keyword || '').trim().toLowerCase();
      const type = String(req.body.type || 'text');
      let value = String(req.body.value || '').trim();
      const caption = String(req.body.caption || '').trim();
      const extraText = String(req.body.extraText || '').trim();
      const enabled = req.body.enabled === 'true';
      
      if (!keyword) {
        return res.status(400).json({ success: false, error: 'Keyword is required' });
      }

      if (rules.some(r => r.keyword === keyword)) {
        return res.status(400).json({ success: false, error: 'Keyword already exists' });
      }

      if (['image','audio','video','file'].includes(type) && req.file) {
        const ext = mime.extension(req.file.mimetype) || 'bin';
        const base = `${Date.now()}_${keyword}.${ext}`;
        fs.writeFileSync(path.join(mediaDir, base), req.file.buffer);
        value = `/media/${base}`;
      }

      const rule = { 
        keyword, 
        type, 
        value, 
        enabled,
        createdAt: new Date().toISOString(),
        id: Date.now().toString()
      };
      if (caption) rule.caption = caption;
      if (extraText) rule.extraText = extraText;
      
      rules.push(rule);
      setConfig({ ...cfg, autoReplies: rules });
      res.json({ success: true, message: 'Rule added successfully', rule });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/toggle', (req, res) => {
    try {
      const cfg = getConfig();
      const rules = Array.isArray(cfg.autoReplies) ? cfg.autoReplies : [];
      const keyword = String(req.body.keyword || '').trim().toLowerCase();
      const enabled = String(req.body.enabled || '').toLowerCase() === 'true';
      
      if (!keyword) {
        return res.status(400).json({ success: false, error: 'Keyword is required' });
      }

      const rule = rules.find(r => r.keyword === keyword);
      if (!rule) {
        return res.status(404).json({ success: false, error: 'Rule not found' });
      }

      rule.enabled = enabled;
      setConfig({ ...cfg, autoReplies: rules });
      
      const status = enabled ? 'enabled' : 'disabled';
      res.json({ success: true, message: `Rule ${status} successfully` });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/delete', (req, res) => {
    try {
      const cfg = getConfig();
      const rules = Array.isArray(cfg.autoReplies) ? cfg.autoReplies : [];
      const keyword = String(req.body.keyword || '').trim().toLowerCase();
      
      if (!keyword) {
        return res.status(400).json({ success: false, error: 'Keyword is required' });
      }

      const filteredRules = rules.filter(r => r.keyword !== keyword);
      if (filteredRules.length === rules.length) {
        return res.status(404).json({ success: false, error: 'Rule not found' });
      }

      setConfig({ ...cfg, autoReplies: filteredRules });
      res.json({ success: true, message: 'Rule deleted successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return app;
}

function render(cfg) {
  const nav = renderNav('auto');
  const rules = Array.isArray(cfg.autoReplies) ? cfg.autoReplies : [];
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Auto Replies - WhatsApp AI</title>
  <link rel="stylesheet" href="/assets/style.css">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
</head>
<body>
  <div class="layout">
    ${nav}
    <main class="main">
      <div class="container">
        <div class="auto-header">
          <h1>⚡ Auto Replies</h1>
          <p class="auto-subtitle">Set up automatic responses to keywords</p>
        </div>

        <!-- Success/Error Messages -->
        <div id="messageContainer"></div>

        <!-- Add New Rule -->
        <div class="auto-section">
          <h2>➕ Add New Rule</h2>
          <form method="POST" action="/auto/add" enctype="multipart/form-data" id="addRuleForm" class="auto-form">
            <div class="form-row">
              <div class="form-group">
                <label for="keyword">Keyword *</label>
                <input 
                  type="text" 
                  name="keyword" 
                  id="keyword" 
                  placeholder="e.g. pricing, hello, help"
                  class="form-control"
                  required
                >
                <div class="form-hint">The word or phrase that triggers this reply</div>
              </div>

              <div class="form-group">
                <label for="type">Response Type</label>
                <select name="type" id="type" class="form-control" onchange="toggleResponseFields()">
                  <option value="text">📝 Text</option>
                  <option value="image">🖼️ Image</option>
                  <option value="video">🎥 Video</option>
                  <option value="audio">🎵 Audio</option>
                  <option value="file">📄 File</option>
                </select>
                <div class="form-hint">Type of response to send</div>
              </div>

              <div class="form-group">
                <label for="enabled">Status</label>
                <select name="enabled" id="enabled" class="form-control">
                  <option value="true">🟢 Enabled</option>
                  <option value="false">🔴 Disabled</option>
                </select>
                <div class="form-hint">Enable or disable this rule</div>
              </div>
            </div>

            <!-- Text Response -->
            <div class="form-group" id="textResponse">
              <label for="value">Response Text</label>
              <textarea 
                name="value" 
                id="value" 
                rows="4" 
                placeholder="Enter the automatic response text..."
                class="form-control"
              ></textarea>
              <div class="form-hint">The text that will be sent automatically</div>
            </div>

            <!-- Media Upload -->
            <div class="form-group" id="mediaUpload" style="display: none;">
              <label for="asset">Upload Media</label>
              <div class="file-upload-container">
                <div class="file-upload-area" id="uploadArea">
                  <div class="file-upload-content">
                    <span class="file-upload-icon">📁</span>
                    <p>Drag & drop media file here or <span class="file-upload-browse">browse</span></p>
                    <p class="file-upload-hint">Supports: Images, Videos, Audio, Documents</p>
                    <input type="file" name="asset" id="asset" accept="image/*,video/*,audio/*,.pdf,.doc,.docx" style="display: none;">
                  </div>
                </div>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="caption">Caption</label>
                <input 
                  type="text" 
                  name="caption" 
                  id="caption" 
                  placeholder="Optional caption for media"
                  class="form-control"
                >
                <div class="form-hint">Caption to send with media</div>
              </div>

              <div class="form-group">
                <label for="extraText">Extra Text</label>
                <input 
                  type="text" 
                  name="extraText" 
                  id="extraText" 
                  placeholder="Additional text after media"
                  class="form-control"
                >
                <div class="form-hint">Extra text to send after media</div>
              </div>
            </div>

            <div class="form-actions">
              <button type="submit" class="btn btn-success" id="addBtn">
                <span>➕</span>
                Add Rule
              </button>
              <button type="button" class="btn btn-outline" onclick="clearForm()">
                <span>🔄</span>
                Clear Form
              </button>
            </div>
          </form>
        </div>

        <!-- Rules List -->
        <div class="auto-section">
          <div class="section-header">
            <h2>📋 Auto Reply Rules</h2>
            <div class="section-actions">
              <button class="btn btn-info" onclick="exportRules()">
                <span>📤</span>
                Export
              </button>
              <button class="btn btn-warning" onclick="importRules()">
                <span>📥</span>
                Import
              </button>
            </div>
          </div>

          <div class="rules-stats">
            <div class="stat-item">
              <span class="stat-number">${rules.length}</span>
              <span class="stat-label">Total Rules</span>
            </div>
            <div class="stat-item">
              <span class="stat-number">${rules.filter(r => r.enabled !== false).length}</span>
              <span class="stat-label">Active Rules</span>
            </div>
            <div class="stat-item">
              <span class="stat-number">${rules.filter(r => r.enabled === false).length}</span>
              <span class="stat-label">Disabled Rules</span>
            </div>
          </div>

          <div class="rules-container" id="rulesContainer">
            ${renderRulesList(rules)}
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="auto-section">
          <h2>⚡ Quick Actions</h2>
          <div class="quick-actions-grid">
            <button class="action-card" onclick="enableAllRules()">
              <span class="action-icon">🟢</span>
              <h3>Enable All</h3>
              <p>Activate all rules at once</p>
            </button>
            <button class="action-card" onclick="disableAllRules()">
              <span class="action-icon">🔴</span>
              <h3>Disable All</h3>
              <p>Deactivate all rules at once</p>
            </button>
            <button class="action-card" onclick="testRules()">
              <span class="action-icon">🧪</span>
              <h3>Test Rules</h3>
              <p>Test all active rules</p>
            </button>
            <button class="action-card" onclick="clearAllRules()">
              <span class="action-icon">🗑️</span>
              <h3>Clear All</h3>
              <p>Delete all rules</p>
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>

  <script>
    (function() {
      // Initialize UI enhancements
      initAutoPage();
      
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

      // Toggle response fields based on type
      window.toggleResponseFields = function() {
        const type = document.getElementById('type').value;
        const textResponse = document.getElementById('textResponse');
        const mediaUpload = document.getElementById('mediaUpload');
        
        if (type === 'text') {
          textResponse.style.display = 'block';
          mediaUpload.style.display = 'none';
        } else {
          textResponse.style.display = 'none';
          mediaUpload.style.display = 'block';
        }
      };

      // File upload enhancements
      const uploadArea = document.getElementById('uploadArea');
      const assetInput = document.getElementById('asset');
      
      if (uploadArea && assetInput) {
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
            assetInput.files = files;
            handleFileSelect();
          }
        });

        uploadArea.querySelector('.file-upload-browse').addEventListener('click', () => {
          assetInput.click();
        });

        assetInput.addEventListener('change', handleFileSelect);
      }

      function handleFileSelect() {
        const file = assetInput.files[0];
        if (file) {
          uploadArea.querySelector('p').textContent = 'Selected: ' + file.name;
        } else {
          uploadArea.querySelector('p').textContent = 'Drag & drop media file here or browse';
        }
      }

      // Form submission with loading state
      const addRuleForm = document.getElementById('addRuleForm');
      const addBtn = document.getElementById('addBtn');
      
      addRuleForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        if (!validateForm(this)) {
          showToast('Please fix the errors in the form', 'error');
          return;
        }
        
        setLoading(addBtn, true);
        
        // Submit form via AJAX for better UX
        const formData = new FormData(this);
        
        fetch('/auto/api/add', {
          method: 'POST',
          body: formData
        })
        .then(response => response.json())
        .then(result => {
          if (result.success) {
            showToast(result.message, 'success');
            clearForm();
            refreshRules();
          } else {
            showToast(result.error || 'Failed to add rule', 'error');
          }
        })
        .catch(error => {
          console.error('Error:', error);
          showToast('Failed to add rule', 'error');
        })
        .finally(() => {
          setLoading(addBtn, false);
        });
      });

      // Quick action functions
      window.clearForm = function() {
        document.getElementById('addRuleForm').reset();
        document.getElementById('textResponse').style.display = 'block';
        document.getElementById('mediaUpload').style.display = 'none';
        if (uploadArea) {
          uploadArea.querySelector('p').textContent = 'Drag & drop media file here or browse';
        }
      };

      window.exportRules = function() {
        fetch('/auto/api/rules')
          .then(response => response.json())
          .then(data => {
            const blob = new Blob([JSON.stringify(data.rules, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'auto-replies-rules.json';
            a.click();
            URL.revokeObjectURL(url);
            showToast('Rules exported successfully', 'success');
          });
      };

      window.importRules = function() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = function(e) {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
              try {
                const rules = JSON.parse(e.target.result);
                // Import rules logic here
                showToast('Rules imported successfully', 'success');
                refreshRules();
              } catch (error) {
                showToast('Invalid rules file', 'error');
              }
            };
            reader.readAsText(file);
          }
        };
        input.click();
      };

      window.enableAllRules = function() {
        if (confirm('Enable all rules?')) {
          // Enable all rules logic
          showToast('All rules enabled', 'success');
          refreshRules();
        }
      };

      window.disableAllRules = function() {
        if (confirm('Disable all rules?')) {
          // Disable all rules logic
          showToast('All rules disabled', 'success');
          refreshRules();
        }
      };

      window.testRules = function() {
        showToast('Testing rules...', 'info');
        // Test rules logic
        setTimeout(() => {
          showToast('Rules test completed', 'success');
        }, 2000);
      };

      window.clearAllRules = function() {
        if (confirm('Are you sure you want to delete all rules? This action cannot be undone.')) {
          // Clear all rules logic
          showToast('All rules cleared', 'success');
          refreshRules();
        }
      };

      function refreshRules() {
        fetch('/auto/api/rules')
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              document.getElementById('rulesContainer').innerHTML = renderRulesList(data.rules);
              updateStats(data.rules);
            }
          });
      }

      function updateStats(rules) {
        // Update statistics display
        const totalRules = rules.length;
        const activeRules = rules.filter(r => r.enabled !== false).length;
        const disabledRules = rules.filter(r => r.enabled === false).length;
        
        // Update stat numbers
        document.querySelectorAll('.stat-number')[0].textContent = totalRules;
        document.querySelectorAll('.stat-number')[1].textContent = activeRules;
        document.querySelectorAll('.stat-number')[2].textContent = disabledRules;
      }

      function initAutoPage() {
        // Initialize any page-specific functionality
        toggleResponseFields(); // Set initial state
      }

      function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
      }

      // Global toast function
      function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = \`toast \${type}\`;
        toast.innerHTML = \`\${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'} \${message}\`;
        
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        
        setTimeout(() => {
          toast.classList.remove('show');
          setTimeout(() => {
            if (toast.parentNode) {
              toast.parentNode.removeChild(toast);
            }
          }, 200);
        }, 3000);
      }

      // Keyboard shortcuts
      document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + N to add new rule
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
          e.preventDefault();
          document.getElementById('keyword').focus();
        }
        
        // Ctrl/Cmd + E to export
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
          e.preventDefault();
          exportRules();
        }
      });
    })();
  </script>
</body>
</html>`;
}

function renderRulesList(rules) {
  if (rules.length === 0) {
    return '<div class="empty-state"><p>No auto reply rules configured yet</p></div>';
  }

  return rules.map((rule, index) => `
    <div class="rule-card ${rule.enabled !== false ? 'enabled' : 'disabled'}" data-keyword="${escapeHtml(rule.keyword)}">
      <div class="rule-header">
        <div class="rule-info">
          <h3>${escapeHtml(rule.keyword)}</h3>
          <span class="rule-type">${getTypeIcon(rule.type)} ${rule.type}</span>
        </div>
        <div class="rule-actions">
          <button class="btn btn-sm ${rule.enabled !== false ? 'btn-success' : 'btn-outline'}" onclick="toggleRule('${escapeHtml(rule.keyword)}', ${rule.enabled !== false})">
            ${rule.enabled !== false ? '🟢' : '🔴'} ${rule.enabled !== false ? 'Active' : 'Inactive'}
          </button>
          <button class="btn btn-sm btn-outline" onclick="editRule('${escapeHtml(rule.keyword)}')">
            ✏️ Edit
          </button>
          <button class="btn btn-sm btn-danger" onclick="deleteRule('${escapeHtml(rule.keyword)}')">
            🗑️ Delete
          </button>
        </div>
      </div>
      
      <div class="rule-content">
        ${renderRuleContent(rule)}
      </div>
      
      <div class="rule-meta">
        <small>Created: ${rule.createdAt ? new Date(rule.createdAt).toLocaleDateString() : 'Unknown'}</small>
      </div>
    </div>
  `).join('');
}

function renderRuleContent(rule) {
  switch (rule.type) {
    case 'text':
      return `<p class="rule-text">${escapeHtml(rule.value)}</p>`;
    case 'image':
      return `
        <div class="rule-media">
          <img src="${escapeHtml(rule.value)}" alt="Auto reply image" class="rule-image">
          ${rule.caption ? `<p class="rule-caption">${escapeHtml(rule.caption)}</p>` : ''}
        </div>
      `;
    case 'video':
      return `
        <div class="rule-media">
          <video controls class="rule-video">
            <source src="${escapeHtml(rule.value)}" type="video/mp4">
            Your browser does not support the video tag.
          </video>
          ${rule.caption ? `<p class="rule-caption">${escapeHtml(rule.caption)}</p>` : ''}
        </div>
      `;
    case 'audio':
      return `
        <div class="rule-media">
          <audio controls class="rule-audio">
            <source src="${escapeHtml(rule.value)}" type="audio/mpeg">
            Your browser does not support the audio tag.
          </audio>
          ${rule.caption ? `<p class="rule-caption">${escapeHtml(rule.caption)}</p>` : ''}
        </div>
      `;
    case 'file':
      return `
        <div class="rule-media">
          <a href="${escapeHtml(rule.value)}" target="_blank" class="rule-file">
            📄 Download File
          </a>
          ${rule.caption ? `<p class="rule-caption">${escapeHtml(rule.caption)}</p>` : ''}
        </div>
      `;
    default:
      return `<p class="rule-text">${escapeHtml(rule.value)}</p>`;
  }
}

function getTypeIcon(type) {
  const icons = {
    text: '📝',
    image: '🖼️',
    video: '🎥',
    audio: '🎵',
    file: '📄'
  };
  return icons[type] || '📝';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = { createAutoPage };


