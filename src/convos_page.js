'use strict';

const express = require('express');
const { listContacts, getConversation } = require('./memory');

function createConvosPage() {
  const app = express.Router();
  app.get('/', (req, res) => {
    const contacts = listContacts();
    res.send(render(contacts));
  });
  app.get('/:id', (req, res) => {
    const id = req.params.id;
    const msgs = getConversation(id);
    res.send(renderThread(id, msgs));
  });
  return app;
} 

function render(contacts) {
  return `<!DOCTYPE html>
  <html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Conversations</title><link rel="stylesheet" href="/assets/style.css"/></head>
  <body>
    <button class="btn btn-ghost menu-fab" id="openMenu" type="button" title="Menu">☰</button>
    <div class="layout">
      ${require('./ui').renderNav('convos')}
      <main class="main"><div class="container">
        <h1>Conversations</h1>
        ${(contacts||[]).length ? `<table class="card"><thead><tr><th>Contact</th><th>Messages</th><th>Last Activity</th><th></th></tr></thead><tbody>
          ${contacts.map(c=>`<tr><td>${escapeHtml(c.contactId)}</td><td>${c.count}</td><td>${c.lastTs?new Date(c.lastTs).toLocaleString():''}</td><td><a class="btn btn-outline" href="/convos/${encodeURIComponent(c.contactId)}">Open</a></td></tr>`).join('')}
        </tbody></table>` : '<p>No conversations yet.</p>'}
      </div></main>
    </div>
    <script>
      (function(){
        const root = document.documentElement; const saved = localStorage.getItem('theme'); if (saved==='dark') root.setAttribute('data-theme','dark');
        const t=document.getElementById('toggleTheme'); t&&t.addEventListener('click',()=>{const d=root.getAttribute('data-theme')==='dark'; if(d){root.removeAttribute('data-theme'); localStorage.setItem('theme','light');} else {root.setAttribute('data-theme','dark'); localStorage.setItem('theme','dark');}});
        const open=document.getElementById('openMenu'); open&&open.addEventListener('click',()=>document.body.classList.toggle('sidebar-open'));
      })();
    </script>
  </body></html>`;
}

function renderThread(id, msgs){
  return `<!DOCTYPE html>
  <html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${escapeHtml(id)}</title><link rel="stylesheet" href="/assets/style.css"/></head>
  <body>
    <div class="layout">
      ${require('./ui').renderNav('convos')}
      <main class="main"><div class="container">
        <h1>${escapeHtml(id)}</h1>
        ${(msgs||[]).map(m=>`<div class="msg role-${m.role} mt-8"><div class="meta">${new Date(m.ts).toLocaleString()} — <strong>${escapeHtml(m.role)}</strong></div><div>${escapeHtml(String(m.content||''))}</div></div>`).join('') || '<p>No messages.</p>'}
      </div></main>
    </div>
    <script>document.getElementById('openMenu')?.addEventListener('click',()=>document.body.classList.toggle('sidebar-open'));</script>
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

module.exports = { createConvosPage };


