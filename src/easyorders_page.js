'use strict';

const express = require('express');
const { getConfig, setConfig } = require('./config');
// In-memory delivery log (last 200 entries)
let deliveries = [];
// Pending orders to retry when WhatsApp client reconnects
let pendingOrders = [];
let retryTimer = null;
let pollerStatus = { lastRun: null, lastOk: null, lastError: null, lastCount: 0 };

function createEasyOrdersPage(opts = {}) {
  const getClient = typeof opts.getClient === 'function' ? opts.getClient : () => null;
  const app = express.Router();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  app.get('/', (req, res) => {
    const cfg = getConfig();
    const eo = cfg.easyOrders || {};
    res.send(render(eo));
  });

  app.get('/status', (req, res) => {
    const cfg = getConfig();
    const eo = cfg.easyOrders || {};
    res.json({ pollEnabled: eo.pollEnabled, pollEverySec: eo.pollEverySec, pollSinceIso: eo.pollSinceIso, last: pollerStatus });
  });

  // Background retry for queued orders
  function startRetryLoop(){
    clearInterval(retryTimer);
    retryTimer = setInterval(async () => {
      try {
        if (!pendingOrders.length) return;
        const ready = await isClientReady(getClient);
        if (!ready) return;
        // Send one at a time to avoid bursts
        const job = pendingOrders.shift();
        if (job && job.order) {
          await queueSend(getClient, job.order, job.eo);
        }
      } catch {}
    }, 7000);
  }
  startRetryLoop();

  app.post('/save', (req, res) => {
    const cfg = getConfig();
    const eo = {
      enabled: String(req.body.enabled || 'false') === 'true',
      webhookSecret: String(req.body.webhookSecret || ''),
      phoneField: String(req.body.phoneField || 'customer'),
      countryCodePrefix: String(req.body.countryCodePrefix || ''),
      sendOn: String(req.body.sendOn || 'created'),
      template: String(req.body.template || '') || 'Hi {{name}}, your order {{order_id}} total {{total}} was received on {{date}}.',
      apiKey: String(req.body.apiKey || ''),
      listUrl: String(req.body.listUrl || ''),
      pollEnabled: String(req.body.pollEnabled || 'false') === 'true',
      pollEverySec: Math.max(15, parseInt(req.body.pollEverySec || '60', 10) || 60),
      pollSinceIso: String(req.body.pollSinceIso || '')
    };
    setConfig({ ...cfg, easyOrders: eo });
    res.redirect('/easy');
  });

  // Deliveries log endpoints
  app.get('/deliveries', (req, res) => {
    try {
      res.json({ deliveries });
    } catch {
      res.json({ deliveries: [] });
    }
  });
  app.post('/deliveries/clear', (req, res) => {
    deliveries = [];
    res.redirect('/easy');
  });

  // Webhook endpoint (generic JSON; you will adapt mapping to your provider)
  app.post('/webhook', async (req, res) => {
    const cfg = getConfig();
    const eo = cfg.easyOrders || {};
    if (!eo.enabled) return res.status(202).send('disabled');
    try {
      // Optional: verify secret from header/query/body depending on provider convention
      const secret = String(req.headers['x-easyorders-secret'] || req.query.secret || req.body.secret || '');
      if (eo.webhookSecret && secret !== eo.webhookSecret) return res.status(403).send('forbidden');

      const kind = String(req.body.event || req.body.status || 'created');
      if (eo.sendOn && eo.sendOn !== kind) {
        return res.status(202).send('ignored');
      }

      const order = mapOrder(req.body, eo);
      // Log receipt immediately for visibility
      pushDelivery({ when: new Date().toISOString(), to: order && order.number ? order.number : '', orderId: order && order.order_id ? order.order_id : '', status: 'received', error: '' });
      const ready = await isClientReady(getClient);
      if (!ready) {
        pendingOrders.push({ order, eo });
        pushDelivery({ when: new Date().toISOString(), to: order.number || '', orderId: order.order_id || '', status: 'queued', error: 'client-offline' });
        return res.status(202).send('queued');
      }
      await queueSend(getClient, order, eo);
      return res.status(200).send('ok');
    } catch (e) {
      pushDelivery({ when: new Date().toISOString(), to: '', orderId: '', status: 'error', error: 'bad:' + (e && e.message ? e.message : '') });
      res.status(400).send('bad');
    }
  });

  // Simple simulator to test (EasyOrders-like shape)
  app.post('/simulate', (req, res) => {
    const cfg = getConfig(); const eo = cfg.easyOrders || {};
    const body = {
      event: eo.sendOn || 'created',
      id: 'ORD-' + Math.floor(Math.random()*1000000),
      created_at: new Date().toISOString(),
      total_cost: 750,
      status: 'pending',
      full_name: 'Test User',
      phone: '01034567890',
      government: 'Cairo',
      address: 'Street 1, Building 2',
      payment_method: 'cod',
      cart_items: [
        { price: 220, quantity: 1, product: { name: 'Item A' } },
        { price: 530, quantity: 1, product: { name: 'Item B' } }
      ]
    };
    res.json(body);
  });

  return app;
}

