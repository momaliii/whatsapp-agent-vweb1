'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Simple auth (basic) for admin endpoints
const ADMIN_USER = process.env.LICENSE_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.LICENSE_ADMIN_PASS || 'password';
function requireAdmin(req, res, next) {
  try {
    const hdr = req.headers.authorization || '';
    if (!hdr.startsWith('Basic ')) return res.status(401).set('WWW-Authenticate', 'Basic realm="license-admin"').end();
    const [user, pass] = Buffer.from(hdr.slice(6), 'base64').toString().split(':');
    if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
  } catch {}
  return res.status(401).set('WWW-Authenticate', 'Basic realm="license-admin"').end();
}

// Persistence
const DATA_DIR = path.join(__dirname);
const KEYS_FILE = path.join(DATA_DIR, 'keys.json');
function readKeys() {
  try { return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')); } catch { return []; }
}
function writeKeys(keys) {
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
}

// Helpers
function isValidFormat(key) { return /^[A-Z0-9-]{6,64}$/.test(String(key||'')); }
function nowIso() { return new Date().toISOString(); }
function isExpired(iso) { return iso && new Date(iso) <= new Date(); }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function normalizeValidUntil(input) {
  try {
    if (!input) return addDays(new Date(), 365).toISOString();
    const d = new Date(input);
    if (!Number.isFinite(d.getTime())) return addDays(new Date(), 365).toISOString();
    if (d <= new Date()) return addDays(new Date(), 365).toISOString();
    return d.toISOString();
  } catch {
    return addDays(new Date(), 365).toISOString();
  }
}
function normalizeBoolean(v, fallback=false){ if (typeof v === 'boolean') return v; if (v === 'true' || v === '1' || v === 1) return true; if (v === 'false' || v === '0' || v === 0) return false; return fallback; }
function generateRandomKey(){
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const D = '23456789';
  function pick(s, n){ let out=''; for(let i=0;i<n;i++) out += s[Math.floor(Math.random()*s.length)]; return out; }
  return `${pick(A,3)}${pick(D,3)}-${pick(A,3)}${pick(D,3)}-${pick(A,3)}`;
}

// Create admin dashboard (minimal HTML)
app.get('/admin', requireAdmin, (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>License Admin</title>
  <style>
    :root{--bg:#0b1220;--card:#0f172a;--muted:#9aa4b2;--text:#e5e7eb;--accent:#3b82f6;--ok:#22c55e;--warn:#f59e0b;--err:#ef4444;--border:#243042}
    *{box-sizing:border-box}
    body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;background:linear-gradient(180deg,#0b1220,#0b1220 70%,#0a101b);color:var(--text);margin:0;padding:24px}
    .wrap{max-width:1100px;margin:0 auto}
    h1{margin:0 0 16px 0}
    .toolbar{display:flex;gap:8px;align-items:center;margin-bottom:16px}
    input,button{padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:#0d1526;color:var(--text)}
    button.primary{background:var(--accent);border-color:transparent;color:white}
    button.ghost{background:transparent}
    .card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px}
    table{width:100%;border-collapse:separate;border-spacing:0 8px}
    th{color:var(--muted);text-align:left;font-weight:600;padding:12px}
    td{background:#0c1426;border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:12px}
    tr td:first-child{border-left:1px solid var(--border);border-top-left-radius:12px;border-bottom-left-radius:12px}
    tr td:last-child{border-right:1px solid var(--border);border-top-right-radius:12px;border-bottom-right-radius:12px}
    .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px}
    .ok{background:rgba(34,197,94,.15);color:#86efac}
    .warn{background:rgba(245,158,11,.15);color:#facc15}
    .err{background:rgba(239,68,68,.15);color:#fca5a5}
    .muted{color:var(--muted)}
    .actions{display:flex;gap:6px}
    .grid{display:grid;grid-template-columns:1fr auto auto auto auto 1fr;gap:8px}
  </style>
  </head><body>
  <div class="wrap">
    <h1>License Admin</h1>
    <div class="card toolbar">
      <input id="keyInput" placeholder="KEY (UPPERCASE-DASH)"/>
      <input id="validInput" type="datetime-local"/>
      <label class="muted"><input id="singleInput" type="checkbox" checked/> Single-use</label>
      <button id="createBtn" class="primary">Create</button>
      <button id="genBtn" class="ghost">Generate</button>
      <input id="search" placeholder="Search" style="margin-left:auto"/>
      <button id="exportBtn" class="ghost">Export</button>
      <input id="importFile" type="file" accept="application/json" style="display:none"/>
      <button id="importBtn" class="ghost">Import</button>
    </div>
    <div class="card">
      <table id="tbl"><thead><tr>
        <th>Key</th><th>Valid Until</th><th>Single</th><th>Used</th><th>Bound Instance</th><th>Actions</th>
      </tr></thead><tbody id="rows"></tbody></table>
    </div>
  </div>
  <script>
    const $ = (id)=>document.getElementById(id);
    function pad(n){return String(n).padStart(2,'0')}
    function setDefaultExpiry(){ const el=$('validInput'); const d=new Date(); d.setDate(d.getDate()+365); el.value = d.getFullYear()+ '-' + pad(d.getMonth()+1)+ '-' + pad(d.getDate())+ 'T' + pad(d.getHours())+ ':' + pad(d.getMinutes()); el.min=(new Date()).toISOString().slice(0,16); }
    async function fetchKeys(){ const r = await fetch('/admin/keys'); return r.json(); }
    function badge(txt,cls){ const s=document.createElement('span'); s.className='badge '+cls; s.textContent=txt; return s; }
    async function render(){ const data = await fetchKeys(); const q = $('search').value.toLowerCase(); const body=$('rows'); body.innerHTML=''; (data||[]).filter(k=>!q||k.key.toLowerCase().includes(q)||String(k.boundInstanceId||'').includes(q)).forEach(k=>{
      const tr=document.createElement('tr');
      const tdKey=document.createElement('td'); tdKey.textContent=k.key; const copy=document.createElement('button'); copy.textContent='Copy'; copy.className='ghost'; copy.onclick=()=>{ navigator.clipboard.writeText(k.key); copy.textContent='Copied'; setTimeout(()=>copy.textContent='Copy',1000); }; tdKey.appendChild(copy);
      const tdValid=document.createElement('td'); const soon = new Date(k.validUntil) - new Date() < 1000*60*60*24*7; tdValid.appendChild(badge(new Date(k.validUntil).toISOString(), soon?'warn':'ok'));
      const tdSingle=document.createElement('td'); tdSingle.appendChild(badge(k.singleUse?'yes':'no', k.singleUse?'warn':'muted'));
      const tdUsed=document.createElement('td'); tdUsed.appendChild(badge(k.used?'yes':'no', k.used?'warn':'muted'));
      const tdBound=document.createElement('td'); tdBound.textContent=k.boundInstanceId||'';
      const tdAct=document.createElement('td'); tdAct.className='actions';
        const del=document.createElement('button'); del.textContent='Delete'; del.onclick=async()=>{ if(!confirm('Delete '+k.key+'?')) return; await fetch('/admin/keys/'+encodeURIComponent(k.key),{method:'DELETE'}); render(); };
        const reset=document.createElement('button'); reset.textContent='Reset Binding'; reset.onclick=async()=>{ await fetch('/admin/keys/'+encodeURIComponent(k.key)+'/reset-binding',{method:'POST'}); render(); };
        const edit=document.createElement('button'); edit.textContent='Edit'; edit.onclick=()=>editRow(k);
        tdAct.appendChild(edit); if(k.boundInstanceId) tdAct.appendChild(reset); tdAct.appendChild(del);
      [tdKey,tdValid,tdSingle,tdUsed,tdBound,tdAct].forEach(td=>tr.appendChild(td)); body.appendChild(tr);
    }); }
    function editRow(k){ const body=$('rows'); const trs=body.querySelectorAll('tr'); trs.forEach(tr=>{ if(tr.firstChild.textContent.startsWith(k.key)){ const td=tr.children[1]; td.innerHTML=''; const inp=document.createElement('input'); inp.type='datetime-local'; const d=new Date(k.validUntil); inp.value = d.toISOString().slice(0,16); td.appendChild(inp); const tog=tr.children[2]; tog.innerHTML=''; const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=!!k.singleUse; tog.appendChild(cb); const act=tr.children[5]; act.innerHTML=''; const save=document.createElement('button'); save.textContent='Save'; save.onclick=async()=>{ const body={ validUntil: new Date(inp.value).toISOString(), singleUse: cb.checked }; await fetch('/admin/keys/'+encodeURIComponent(k.key),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); render(); }; const cancel=document.createElement('button'); cancel.textContent='Cancel'; cancel.onclick=()=>render(); act.appendChild(save); act.appendChild(cancel); } }); }
    $('createBtn').onclick=async()=>{ const key=$('keyInput').value.trim(); const dt=$('validInput').value; const single=$('singleInput').checked; if(!key) return alert('Enter key'); const r=await fetch('/admin/keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,validUntil:dt?new Date(dt).toISOString():null,singleUse:single})}); if(r.ok){ $('keyInput').value=''; render(); } else alert('Failed to create'); };
    $('genBtn').onclick=async()=>{ const r=await fetch('/admin/keys/generate',{method:'POST'}); if(r.ok) render(); };
    $('exportBtn').onclick=async()=>{ const r=await fetch('/admin/export'); const data=await r.json(); const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='keys.json'; a.click(); URL.revokeObjectURL(a.href); };
    $('importBtn').onclick=()=>$('importFile').click();
    $('importFile').onchange=async(e)=>{ const f=e.target.files[0]; if(!f) return; const text=await f.text(); await fetch('/admin/import',{method:'POST',headers:{'Content-Type':'application/json'},body:text}); render(); };
    $('search').oninput=()=>render(); setDefaultExpiry(); render();
  </script>
  </body></html>`);
});

// Admin API
app.get('/admin/keys', requireAdmin, (req, res) => { res.json(readKeys()); });
app.post('/admin/keys', requireAdmin, (req, res) => {
  const { key, validUntil, singleUse } = req.body || {};
  if (!isValidFormat(key)) return res.status(400).json({ error: 'bad_key' });
  try {
    const keys = readKeys();
    if (keys.find(k => k.key === key)) return res.status(409).json({ error: 'exists' });
    const row = { key, validUntil: normalizeValidUntil(validUntil), singleUse: !!singleUse, used: false, boundInstanceId: null, createdAt: nowIso() };
    keys.push(row); writeKeys(keys);
    res.json({ success: true, key: row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/admin/keys/generate', requireAdmin, (req, res) => {
  try {
    const keys = readKeys();
    let key;
    do { key = generateRandomKey(); } while (keys.find(k => k.key === key));
    const row = { key, validUntil: normalizeValidUntil(null), singleUse: true, used: false, boundInstanceId: null, createdAt: nowIso() };
    keys.push(row); writeKeys(keys);
    res.json({ success: true, key: row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch('/admin/keys/:key', requireAdmin, (req, res) => {
  try {
    const k = decodeURIComponent(req.params.key);
    const keys = readKeys();
    const row = keys.find(r => r.key === k);
    if (!row) return res.status(404).json({ error: 'not_found' });
    if (typeof req.body.validUntil !== 'undefined') row.validUntil = normalizeValidUntil(req.body.validUntil);
    if (typeof req.body.singleUse !== 'undefined') row.singleUse = normalizeBoolean(req.body.singleUse, row.singleUse);
    writeKeys(keys);
    res.json({ success: true, key: row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/admin/keys/:key/reset-binding', requireAdmin, (req, res) => {
  try {
    const k = decodeURIComponent(req.params.key);
    const keys = readKeys();
    const row = keys.find(r => r.key === k);
    if (!row) return res.status(404).json({ error: 'not_found' });
    row.used = false; row.boundInstanceId = null; writeKeys(keys);
    res.json({ success: true, key: row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/admin/export', requireAdmin, (req, res) => { res.json(readKeys()); });
app.post('/admin/import', requireAdmin, (req, res) => {
  try {
    const incoming = Array.isArray(req.body) ? req.body : [];
    const sanitized = incoming.map(r => ({
      key: String(r.key || '').toUpperCase(),
      validUntil: normalizeValidUntil(r.validUntil),
      singleUse: normalizeBoolean(r.singleUse, true),
      used: normalizeBoolean(r.used, false),
      boundInstanceId: r.boundInstanceId ? String(r.boundInstanceId) : null,
      createdAt: r.createdAt || nowIso(),
    })).filter(r => isValidFormat(r.key));
    writeKeys(sanitized);
    res.json({ success: true, count: sanitized.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/admin/keys/:key', requireAdmin, (req, res) => {
  try {
    const k = decodeURIComponent(req.params.key);
    const keys = readKeys().filter(row => row.key !== k);
    writeKeys(keys);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Verification endpoint with single-use + binding
app.post('/verify', (req, res) => {
  try {
    const { key, instanceId } = req.body || {};
    console.log('[verify] key=%s instanceId=%s', key, instanceId);
    if (!isValidFormat(key)) return res.status(200).json({ valid: false, reason: 'bad_format' });
    const keys = readKeys();
    const row = keys.find(k => k.key === key);
    if (!row) return res.json({ valid: false, reason: 'not_found' });
    if (isExpired(row.validUntil)) return res.json({ valid: false, reason: 'expired', validUntil: row.validUntil });
    if (row.singleUse) {
      // If not bound, bind now; else require same instance
      if (!row.boundInstanceId) {
        row.boundInstanceId = String(instanceId || '');
        row.used = true;
        writeKeys(keys);
      } else if (row.boundInstanceId !== String(instanceId || '')) {
        return res.json({ valid: false, reason: 'bound_to_other', validUntil: row.validUntil });
      }
    }
    return res.json({ valid: true, validUntil: row.validUntil });
  } catch (error) {
    return res.status(500).json({ valid: false });
  }
});

const port = process.env.PORT || 5050;
app.listen(port, () => {
  console.log(`License verifier running on http://localhost:${port}/verify`);
  console.log(`Admin: http://localhost:${port}/admin (basic auth)`);
});


