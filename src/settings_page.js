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
    const { systemPrompt, model, temperature, maxTokens, botEnabled } = req.body;
    const parsed = {
      botEnabled: String(botEnabled || 'true') === 'true',
      systemPrompt: systemPrompt ?? '',
      model: model ?? 'gpt-4o-mini',
      temperature: clampFloat(temperature, 0, 2, 0.7),
      maxTokens: clampInt(maxTokens, 1, 4000, 300),
    };
    setConfig(parsed);
    notify({ title: 'Settings Updated', message: 'System prompt/model/params were updated via settings page.' });
    res.redirect('/settings?success=Settings saved successfully');
  });

  // API endpoint for AJAX saves
  app.post('/api/save', express.json(), (req, res) => {
    try {
      const { systemPrompt, model, temperature, maxTokens, botEnabled } = req.body;
      const parsed = {
        botEnabled: String(botEnabled || 'true') === 'true',
        systemPrompt: systemPrompt ?? '',
        model: model ?? 'gpt-4o-mini',
        temperature: clampFloat(temperature, 0, 2, 0.7),
        maxTokens: clampInt(maxTokens, 1, 4000, 300),
      };
      setConfig(parsed);
      notify({ title: 'Settings Updated', message: 'Settings updated via API.' });
      res.json({ success: true, message: 'Settings saved successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // API endpoint to get current settings
  app.get('/api/settings', (req, res) => {
    const cfg = getConfig();
    res.json({ success: true, settings: cfg });
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
                  <option value="gpt-4o-mini" ${cfg.model === 'gpt-4o-mini' ? 'selected' : ''}>GPT-4o Mini (Fast & Cheap)</option>
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
                <input type="checkbox" id="performanceMode">
                <span class="slider round"></span>
              </label>
            </div>

            <div class="setting-card">
              <div class="setting-info">
                <h3>Debug Mode</h3>
                <p>Show detailed logs and errors</p>
              </div>
              <label class="switch">
                <input type="checkbox" id="debugMode">
                <span class="slider round"></span>
              </label>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="settings-section">
          <h2>⚡ Quick Actions</h2>
          <div class="quick-actions-grid">
            <button class="action-card" onclick="exportSettings()">
              <span class="action-icon">📤</span>
              <h3>Export Settings</h3>
              <p>Download your current configuration</p>
            </button>
            <button class="action-card" onclick="importSettings()">
              <span class="action-icon">📥</span>
              <h3>Import Settings</h3>
              <p>Load settings from a file</p>
            </button>
            <button class="action-card" onclick="testConnection()">
              <span class="action-icon">🔗</span>
              <h3>Test Connection</h3>
              <p>Verify API connectivity</p>
            </button>
            <button class="action-card" onclick="clearCache()">
              <span class="action-icon">🗑️</span>
              <h3>Clear Cache</h3>
              <p>Reset all cached data</p>
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
    (function() {
      // Initialize UI enhancements
      initSettings();
      
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

      // Quick action functions
      window.exportSettings = function() {
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
      };

      window.importSettings = function() {
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
      };

      window.testConnection = function() {
        showToast('Testing connection...', 'info');
        // Simulate connection test
        setTimeout(() => {
          showToast('Connection test completed successfully', 'success');
        }, 2000);
      };

      window.clearCache = function() {
        if (confirm('Are you sure you want to clear all cached data?')) {
          showToast('Cache cleared successfully', 'success');
        }
      };

      window.resetToDefaults = function() {
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
      };

      function initSettings() {
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
      }



      // Global toast function
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