function mapOrder(payload, eo){
  // Some providers wrap the order under `order`
  const src = (payload && payload.order) ? payload.order : payload;
  // EasyOrders shape: https://public-api-docs.easy-orders.net/docs/get-order-by-id
  if (src && (src.full_name || src.phone || src.total_cost)) {
    const name = String(src.full_name || '').trim();
    let number = normalizePhone(String(src.phone || ''), eo);
    const items = Array.isArray(src.cart_items) ? src.cart_items : [];
    const itemsText = items.map(i => `${(i.product && i.product.name) ? i.product.name : 'Item'} x${i.quantity||1}`).join(', ');
    return {
      name,
      number,
      order_id: String(src.id || ''),
      total: String(src.total_cost ?? ''),
      currency: String(src.currency || ''),
      date: new Date(src.created_at || Date.now()).toLocaleString(),
      status: String(src.status || ''),
      payment_method: String(src.payment_method || ''),
      government: String(src.government || ''),
      address: String(src.address || ''),
      items: itemsText,
      items_count: items.reduce((a,b)=>a + Number(b.quantity||1), 0)
    };
  }
  // Generic fallback
  const customer = (src && (src.customer || src.billing)) ? (src.customer || src.billing) : {};
  const shipping = (src && src.shipping) ? src.shipping : {};
  const name = String((customer.name || shipping.name || payload.name || '')).trim();
  let number = '';
  if (eo && eo.phoneField === 'shipping') number = normalizePhone(String(shipping.phone || ''), eo);
  else number = normalizePhone(String(customer.phone || ''), eo);
  return {
    name,
    number,
    order_id: String((src && (src.order_id || src.id)) || ''),
    total: String((src && (src.total || src.amount)) || ''),
    currency: String((src && src.currency) || ''),
    date: new Date().toLocaleString(),
    status: String((src && src.status) || ''),
    payment_method: String((src && src.payment_method) || ''),
    government: String((src && src.government) || ''),
    address: String((src && src.address) || ''),
    items: '',
    items_count: 0
  };
}

async function queueSend(getClient, order, eo){
  const client = typeof getClient === 'function' ? getClient() : null;
  if (!client) {
    // No client available: queue and return; the caller should have queued already
    pushDelivery({ when: new Date().toISOString(), to: order && order.number ? order.number : '', orderId: order && order.order_id ? order.order_id : '', status: 'skipped', error: 'no-client' });
    return 'skipped';
  }
  if (!order || !order.number) {
    pushDelivery({ when: new Date().toISOString(), to: '', orderId: order && order.order_id ? order.order_id : '', status: 'skipped', error: 'no-number' });
    return 'skipped';
  }
  try {
    const id = await client.getNumberId(order.number);
    if (!id) {
      pushDelivery({ when: new Date().toISOString(), to: order.number, orderId: order.order_id, status: 'no-whatsapp', error: '' });
      return 'no-whatsapp';
    }
    const jid = id._serialized;
    const text = fillTemplate(eo.template || '', {
      name: order.name || '',
      order_id: order.order_id || '',
      total: order.total || '',
      currency: order.currency || '',
      date: order.date || '',
      status: order.status || '',
      payment_method: order.payment_method || '',
      government: order.government || '',
      address: order.address || '',
      items: order.items || '',
      items_count: String(order.items_count || '')
    });
    await client.sendMessage(jid, text);
    pushDelivery({ when: new Date().toISOString(), to: order.number, orderId: order.order_id, status: 'sent', error: '' });
    return 'sent';
  } catch (e) {
    const msg = String(e && e.message ? e.message : e || '');
    // If client session is closed, re-queue
    if (/Session closed|Target closed|disconnected/i.test(msg)) {
      pendingOrders.push({ order, eo });
      pushDelivery({ when: new Date().toISOString(), to: order.number, orderId: order.order_id, status: 'queued', error: 'client-offline' });
      return 'queued';
    }
    pushDelivery({ when: new Date().toISOString(), to: order.number, orderId: order.order_id, status: 'error', error: msg });
    return 'error';
  }
}

