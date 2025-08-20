'use strict';

const express = require('express');
const { listContacts, getConversation, appendMessage } = require('./memory');

function createConvosPage(opts = {}) {
  const getClient = typeof opts.getClient === 'function' ? opts.getClient : () => null;
  const app = express.Router();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.get('/', (req, res) => {
    const contacts = listContacts();
    res.send(render(contacts));
  });
  app.get('/:id', (req, res) => {
    const id = req.params.id;
    const msgs = getConversation(id);
    res.send(renderThread(id, msgs));
  });
  // JSON feed for simple polling
  app.get('/api/:id', (req, res) => {
    try {
      const id = req.params.id;
      const msgs = getConversation(id);
      res.json({ success: true, id, messages: msgs });
    } catch (e) {
      res.status(500).json({ success: false, error: e && e.message ? e.message : 'error' });
    }
  });
  // Send a message to this contact
  app.post('/:id/send', async (req, res) => {
    const id = req.params.id;
    const text = String(req.body.text || '').trim();
    if (!text) return res.redirect(`/convos/${encodeURIComponent(id)}?error=empty`);
    try {
      const client = getClient();
      if (!client) return res.redirect(`/convos/${encodeURIComponent(id)}?error=no-client`);
      // Directly send to stored WhatsApp JID (e.g. 1234567890@c.us)
      await client.sendMessage(id, text);
      // Mirror into local storage for immediate visibility
      appendMessage(id, 'assistant', text, { origin: 'manual' });
      res.redirect(`/convos/${encodeURIComponent(id)}#bottom`);
    } catch (e) {
      res.redirect(`/convos/${encodeURIComponent(id)}?error=` + encodeURIComponent(e && e.message ? e.message : 'send-failed'));
    }
  });
  return app;
} 

function render(contacts) {
  return `<!DOCTYPE html>
  <html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Conversations</title><link rel="stylesheet" href="/assets/style.css"/></head>
  <body>
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
        <div id="thread">
          ${(msgs||[]).map(m=>`<div class="msg role-${m.role} mt-8"><div class="meta">${new Date(m.ts).toLocaleString()} — <strong>${escapeHtml(m.role)}</strong></div><div>${escapeHtml(String(m.content||''))}</div></div>`).join('') || '<p>No messages.</p>'}
        </div>
        <div id="bottom"></div>
        <form class="card mt-16" method="post" action="/convos/${encodeURIComponent(id)}/send">
          <div class="input-row"><textarea class="input" name="text" rows="2" placeholder="Type a message…" required></textarea></div>
          <div class="row" style="gap:8px;align-items:center"><button class="btn" type="submit">Send</button><button class="btn btn-outline" id="refreshBtn" type="button">Refresh</button><span class="note" id="err"></span></div>
        </form>
      </div></main>
    </div>
    <script>
      document.getElementById('openMenu')?.addEventListener('click',()=>document.body.classList.toggle('sidebar-open'));
      (function(){
        const id = ${JSON.stringify(id)};
        const thread = document.getElementById('thread');
        const err = document.getElementById('err');
        function renderMsgs(msgs){
          thread.innerHTML = (Array.isArray(msgs) ? msgs : []).map(function(m){
            return '<div class="msg role-' + escapeHtml(m.role) + ' mt-8">'
              + '<div class="meta">' + new Date(m.ts).toLocaleString() + ' — <strong>' + escapeHtml(m.role) + '</strong></div>'
              + '<div>' + escapeHtml(String(m.content||'')) + '</div>'
            + '</div>';
          }).join('') || '<p>No messages.</p>';
        }
        function escapeHtml(s){
          return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#039;');
        }
        async function refresh(){
          try {
            const r = await fetch('/convos/api/' + encodeURIComponent(id));
            const j = await r.json();
            if (j && j.success && Array.isArray(j.messages)) renderMsgs(j.messages);
            err.textContent = '';
          } catch(e){ err.textContent = 'refresh failed'; }
        }
        document.getElementById('refreshBtn')?.addEventListener('click', refresh);
        setInterval(refresh, 3000);
        setTimeout(()=>{ location.hash = '#bottom'; }, 50);
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

module.exports = { createConvosPage };


