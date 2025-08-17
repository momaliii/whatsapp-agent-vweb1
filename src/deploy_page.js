'use strict';

const express = require('express');

function createDeployPage() {
  const app = express.Router();
  app.get('/', (req, res) => res.send(render()));
  return app;
}

function render() {
  const dockerfile = `# Dockerfile\nFROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --only=production\nCOPY . .\nENV PORT=3000 DASHBOARD_PORT=4000\nEXPOSE 4000\nCMD [\"node\", \"src/whatsapp-web.js\"]\n`;
  const ecosystem = `module.exports = {\n  apps: [{\n    name: 'whatsapp-agent',\n    script: 'src/whatsapp-web.js',\n    instances: 1,\n    autorestart: true,\n    watch: false,\n    env: {\n      NODE_ENV: 'production',\n      PORT: 3000,\n      DASHBOARD_PORT: 4000\n    }\n  }]\n};\n`;
  const commands = [
    ['PM2 install', 'npm i -g pm2 && pm2 start ecosystem.config.js && pm2 save && pm2 startup'],
    ['Docker build', 'docker build -t whatsapp-agent .'],
    ['Docker run', 'docker run -it --rm -p 4000:4000 --env-file .env -v $(pwd)/data:/app/data -v $(pwd)/config:/app/config -v $(pwd)/uploads:/app/uploads whatsapp-agent'],
  ];
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Deploy</title><link rel="stylesheet" href="/assets/style.css"/></head>
  <body>
    <div class="layout">
      ${require('./ui').renderNav('deploy')}
      <main class="main"><div class="container">
        <h1>Deploy</h1>
        <div class="card">
          <h2>PM2</h2>
          <pre class="note">ecosystem.config.js</pre>
          <pre style="white-space:pre-wrap; background:#0b1220; color:#e5e7eb; padding:10px; border-radius:8px;">${escapeHtml(ecosystem)}</pre>
          <h3>Commands</h3>
          <ul>
            ${commands.map(([t,c])=>`<li><strong>${t}:</strong> <code>${escapeHtml(c)}</code></li>`).join('')}
          </ul>
        </div>
        <div class="card mt-16">
          <h2>Docker</h2>
          <pre class="note">Dockerfile</pre>
          <pre style="white-space:pre-wrap; background:#0b1220; color:#e5e7eb; padding:10px; border-radius:8px;">${escapeHtml(dockerfile)}</pre>
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

module.exports = { createDeployPage };


