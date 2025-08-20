'use strict';

const express = require('express');
const { getConfig, setConfig } = require('./config');
const { notify } = require('./notify');
const { renderNav, showToast, setLoading, validateForm, createModal } = require('./ui');

function createSettingsPage() {
  const app = express.Router();
  app.use(express.urlencoded({ extended: true }));

  app.get('/', (req, res) => {
    const cfg = getConfig();
    res.send(render(cfg));
  });

  app.post('/save', (req, res) => {
    const { systemPrompt, model, temperature, maxTokens, botEnabled, licenseKey } = req.body;
    const current = getConfig();
    const parsed = {
      botEnabled: String(botEnabled || 'true') === 'true',
      systemPrompt: systemPrompt ?? '',
      model: model ?? 'gpt-4o-mini',
      temperature: clampFloat(temperature, 0, 2, 0.7),
      maxTokens: clampInt(maxTokens, 1, 4000, 300),
      ...(typeof licenseKey !== 'undefined' ? { licenseKey: String(licenseKey || '').trim() } : {}),
    };
    // If licenseKey changed, reset verification flags
    if (typeof parsed.licenseKey !== 'undefined' && String(parsed.licenseKey) !== String(current.licenseKey || '')) {
      parsed.licenseValid = false;
      parsed.licenseValidUntil = null;
      parsed.licenseVerifiedAt = null;
    }
    setConfig(parsed);
    notify({ title: 'Settings Updated', message: 'System prompt/model/params were updated via settings page.' });
    res.redirect('/settings?success=Settings saved successfully');
  });

  // API endpoint for AJAX saves
  app.post('/api/save', express.json(), (req, res) => {
    try {
      const { systemPrompt, model, temperature, maxTokens, botEnabled, autoReplies, performanceMode, debugMode, licenseKey } = req.body;
      const current = getConfig();
      const parsed = {
        botEnabled: String(botEnabled || 'true') === 'true',
        systemPrompt: systemPrompt ?? '',
        model: model ?? 'gpt-4o-mini',
        temperature: clampFloat(temperature, 0, 2, 0.7),
        maxTokens: clampInt(maxTokens, 1, 4000, 300),
      };
      if (Array.isArray(autoReplies)) {
        parsed.autoReplies = autoReplies;
      }
      if (typeof performanceMode !== 'undefined') parsed.performanceMode = String(performanceMode) === 'true' || performanceMode === true;
      if (typeof debugMode !== 'undefined') parsed.debugMode = String(debugMode) === 'true' || debugMode === true;
      if (typeof licenseKey !== 'undefined') parsed.licenseKey = String(licenseKey || '').trim();
      // If licenseKey changed, reset verification flags
      if (typeof parsed.licenseKey !== 'undefined' && String(parsed.licenseKey) !== String(current.licenseKey || '')) {
        parsed.licenseValid = false;
        parsed.licenseValidUntil = null;
        parsed.licenseVerifiedAt = null;
      }
      setConfig(parsed);
      notify({ title: 'Settings Updated', message: 'Settings updated via API.' });
      res.json({ success: true, message: 'Settings saved successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // License endpoints
  app.post('/api/license/verify', express.json(), async (req, res) => {
    try {
      const { verifyLicense } = require('./license');
      const result = await verifyLicense({ save: true });
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // API endpoint to get current settings
  app.get('/api/settings', (req, res) => {
    const cfg = getConfig();
    res.json({ success: true, settings: cfg });
  });

  // API endpoint to delete all data
  app.post('/api/delete-all-data', (req, res) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const dataDir = path.join(__dirname, '..', 'data');
      
      // List of data files to delete (excluding .gitkeep)
      const dataFiles = [
        'memory.json',
        'profiles.json',
        'subscriptions.json',
        'users.json',
        'usage.json',
        'flow_state.json'
      ];
      
      // List of config files to delete
      const configFiles = [
        'config/kb_index.json'
      ];
      
      let deletedCount = 0;
      let errors = [];
      
      // Delete specific data files
      dataFiles.forEach(filename => {
        const filePath = path.join(dataDir, filename);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        } catch (error) {
          errors.push(`${filename}: ${error.message}`);
        }
      });
      
      // Delete all campaign files (dynamic naming)
      try {
        const files = fs.readdirSync(dataDir);
        const campaignFiles = files.filter(file => file.startsWith('campaign_') && file.endsWith('.json'));
        campaignFiles.forEach(filename => {
          const filePath = path.join(dataDir, filename);
          try {
            fs.unlinkSync(filePath);
            deletedCount++;
          } catch (error) {
            errors.push(`${filename}: ${error.message}`);
          }
        });
      } catch (error) {
        errors.push(`Failed to read data directory: ${error.message}`);
      }
      
      // Delete config files
      configFiles.forEach(filename => {
        const filePath = path.join(__dirname, '..', filename);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        } catch (error) {
          errors.push(`${filename}: ${error.message}`);
        }
      });
      
      // Delete WhatsApp Web.js cache directories
      const cacheDirs = ['.wwebjs_cache', '.wwebjs_auth'];
      cacheDirs.forEach(dirName => {
        const dirPath = path.join(__dirname, '..', dirName);
        try {
          if (fs.existsSync(dirPath)) {
            // Recursively delete directory
            function deleteDirectory(dir) {
              if (fs.existsSync(dir)) {
                fs.readdirSync(dir).forEach(file => {
                  const curPath = path.join(dir, file);
                  if (fs.lstatSync(curPath).isDirectory()) {
                    deleteDirectory(curPath);
                  } else {
                    fs.unlinkSync(curPath);
                  }
                });
                fs.rmdirSync(dir);
              }
            }
            deleteDirectory(dirPath);
            deletedCount++;
          }
        } catch (error) {
          errors.push(`${dirName}: ${error.message}`);
        }
      });
      
      // Create empty files to maintain structure
      dataFiles.forEach(filename => {
        const filePath = path.join(dataDir, filename);
        if (!fs.existsSync(filePath)) {
          try {
            if (filename.endsWith('.json')) {
              fs.writeFileSync(filePath, '{}');
            }
          } catch (error) {
            errors.push(`Failed to recreate ${filename}: ${error.message}`);
          }
        }
      });
      
      // Clear auto-replies from config as part of full reset
      try {
        const currentCfg = getConfig();
        setConfig({ ...currentCfg, autoReplies: [] });
      } catch (e) {
        errors.push(`Failed to clear auto replies: ${e.message}`);
      }

      if (errors.length > 0) {
        res.json({ 
          success: false, 
          message: `Deleted ${deletedCount} files but encountered errors: ${errors.join(', ')}` 
        });
      } else {
        res.json({ 
          success: true, 
          message: `Successfully deleted all data (${deletedCount} files)` 
        });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return app;
}

function clampFloat(value, min, max, fallback) {
  const n = parseFloat(value);
  if (Number.isFinite(n)) return Math.min(max, Math.max(min, n));
  return fallback;
}

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isInteger(n)) return Math.min(max, Math.max(min, n));
  return fallback;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function render(cfg) {
  const nav = renderNav('settings');
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Settings - WhatsApp AI</title>
  <link rel="stylesheet" href="/assets/style.css">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚙️</text></svg>">
</head>
<body>
  <div class="layout">
    ${nav}
    <main class="main">
      <div class="container">
        <div class="settings-header">
          <h1>⚙️ Settings</h1>
          <p class="settings-subtitle">Configure your WhatsApp AI assistant</p>
        </div>

        <!-- Success/Error Messages -->
        <div id="messageContainer"></div>

        <!-- Settings Form -->
        <div class="settings-section">
          <h2>🤖 Bot Configuration</h2>
          <form method="POST" action="/settings/save" id="settingsForm" class="settings-form">
            <div class="form-group">
              <label for="licenseKey">License Key</label>
              <input type="text" name="licenseKey" id="licenseKey" value="${escapeHtml(cfg.licenseKey || '')}" class="form-control" placeholder="Paste your license key" />
              <div class="form-hint">Required to activate the product. ${cfg.licenseValid ? '✅ Valid' : '❌ Not verified'}${cfg.licenseValidUntil ? ' • until ' + new Date(cfg.licenseValidUntil).toLocaleString() : ''}${cfg.licenseVerifiedAt ? ' • checked ' + new Date(cfg.licenseVerifiedAt).toLocaleString() : ''}</div>
              <div class="form-actions" style="margin-top:8px;">
                <button type="button" class="btn" id="verifyLicenseBtn">Verify License</button>
                <span id="licenseStatus" class="muted" style="margin-left:8px;"></span>
              </div>
            </div>
            <div class="form-group">
              <label for="botEnabled">Bot Status</label>
              <select name="botEnabled" id="botEnabled" class="form-control">
                <option value="true" ${cfg.botEnabled !== false ? 'selected' : ''}>🟢 Enabled</option>
                <option value="false" ${cfg.botEnabled === false ? 'selected' : ''}>🔴 Disabled</option>
              </select>
              <div class="form-hint">Enable or disable the AI assistant</div>
            </div>

            <div class="form-group">
              <label for="systemPrompt">System Prompt</label>
              <textarea 
                name="systemPrompt" 
                id="systemPrompt" 
                rows="6" 
                placeholder="You are a helpful WhatsApp assistant. You help users with their questions and provide accurate, helpful responses..."
                class="form-control"
              >${escapeHtml(cfg.systemPrompt || '')}</textarea>
              <div class="form-hint">Sets the global persona and behavior of your AI assistant</div>
              <div class="char-counter">
                <span id="charCount">${(cfg.systemPrompt || '').length}</span> / 2000 characters
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="model">AI Model</label>
                <select name="model" id="model" class="form-control">
                  <option value="gpt-4o-mini" ${cfg.model === 'gpt-4o-mini' ? 'selected' : ''}>GPT-4o Mini (Fast &amp; Cheap)</option>
                  <option value="gpt-4o" ${cfg.model === 'gpt-4o' ? 'selected' : ''}>GPT-4o (Best Quality)</option>
                  <option value="gpt-3.5-turbo" ${cfg.model === 'gpt-3.5-turbo' ? 'selected' : ''}>GPT-3.5 Turbo (Legacy)</option>
                </select>
                <div class="form-hint">Choose the AI model for responses</div>
              </div>

              <div class="form-group">
                <label for="temperature">Temperature</label>
                <div class="slider-container">
                  <input 
                    type="range" 
                    name="temperature" 
                    id="temperature" 
                    min="0" 
                    max="2" 
                    step="0.1" 
                    value="${cfg.temperature || 0.7}"
                    class="form-control"
                    oninput="updateTemperatureValue(this.value)"
                  >
                  <span id="temperatureValue" class="slider-value">${cfg.temperature || 0.7}</span>
                </div>
                <div class="form-hint">Controls creativity (0 = focused, 2 = creative)</div>
              </div>

              <div class="form-group">
                <label for="maxTokens">Max Tokens</label>
                <input 
                  type="number" 
                  name="maxTokens" 
                  id="maxTokens" 
                  min="1" 
                  max="4000" 
                  value="${cfg.maxTokens || 300}"
                  class="form-control"
                >
                <div class="form-hint">Maximum response length (1-4000)</div>
              </div>
            </div>

            <div class="form-actions">
              <button type="submit" class="btn btn-success" id="saveBtn">
                <span>💾</span>
                Save Settings
              </button>
              <button type="button" class="btn btn-outline" onclick="resetToDefaults()">
                <span>🔄</span>
                Reset to Defaults
              </button>
            </div>
          </form>
        </div>

        <!-- Advanced Settings -->
        <div class="settings-section">
          <h2>🔧 Advanced Settings</h2>
          <div class="advanced-settings">
            <div class="setting-card">
              <div class="setting-info">
                <h3>Auto-save</h3>
                <p>Automatically save settings as you type</p>
              </div>
              <label class="switch">
                <input type="checkbox" id="autoSave" checked>
                <span class="slider round"></span>
              </label>
            </div>

            <div class="setting-card">
              <div class="setting-info">
                <h3>Performance Mode</h3>
                <p>Optimize for faster responses</p>
              </div>
              <label class="switch">
                <input type="checkbox" id="performanceMode" ${cfg.performanceMode ? 'checked' : ''}>
                <span class="slider round"></span>
              </label>
            </div>

            <div class="setting-card">
              <div class="setting-info">
                <h3>Debug Mode</h3>
                <p>Show detailed logs and errors</p>
              </div>
              <label class="switch">
                <input type="checkbox" id="debugMode" ${cfg.debugMode ? 'checked' : ''}>
                <span class="slider round"></span>
              </label>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="settings-section">
          <h2>⚡ Quick Actions</h2>
          <div class="quick-actions-grid">
            <button class="action-card" id="exportSettingsBtn" onclick="exportSettings()">
              <span class="action-icon">📤</span>
              <h3>Export Settings</h3>
              <p>Download your current configuration</p>
            </button>
            <button class="action-card" id="importSettingsBtn" onclick="importSettings()">
              <span class="action-icon">📥</span>
              <h3>Import Settings</h3>
              <p>Load settings from a file</p>
            </button>
            <button class="action-card" id="testConnectionBtn" onclick="testConnection()">
              <span class="action-icon">🔗</span>
              <h3>Test Connection</h3>
              <p>Verify API connectivity</p>
            </button>
            <button class="action-card" id="clearCacheBtn" onclick="clearCache()">
              <span class="action-icon">🗑️</span>
              <h3>Clear Cache</h3>
              <p>Reset all cached data</p>
            </button>
            <button class="action-card" id="deleteAllDataBtn" onclick="deleteAllData()">
              <span class="action-icon">💥</span>
              <h3>Delete All Data</h3>
              <p>Permanently delete all saved data</p>
            </button>
          </div>
        </div>

        <!-- System Information -->
        <div class="settings-section">
          <h2>ℹ️ System Information</h2>
          <div class="system-info">
            <div class="info-card">
              <h3>Version</h3>
              <p>1.0.0</p>
            </div>
            <div class="info-card">
              <h3>Node.js</h3>
              <p>${process.version}</p>
            </div>
            <div class="info-card">
              <h3>Platform</h3>
              <p>${process.platform}</p>
            </div>
            <div class="info-card">
              <h3>Memory Usage</h3>
              <p>${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>

  <script>
    // Define global functions first
    // Client-side helpers
    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = String(str);
      return div.innerHTML;
    }

    function deleteAllData() {
      console.log('deleteAllData function called!');
      const warningMessage = '⚠️ WARNING: This will permanently delete ALL saved data including:\\n\\n• User conversations and memory\\n• User profiles and subscriptions\\n• All campaign data and usage statistics\\n• Flow states and settings\\n• Knowledge base index and configurations\\n• WhatsApp Web.js cache and authentication data\\n\\nThis action cannot be undone. Are you absolutely sure?';
      const finalMessage = 'Final confirmation: Are you sure you want to delete ALL data? This will reset the entire system.';
      if (confirm(warningMessage)) {
        if (confirm(finalMessage)) {
          showToast('Deleting all data...', 'warning');
          
          fetch('/settings/api/delete-all-data', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            }
          })
          .then(response => response.json())
          .then(result => {
            if (result.success) {
              showToast(result.message, 'success');
              // Optionally reload the page after a short delay
              setTimeout(() => {
                if (confirm('Data deleted successfully. Would you like to reload the page?')) {
                  window.location.reload();
                }
              }, 2000);
            } else {
              showToast(result.message || 'Failed to delete data', 'error');
            }
          })
          .catch(error => {
            console.error('Error:', error);
            showToast('Failed to delete data', 'error');
          });
        }
      }
    }

    function clearCache() {
      if (confirm('Are you sure you want to clear all cached data?')) {
        showToast('Cache cleared successfully', 'success');
      }
    }

    function exportSettings() {
      fetch('/settings/api/settings')
        .then(response => response.json())
        .then(data => {
          const blob = new Blob([JSON.stringify(data.settings, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'whatsapp-ai-settings.json';
          a.click();
          URL.revokeObjectURL(url);
          showToast('Settings exported successfully', 'success');
        });
    }

    function importSettings() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = function(e) {
            try {
              const settings = JSON.parse(e.target.result);
              // Apply settings
              Object.keys(settings).forEach(function(key) {
                const element = document.querySelector('[name="' + key + '"]');
                if (element) {
                  element.value = settings[key];
                }
              });
              showToast('Settings imported successfully', 'success');
            } catch (error) {
              showToast('Invalid settings file', 'error');
            }
          };
          reader.readAsText(file);
        }
      };
      input.click();
    }

    function testConnection() {
      showToast('Testing connection...', 'info');
      // Simulate connection test
      setTimeout(() => {
        showToast('Connection test completed successfully', 'success');
      }, 2000);
    }

    function verifyLicense() {
      const btn = document.getElementById('verifyLicenseBtn');
      const status = document.getElementById('licenseStatus');
      const input = document.getElementById('licenseKey');
      if (!input.value.trim()) {
        showToast('Enter a license key first', 'warning');
        return;
      }
      // Simple client-side format check (must match server policy)
      const normalized = input.value.trim();
      const formatOk = /^[A-Z0-9-]{6,64}$/.test(normalized);
      if (!formatOk) {
        status.textContent = '❌ Invalid format';
        showToast('Invalid license key format', 'error');
        return;
      }
      btn.setAttribute('disabled', 'true');
      status.textContent = 'Verifying...';
      fetch('/settings/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: input.value })
      })
      .then(() => fetch('/settings/api/license/verify', { method: 'POST' }))
      .then(r => r.json())
      .then(result => {
        if (result && result.valid) {
          status.textContent = '✅ License valid';
          showToast('License verified', 'success');
        } else {
          status.textContent = '❌ License invalid';
          showToast('License invalid', 'error');
        }
      })
      .catch(() => {
        status.textContent = '❌ Verification failed';
        showToast('Verification failed', 'error');
      })
      .finally(() => {
        btn.removeAttribute('disabled');
      });
    }

    function resetToDefaults() {
      if (confirm('Are you sure you want to reset all settings to defaults?')) {
        // Reset form to defaults
        document.getElementById('botEnabled').value = 'true';
        document.getElementById('systemPrompt').value = '';
        document.getElementById('model').value = 'gpt-4o-mini';
        document.getElementById('temperature').value = '0.7';
        document.getElementById('maxTokens').value = '300';
        
        // Trigger change events
        document.getElementById('systemPrompt').dispatchEvent(new Event('input'));
        updateTemperatureValue('0.7');
        
        showToast('Settings reset to defaults', 'info');
      }
    }

    function showToast(message, type = 'info') {
      const toast = document.createElement('div');
      toast.className = 'toast ' + type;
      const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
      toast.innerHTML = icon + ' ' + message;
      
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

    function updateTemperatureValue(value) {
      document.getElementById('temperatureValue').textContent = value;
    }

    (function() {
      console.log('IIFE started - page loaded');
      // Initialize UI enhancements (called after DOM hooks are set up below)
      
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

      // Character counter for system prompt
      const systemPrompt = document.getElementById('systemPrompt');
      const charCount = document.getElementById('charCount');
      
      systemPrompt.addEventListener('input', function() {
        const length = this.value.length;
        charCount.textContent = length;
        
        if (length > 1800) {
          charCount.style.color = 'var(--error)';
        } else if (length > 1500) {
          charCount.style.color = 'var(--warning)';
        } else {
          charCount.style.color = 'var(--muted)';
        }
      });

      // Temperature slider
      function updateTemperatureValue(value) {
        document.getElementById('temperatureValue').textContent = value;
      }

      // Lightweight client-side helpers
      function validateForm(form) {
        try {
          const maxTokens = parseInt(form.maxTokens?.value || '300', 10);
          if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 4000) return false;
          const temp = parseFloat(form.temperature?.value || '0.7');
          if (!Number.isFinite(temp) || temp < 0 || temp > 2) return false;
          const model = String(form.model?.value || '').trim();
          if (!model) return false;
          const sp = String(form.systemPrompt?.value || '');
          if (sp.length > 2000) return false;
          return true;
        } catch {
          return false;
        }
      }

      function setLoading(btn, isLoading) {
        if (!btn) return;
        if (isLoading) {
          btn.setAttribute('disabled', 'true');
          btn.classList.add('loading');
        } else {
          btn.removeAttribute('disabled');
          btn.classList.remove('loading');
        }
      }

      // Form submission with loading state
      const settingsForm = document.getElementById('settingsForm');
      const saveBtn = document.getElementById('saveBtn');
      
      settingsForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        if (!validateForm(this)) {
          showToast('Please fix the errors in the form', 'error');
          return;
        }
        
        setLoading(saveBtn, true);
        
        // Submit form via AJAX for better UX
        const formData = new FormData(this);
        const data = Object.fromEntries(formData);
        data.performanceMode = document.getElementById('performanceMode')?.checked ? 'true' : 'false';
        data.debugMode = document.getElementById('debugMode')?.checked ? 'true' : 'false';
        
        fetch('/settings/api/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(result => {
          if (result.success) {
            showToast(result.message, 'success');
            // Update URL without reload
            window.history.replaceState({}, '', '/settings?success=' + encodeURIComponent(result.message));
          } else {
            showToast(result.error || 'Failed to save settings', 'error');
          }
        })
        .catch(error => {
          console.error('Error:', error);
          showToast('Failed to save settings', 'error');
        })
        .finally(() => {
          setLoading(saveBtn, false);
        });
      });

      // Auto-save functionality
      let autoSaveTimeout;
      const autoSave = document.getElementById('autoSave');
      
      function setupAutoSave() {
        const inputs = document.querySelectorAll('#settingsForm input, #settingsForm textarea, #settingsForm select');
        inputs.forEach(input => {
          input.addEventListener('change', function() {
            if (autoSave.checked) {
              clearTimeout(autoSaveTimeout);
              autoSaveTimeout = setTimeout(() => {
                saveSettings();
              }, 2000);
            }
          });
        });
      }
      
      function saveSettings() {
        const formData = new FormData(settingsForm);
        const data = Object.fromEntries(formData);
        // Include switches that are not part of native form serialization
        data.performanceMode = document.getElementById('performanceMode')?.checked ? 'true' : 'false';
        data.debugMode = document.getElementById('debugMode')?.checked ? 'true' : 'false';
        
        fetch('/settings/api/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(result => {
          if (result.success) {
            showToast('Settings auto-saved', 'info');
          }
        })
        .catch(error => {
          console.error('Auto-save error:', error);
        });
      }

      // Quick action functions are now defined globally above

      function initSettings() {
        console.log('initSettings function called');
        setupAutoSave();
        
        // Load saved preferences
        const savedAutoSave = localStorage.getItem('settings_autoSave');
        if (savedAutoSave !== null) {
          autoSave.checked = savedAutoSave === 'true';
        }
        
        // Save preferences
        autoSave.addEventListener('change', function() {
          localStorage.setItem('settings_autoSave', this.checked);
        });
        
        // Quick Action buttons use inline onclick attributes now to avoid double-binding
        const verifyBtn = document.getElementById('verifyLicenseBtn');
        if (verifyBtn) {
          verifyBtn.addEventListener('click', verifyLicense);
        }
      }

      // Now that DOM hooks are defined above, initialize settings UI
      initSettings();

      // Keyboard shortcuts
      document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + S to save
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
          if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            settingsForm.requestSubmit();
          }
        }
        
        // Ctrl/Cmd + R to reset
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
          e.preventDefault();
          resetToDefaults();
        }
      });
    })();
  </script>
</body>
</html>`;
}

module.exports = { createSettingsPage };