function fillTemplate(tpl, vars){
  return String(tpl || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(vars[k] ?? ''));
}

function normalizePhone(raw, eo){
  try {
    const prefixDigits = String((eo && eo.countryCodePrefix) || '').replace(/\D/g,'');
    let n = String(raw || '').replace(/\D/g,'');
    if (!n) return '';
    // Convert leading 00 to international form
    if (n.startsWith('00')) n = n.slice(2);
    if (prefixDigits) {
      if (n.startsWith(prefixDigits)) return n; // already international
      // Add country code and strip leading zeros from national number
      return prefixDigits + n.replace(/^0+/, '');
    }
    return n;
  } catch { return String(raw || '').replace(/\D/g,''); }
}

function render(eo){
  return `<!DOCTYPE html>
  <html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Easy Orders</title><link rel="stylesheet" href="/assets/style.css"/></head>
  <body>
    <div class="layout">
      ${require('./ui').renderNav('easy')}
      <main class="main"><div class="container">
        <h1>Easy Orders</h1>
        <form class="card" method="post" action="/easy/save">
          <div class="row">
            <div><label>Enabled</label><select name="enabled"><option value="true" ${eo.enabled?'selected':''}>On</option><option value="false" ${!eo.enabled?'selected':''}>Off</option></select></div>
            <div><label>Send on</label><select name="sendOn"><option value="created" ${eo.sendOn==='created'?'selected':''}>created</option><option value="paid" ${eo.sendOn==='paid'?'selected':''}>paid</option><option value="fulfilled" ${eo.sendOn==='fulfilled'?'selected':''}>fulfilled</option></select></div>
            <div><label>Phone field</label><select name="phoneField"><option value="customer" ${eo.phoneField!=='shipping'?'selected':''}>customer</option><option value="shipping" ${eo.phoneField==='shipping'?'selected':''}>shipping</option></select></div>
          </div>
          <div class="row">
            <div><label>Country code prefix</label><input name="countryCodePrefix" placeholder="+20" value="${eo.countryCodePrefix||''}"/></div>
            <div><label>Webhook secret</label><input name="webhookSecret" placeholder="optional" value="${eo.webhookSecret||''}"/></div>
          </div>
          <label>Confirmation template</label>
          <textarea name="template" rows="4" placeholder="Hi {{name}}, your order {{order_id}} total {{total}} {{currency}} was received on {{date}}.">${(eo.template||'')}</textarea>
          <h2 class="mt-16">Public API Polling</h2>
          <div class="row">
            <div><label>Poll enabled</label><select name="pollEnabled"><option value="true" ${eo.pollEnabled?'selected':''}>On</option><option value="false" ${!eo.pollEnabled?'selected':''}>Off</option></select></div>
            <div><label>Every (sec)</label><input name="pollEverySec" type="number" min="15" value="${eo.pollEverySec||60}"/></div>
          </div>
          <div class="row">
            <div><label>API Key</label><input name="apiKey" placeholder="EasyOrders Api-Key" value="${eo.apiKey||''}"/></div>
            <div><label>List URL</label><input name="listUrl" value="${eo.listUrl||''}"/></div>
          </div>
          <div class="row">
            <div><label>Since (ISO)</label><input name="pollSinceIso" placeholder="2025-01-01T00:00:00Z" value="${eo.pollSinceIso||''}"/></div>
          </div>
          <button class="btn mt-8" type="submit">Save</button>
        </form>
        <div class="card mt-16">
          <h2>Webhook</h2>
          <div class="note">POST JSON to <code>/easy/webhook</code>. Include header <code>x-easyorders-secret</code> matching the saved secret if set.</div>
          <form method="post" action="/easy/simulate"><button class="btn" type="submit">Preview sample payload</button></form>
        </div>

        <div class="card mt-16">
          <div class="row" style="justify-content:space-between;align-items:center">
            <h2 style="margin:0">Deliveries</h2>
            <form method="post" action="/easy/deliveries/clear"><button class="btn btn-outline" type="submit">Clear</button></form>
          </div>
          <table class="card mt-8" id="logTable">
            <thead><tr><th>Time</th><th>To</th><th>Order</th><th>Status</th><th>Error</th></tr></thead>
            <tbody></tbody>
          </table>
          <button class="btn" type="button" id="refreshLog">Refresh</button>
        </div>
      </div></main>
    </div>
    <script>
      document.getElementById('openMenu')?.addEventListener('click',()=>document.body.classList.toggle('sidebar-open'));
      async function loadLog(){
        try {
          const res = await fetch('/easy/deliveries');
          const data = await res.json();
          const rows = (data.deliveries||[]).slice(-200).reverse();
          const tb = document.querySelector('#logTable tbody');
          if (!tb) return;
          tb.innerHTML = rows.map(function(r){
            var when = r.when || '';
            var to = r.to || '';
            var oid = r.orderId || '';
            var st = r.status || '';
            var err = String(r.error || '').slice(0,160);
            return '<tr><td>' + when + '</td><td>' + to + '</td><td>' + oid + '</td><td>' + st + '</td><td>' + err + '</td></tr>';
          }).join('');
        } catch {}
      }
      document.getElementById('refreshLog')?.addEventListener('click', loadLog);
      loadLog();
      setInterval(loadLog, 8000);
    </script>
  </body></html>`;
}

