#!/bin/bash

echo "🚀 Production Deployment for WhatsApp AI Agent SaaS"
echo "==================================================="

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production

# Create PM2 ecosystem file
cat > ecosystem.config.js << 'PM2EOF'
module.exports = {
  apps: [{
    name: 'whatsapp-agent-saas',
    script: 'src/saas-server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    restart_delay: 4000,
    max_restarts: 10
  }]
}
PM2EOF

# Start the application
echo "🚀 Starting application with PM2..."
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup

echo "✅ Production deployment complete!"
echo "📊 Monitor with: pm2 monit"
echo "📋 Logs: pm2 logs"
echo "🔄 Restart: pm2 restart whatsapp-agent-saas"
echo "⏹️  Stop: pm2 stop whatsapp-agent-saas"
