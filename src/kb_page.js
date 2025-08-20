'use strict';

const express = require('express');
const multer = require('multer');
const { stats, statsBySource, addPdf, addText, deleteSource, testSearch, getSourceMetadata, rebuildMetadata } = require('./kb');
const { getConfig } = require('./config');
const path = require('path');

function createKbPage() {
  const app = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

  app.get('/', (req, res) => {
    const s = stats();
    const per = statsBySource();
    const kbStatus = {
      openaiAvailable: Boolean(process.env.OPENAI_API_KEY),
      embeddingsDisabled: process.env.DISABLE_KB_EMBEDDINGS === 'true',
      useFallback: !Boolean(process.env.OPENAI_API_KEY) || process.env.DISABLE_KB_EMBEDDINGS === 'true'
    };
    const activeProfile = (getConfig().activeProfile || 'default').toString();
    const kbFolder = path.join(__dirname, '..', 'kb', activeProfile);
    const indexFile = path.join(__dirname, '..', 'config', `kb_index.${activeProfile}.json`);
    res.send(renderKb(s, per, kbStatus, { activeProfile, kbFolder, indexFile }));
  });

  app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.redirect('/kb');
    const name = (req.file.originalname || '').toLowerCase();
    try {
      let result;
      if (name.endsWith('.pdf')) {
        result = await addPdf(req.file.buffer, req.file.originalname);
      } else if (name.endsWith('.txt')) {
        result = await addText(req.file.buffer, req.file.originalname);
      } else {
        throw new Error('Unsupported file type. Please upload PDF or TXT files.');
      }
      
      // Redirect with success message
      res.redirect(`/kb?success=Added ${result.chunksAdded} chunks from ${req.file.originalname}`);
    } catch (e) {
      console.error('KB upload error:', e.message);
      res.redirect(`/kb?error=${encodeURIComponent(e.message)}`);
    }
  });

  // Test search endpoint
  app.post('/test-search', express.json(), async (req, res) => {
    try {
      const { query, topK = 3 } = req.body;
      if (!query || query.trim().length < 2) {
        return res.json({ error: 'Query must be at least 2 characters long' });
      }
      
      const results = await testSearch(query.trim(), topK);
      res.json({ results });
    } catch (error) {
      res.json({ error: error.message });
    }
  });

  // Delete source endpoint
  app.post('/delete-source', express.json(), async (req, res) => {
    try {
      const { sourceId } = req.body;
      if (!sourceId) {
        return res.json({ error: 'Source ID is required' });
      }
      
      const result = deleteSource(sourceId);
      res.json({ success: true, deleted: result.deleted });
    } catch (error) {
      res.json({ error: error.message });
    }
  });

  // Rebuild metadata endpoint (for migration)
  app.post('/rebuild-metadata', async (req, res) => {
    try {
      const result = rebuildMetadata();
      res.json({ success: true, ...result });
    } catch (error) {
      res.json({ error: error.message });
    }
  });

  return app;
}

