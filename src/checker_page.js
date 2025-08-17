'use strict';

const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');

function createCheckerPage(opts = {}) {
  const getClient = typeof opts.getClient === 'function' ? opts.getClient : () => null;
  const app = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });

  app.get('/', (req, res) => res.send(render()));

  app.post('/check', upload.single('file'), async (req, res) => {
    try {
      const client = getClient();
      if (!client || !client.isRegisteredUser) return res.status(503).json({ error: 'Client not connected' });
      let numbers = [];
      const text = (req.body.numbers || '').trim();
      if (text) numbers = numbers.concat(text.split(/\s|,|\n/).map(s=>s.trim()).filter(Boolean));
      if (req.file && req.file.buffer) {
        const name = (req.file.originalname || '').toLowerCase();
        if (name.endsWith('.csv') || name.endsWith('.txt')) {
          const fileText = req.file.buffer.toString('utf8');
          numbers = numbers.concat(fileText.split(/\s|,|\n/).map(s=>s.trim()).filter(Boolean));
        } else {
          const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          rows.forEach(r => r.forEach(cell => { if (cell) numbers.push(String(cell)); }));
        }
      }
      numbers = Array.from(new Set(numbers.map(s => s.replace(/[^\d+]/g, '')))).filter(Boolean);
      const results = [];
      for (const num of numbers) {
        try {
          const has = await client.isRegisteredUser(num);
          results.push({ number: num, hasWhatsApp: Boolean(has), type: has ? 'unknown' : 'none' });
        } catch { results.push({ number: num, hasWhatsApp: false, type: 'error' }); }
      }
      res.json({ results });
    } catch (e) {
      res.status(500).json({ error: 'Failed' });
    }
  });

  return app;
}

function render() {
  return `<!DOCTYPE html>
  <html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Number Checker</title><link rel="stylesheet" href="/assets/style.css"/></head>
  <body>
    <div class="layout">
      ${require('./ui').renderNav('checker')}
      <main class="main"><div class="container">
        <h1>Check Numbers</h1>
        <div class="card">
          <form id="checkForm" method="post" action="/checker/check" enctype="multipart/form-data">
            <label>Enter numbers (E.164)</label>
            <textarea name="numbers" rows="4" placeholder="+14155552671, +201234567890"></textarea>
            <div class="row">
              <div><label>Upload file (TXT/CSV/XLSX)</label><input type="file" name="file" accept="text/plain,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"/></div>
              <div style="align-self:flex-end"><button class="btn" type="submit">Check</button></div>
            </div>
          </form>
        </div>
        <div class="card mt-16">
          <h2>Results</h2>
          <table id="results" class="mt-8"><thead><tr><th>Number</th><th>Has WhatsApp</th><th>Type</th></tr></thead><tbody></tbody></table>
        </div>
      </div></main>
    </div>
    <script>
      (function(){
        const root=document.documentElement; const saved=localStorage.getItem('theme'); if(saved==='dark') root.setAttribute('data-theme','dark');
        document.getElementById('toggleTheme')?.addEventListener('click',()=>{const d=root.getAttribute('data-theme')==='dark'; if(d){root.removeAttribute('data-theme'); localStorage.setItem('theme','light');} else {root.setAttribute('data-theme','dark'); localStorage.setItem('theme','dark');}});
        document.getElementById('openMenu')?.addEventListener('click',()=>document.body.classList.toggle('sidebar-open'))
        const form=document.getElementById('checkForm'); const tbody=document.querySelector('#results tbody');
        form.addEventListener('submit', async (e)=>{
          e.preventDefault();
          const fd=new FormData(form);
          const res=await fetch('/checker/check',{method:'POST',body:fd});
          const data=await res.json();
          tbody.innerHTML='';
          (data.results||[]).forEach(r=>{
            const tr=document.createElement('tr');
            tr.innerHTML='<td>'+r.number+'</td><td>'+(r.hasWhatsApp?'Yes':'No')+'</td><td>'+r.type+'</td>';
            tbody.appendChild(tr);
          });
        });
      })();
    </script>
  </body></html>`;
}

module.exports = { createCheckerPage };