module.exports = { createEasyOrdersPage };
/**
 * Starts background polling of the EasyOrders public API if enabled in config.
 */
function startEasyOrdersPoller({ getClient }){
  let timer = null;
  async function tick(){
    try {
      const cfg = getConfig();
      const eo = cfg.easyOrders || {};
      if (!eo.pollEnabled || !eo.apiKey || !eo.listUrl) return;
      pollerStatus.lastRun = new Date().toISOString();
      const since = eo.pollSinceIso || new Date(Date.now() - 6*60*60*1000).toISOString();
      const url = (eo.listUrl || '').replace('{{updated_after}}', encodeURIComponent(since));
      let res = await fetch(url, { headers: { 'Api-Key': eo.apiKey } });
      if (!res.ok && res.status === 404 && /updated_after=/.test(url)) {
        // Fallback: some environments may not support updated_after; retry without it
        const fallbackUrl = url.replace(/[?&]updated_after=[^&]*/,'').replace('?&','?');
        res = await fetch(fallbackUrl, { headers: { 'Api-Key': eo.apiKey } });
      }
      if (!res.ok) {
        let body = '';
        try { body = await res.text(); } catch {}
        throw new Error('poll http '+res.status+' '+String(body).slice(0,180));
      }
      const data = await res.json();
      const items = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
      pollerStatus.lastCount = items.length;
      let newest = since;
      for (const item of items){
        // Only send for matching event stage if present
        if (eo.sendOn && item.status && item.status !== eo.sendOn) continue;
        const order = mapOrder(item, eo);
        const ready = await isClientReady(getClient);
        if (!ready) {
          pendingOrders.push({ order, eo });
          pushDelivery({ when: new Date().toISOString(), to: order.number || '', orderId: order.order_id || '', status: 'queued', error: 'client-offline' });
        } else {
          await queueSend(getClient, order, eo);
        }
        if (item.updated_at && item.updated_at > newest) newest = item.updated_at;
        else if (item.created_at && item.created_at > newest) newest = item.created_at;
      }
      if (newest && newest !== since) {
        setConfig({ ...cfg, easyOrders: { ...eo, pollSinceIso: newest } });
      }
      pollerStatus.lastOk = new Date().toISOString();
      pollerStatus.lastError = null;
    } catch (e) {
      pollerStatus.lastError = String(e && e.message ? e.message : 'error');
    }
  }
  function schedule(){
    clearInterval(timer);
    const cfg = getConfig(); const eo = cfg.easyOrders || {};
    if (!eo.pollEnabled) return;
    const every = Math.max(15, parseInt(eo.pollEverySec||'60',10)||60) * 1000;
    timer = setInterval(tick, every);
    tick();
  }
  schedule();
  return { stop(){ clearInterval(timer); }, reschedule: schedule, getStatus: () => pollerStatus };
}

module.exports.startEasyOrdersPoller = startEasyOrdersPoller;

function pushDelivery(entry){
  try {
    deliveries.push(entry);
    if (deliveries.length > 200) deliveries = deliveries.slice(-200);
  } catch {}
}

async function isClientReady(getClient){
  try {
    const client = typeof getClient === 'function' ? getClient() : null;
    if (!client) return false;
    if (typeof client.getState === 'function') {
      const state = await client.getState();
      return String(state || '').toUpperCase().includes('CONNECTED');
    }
    return true; // assume ready if method not available
  } catch {
    return false;
  }
}