function renderKb(s, per, kbStatus = {}, kbPaths = {}) {
  // Note: These will be processed on the client side
  const successMsg = ''; // Will be read from URL params in JS
  const errorMsg = ''; // Will be read from URL params in JS
  
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Knowledge Base</title>
    <link rel="stylesheet" href="/assets/style.css" />
    <style>
      .search-results { max-height: 400px; overflow-y: auto; }
      .search-result { border: 1px solid #ddd; margin: 8px 0; padding: 12px; border-radius: 6px; }
      .search-result .score { color: #007bff; font-weight: bold; }
      .search-result .source { color: #666; font-size: 0.9em; }
      .search-result .chunk { margin-top: 8px; background: #f8f9fa; padding: 8px; border-radius: 4px; }
      .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin: 16px 0; }
      .stat-card { background: #f8f9fa; padding: 16px; border-radius: 8px; text-align: center; }
      .stat-card .number { font-size: 2em; font-weight: bold; color: #007bff; }
      .stat-card .label { color: #666; margin-top: 4px; }
      .source-item { border: 1px solid #ddd; margin: 8px 0; padding: 12px; border-radius: 6px; }
      .source-item .header { display: flex; justify-content: between; align-items: center; }
      .source-item .meta { font-size: 0.9em; color: #666; margin-top: 4px; }
      .btn-danger { background: #dc3545; color: white; }
      .btn-danger:hover { background: #c82333; }
      .alert { padding: 12px; border-radius: 6px; margin: 16px 0; }
      .alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
      .alert-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
      .loading { opacity: 0.6; pointer-events: none; }
    </style>
  </head>
  <body>
    <div class="layout">
      ${require('./ui').renderNav('kb')}
      <main class="main">
        <div class="container">
          <h1>🧠 Knowledge Base</h1>
          <p class="note">Active profile: <code>${escapeHtml(kbPaths.activeProfile || 'default')}</code> · Folder: <code>${escapeHtml(kbPaths.kbFolder || '')}</code> · Index: <code>${escapeHtml(kbPaths.indexFile || '')}</code></p>
          
          <div id="messageContainer"></div>
          
          ${kbStatus.useFallback ? `
            <div class="alert" style="background: #fff3cd; color: #856404; border: 1px solid #ffeaa7;">
              ⚠️ <strong>Fallback Mode:</strong> OpenAI API is not available. Using basic keyword search instead of semantic embeddings. 
              Search quality may be reduced. Set OPENAI_API_KEY in your environment to enable full functionality.
            </div>
          ` : ''}
          
          <!-- Stats Overview -->
          <div class="card">
            <h2>📊 Overview</h2>
            <div class="stats-grid">
              <div class="stat-card">
                <div class="number">${s.chunks}</div>
                <div class="label">Total Chunks</div>
              </div>
              <div class="stat-card">
                <div class="number">${s.sources}</div>
                <div class="label">Sources</div>
              </div>
              <div class="stat-card">
                <div class="number">${formatBytes(s.totalSize)}</div>
                <div class="label">Total Size</div>
              </div>
              <div class="stat-card">
                <div class="number">${s.lastUpdated ? new Date(s.lastUpdated).toLocaleDateString() : 'N/A'}</div>
                <div class="label">Last Updated</div>
              </div>
            </div>
          </div>

          <!-- Test Search -->
          <div class="card">
            <h2>🔍 Test Search</h2>
            <p>Test how well your knowledge base responds to queries:</p>
            <div class="row">
              <div style="flex: 1;">
                <input type="text" id="searchQuery" placeholder="Enter your search query..." style="width: 100%;" />
              </div>
              <div>
                <button class="btn" id="testSearchBtn">Search</button>
              </div>
            </div>
            <div id="searchResults" class="search-results" style="display: none;"></div>
          </div>

          <!-- Upload Section -->
          <div class="card">
            <h2>📁 Upload Documents</h2>
            <form method="post" action="/kb/upload" enctype="multipart/form-data" id="uploadForm">
              <div class="row">
                <div style="flex: 1;">
                  <label>Select File (PDF or TXT)</label>
                  <input type="file" name="file" accept="application/pdf,text/plain" required />
                </div>
                <div style="align-self: flex-end;">
                  <button class="btn" type="submit" id="uploadBtn">Upload & Process</button>
                </div>
              </div>
            </form>
            <div class="mt-8" style="background: #f8f9fa; padding: 12px; border-radius: 6px;">
              <h4>📋 Upload Guidelines:</h4>
              <ul>
                <li><strong>Supported formats:</strong> PDF, TXT</li>
                <li><strong>Max file size:</strong> 20MB</li>
                <li><strong>Processing:</strong> Documents are automatically chunked and embedded</li>
                <li><strong>Quality:</strong> Better text quality = better search results</li>
              </ul>
            </div>
          </div>

          <!-- Sources Management -->
          <div class="card">
            <h2>📚 Knowledge Sources</h2>
            ${(per && per.length) ? `
              <div id="sourcesList">
                ${per.map(p => `
                  <div class="source-item" data-source-id="${p.sourceId}">
                    <div class="header">
                      <div>
                        <strong>${escapeHtml(p.source)}</strong>
                        <div class="meta">
                          📄 ${p.count} chunks • 
                          ${p.metadata.type || 'unknown'} • 
                          ${p.metadata.size ? formatBytes(p.metadata.size) : 'unknown size'} •
                          Added: ${p.metadata.added ? new Date(p.metadata.added).toLocaleDateString() : 'unknown'}
                        </div>
                      </div>
                      <button class="btn btn-danger btn-sm" onclick="deleteSource('${p.sourceId}', '${escapeHtml(p.source)}')">Delete</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : '<p>No documents uploaded yet. Upload your first document to get started!</p>'}
          </div>
        </div>
      </main>
    </div>
    
    <script>
      (function(){
        const root = document.documentElement;
        const saved = localStorage.getItem('theme');
        if (saved === 'dark') root.setAttribute('data-theme','dark');
        
        document.getElementById('toggleTheme')?.addEventListener('click', () => {
          const isDark = root.getAttribute('data-theme') === 'dark';
          if (isDark) { root.removeAttribute('data-theme'); localStorage.setItem('theme','light'); }
          else { root.setAttribute('data-theme','dark'); localStorage.setItem('theme','dark'); }
        });
        
        document.getElementById('openMenu')?.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
        
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
        
        // Test search functionality
        const searchBtn = document.getElementById('testSearchBtn');
        const searchQuery = document.getElementById('searchQuery');
        const searchResults = document.getElementById('searchResults');
        
        searchBtn?.addEventListener('click', async () => {
          const query = searchQuery.value.trim();
          if (!query) {
            alert('Please enter a search query');
            return;
          }
          
          searchBtn.classList.add('loading');
          searchBtn.textContent = 'Searching...';
          
          try {
            const response = await fetch('/kb/test-search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query, topK: 3 })
            });
            
            const data = await response.json();
            
            if (data.error) {
              searchResults.innerHTML = '<div class="alert alert-error">❌ ' + data.error + '</div>';
            } else if (data.results && data.results.length > 0) {
              searchResults.innerHTML = data.results.map(r => 
                '<div class="search-result">' +
                  '<div class="header">' +
                    '<span class="score">Score: ' + r.score + '</span>' +
                    '<span class="source">Source: ' + escapeHtml(r.source) + '</span>' +
                  '</div>' +
                  '<div class="chunk">' + escapeHtml(r.chunk) + '</div>' +
                '</div>'
              ).join('');
            } else {
              searchResults.innerHTML = '<div class="alert">No results found. Try a different query.</div>';
            }
            
            searchResults.style.display = 'block';
          } catch (error) {
            searchResults.innerHTML = '<div class="alert alert-error">❌ Search failed: ' + error.message + '</div>';
            searchResults.style.display = 'block';
          } finally {
            searchBtn.classList.remove('loading');
            searchBtn.textContent = 'Search';
          }
        });
        
        // Enter key to search
        searchQuery?.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            searchBtn.click();
          }
        });
        
        // Upload form enhancement
        const uploadForm = document.getElementById('uploadForm');
        const uploadBtn = document.getElementById('uploadBtn');
        
        uploadForm?.addEventListener('submit', () => {
          uploadBtn.classList.add('loading');
          uploadBtn.textContent = 'Processing...';
        });
        
        // Delete source function
        window.deleteSource = async (sourceId, sourceName) => {
          if (!confirm('Are you sure you want to delete "' + sourceName + '"? This action cannot be undone.')) {
            return;
          }
          
          try {
            const response = await fetch('/kb/delete-source', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sourceId })
            });
            
            const data = await response.json();
            
            if (data.success) {
              // Remove from UI
              const element = document.querySelector('[data-source-id="' + sourceId + '"]');
              if (element) {
                element.remove();
              }
              
              // Show success message
              alert('Successfully deleted ' + data.deleted + ' chunks from "' + sourceName + '"');
              
              // Reload page to update stats
              setTimeout(() => location.reload(), 1000);
            } else {
              alert('Error: ' + (data.error || 'Unknown error'));
            }
          } catch (error) {
            alert('Error: ' + error.message);
          }
        };
        
        function escapeHtml(str) {
          const div = document.createElement('div');
          div.textContent = str;
          return div.innerHTML;
        }
        
        function formatBytes(bytes) {
          if (bytes === 0) return '0 Bytes';
          const k = 1024;
          const sizes = ['Bytes', 'KB', 'MB', 'GB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
      })();
    </script>
  </body>
  </html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = { createKbPage };


