#!/bin/bash

echo "🚀 Starting WhatsApp AI Agent SaaS..."
echo "====================================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please run deploy-saas.sh first."
    exit 1
fi

# Start the SaaS server
echo "🌐 Starting SaaS server on port 3000..."
node src/saas-server.js
