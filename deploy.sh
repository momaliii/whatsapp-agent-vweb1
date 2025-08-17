#!/bin/bash

# DigitalOcean Deployment Script for WhatsApp Agent
# Make sure to run: chmod +x deploy.sh

set -e

echo "🚀 Starting WhatsApp Agent deployment..."

# Check if required environment variables are set
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ Error: Required environment variables are not set!"
    echo "Please set the following variables:"
    echo "  - OPENAI_API_KEY"
    exit 1
fi

# Build Docker image
echo "📦 Building Docker image..."
docker build -t whatsapp-agent .

# Stop and remove existing container if running
echo "🛑 Stopping existing container..."
docker stop whatsapp-agent || true
docker rm whatsapp-agent || true

# Run the container
echo "▶️  Starting WhatsApp Agent container..."
docker run -d \
  --name whatsapp-agent \
  --restart unless-stopped \
  -p 3000:3000 \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  -e OPENAI_MODEL="${OPENAI_MODEL:-gpt-4o-mini}" \
  -e SYSTEM_PROMPT="${SYSTEM_PROMPT:-You are a helpful WhatsApp assistant. Keep replies brief and friendly.}" \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e DASHBOARD_PORT=4000 \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/config:/app/config" \
  -v "$(pwd)/uploads:/app/uploads" \
  whatsapp-agent

echo "✅ WhatsApp Agent deployed successfully!"
echo "🌐 Your app is running on port 3000"
echo "📊 Dashboard available on port 4000"
echo "📱 Scan QR code in dashboard to connect WhatsApp"
echo "🔍 Check logs with: docker logs whatsapp-agent"
