'use strict';

const express = require('express');
const { getConfig, setConfig } = require('./config');

function createProfilesPage() {
  const app = express.Router();
  app.use(express.urlencoded({ extended: true }));

  app.get('/', (req, res) => {
    const cfg = getConfig();
    res.send(render(cfg));
  });

  app.post('/add', (req, res) => {
    const cfg = getConfig();
    const profiles = Array.isArray(cfg.profiles) ? cfg.profiles.slice() : [];
    let name = String(req.body.name || '').trim();
    name = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 40) || 'profile';
    if (!profiles.includes(name)) profiles.push(name);
    setConfig({ ...cfg, profiles });
    res.redirect('/profiles');
  });

  app.post('/activate', (req, res) => {
    const cfg = getConfig();
    const p = String(req.body.name || '').trim();
    if ((cfg.profiles || []).includes(p)) {
      setConfig({ ...cfg, activeProfile: p });
    }
    res.redirect('/profiles');
  });

  // Hot switch (no restart) - instructs server to swap client
  app.post('/switch-now', (req, res) => {
    const cfg = getConfig();
    const p = String(req.body.name || '').trim();
    if ((cfg.profiles || []).includes(p)) {
      // flag will be read by server endpoint
      return res.redirect(`/profiles/switch-now?name=${encodeURIComponent(p)}`);
    }
    res.redirect('/profiles');
  });

  app.post('/remove', (req, res) => {
    const cfg = getConfig();
    const p = String(req.body.name || '').trim();
    if (p && p !== cfg.activeProfile) {
      const profiles = (cfg.profiles || []).filter(x => x !== p);
      setConfig({ ...cfg, profiles });
    }
    res.redirect('/profiles');
  });

  return app;
}

function render(cfg) {
  const profiles = Array.isArray(cfg.profiles) ? cfg.profiles : ['default'];
  const active = cfg.activeProfile || 'default';
  return `<!DOCTYPE html>
  <html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Profiles</title><link rel="stylesheet" href="/assets/style.css"/></head>
  <body>
    <div class="layout">
      ${require('./ui').renderNav('profiles')}
      <main class="main"><div class="container">
        <h1>Profiles</h1>
        <div class="card">
          <div class="note">Active profile: <strong>${escapeHtml(active)}</strong>. Switching profile requires restarting the process.</div>
          <table class="mt-8"><thead><tr><th>Name</th><th>Active</th><th>Actions</th></tr></thead><tbody>
            ${profiles.map(p => `
              <tr>
                <td>${escapeHtml(p)}</td>
                <td>${p===active?'Yes':'No'}</td>
                <td>
                  <form method="post" action="/profiles/activate" style="display:inline">
                    <input type="hidden" name="name" value="${p}"/>
                    <button class="btn ${p===active?'btn-outline':''}" type="submit">Activate</button>
                  </form>
                  <form method="post" action="/profiles/switch-now" style="display:inline;margin-left:6px;">
                    <input type="hidden" name="name" value="${p}"/>
                    <button class="btn" type="submit">Switch now</button>
                  </form>
                  ${p!==active?`
                  <form method="post" action="/profiles/remove" style="display:inline;margin-left:6px;">
                    <input type="hidden" name="name" value="${p}"/>
                    <button class="btn btn-outline" type="submit">Remove</button>
                  </form>`:''}
                </td>
              </tr>`).join('')}
          </tbody></table>
          <form class="mt-16" method="post" action="/profiles/add">
            <label>New profile name</label>
            <input name="name" placeholder="e.g. support"/>
            <button class="btn" type="submit">Add</button>
          </form>
        </div>
      </div></main>
    </div>
    <script>
      (function(){
        const root = document.documentElement; const saved = localStorage.getItem('theme'); if (saved==='dark') root.setAttribute('data-theme','dark');
        document.getElementById('toggleTheme')?.addEventListener('click',()=>{const d=root.getAttribute('data-theme')==='dark'; if(d){root.removeAttribute('data-theme'); localStorage.setItem('theme','light');} else {root.setAttribute('data-theme','dark'); localStorage.setItem('theme','dark');}});
        document.getElementById('openMenu')?.addEventListener('click',()=>document.body.classList.toggle('sidebar-open'));
      })();
    </script>
  </body></html>`;
}

function escapeHtml(str){
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

module.exports = { createProfilesPage };


