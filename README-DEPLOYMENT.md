# WhatsApp Agent - DigitalOcean Deployment Guide

This guide will help you deploy your WhatsApp AI agent to DigitalOcean's cloud platform.

## Prerequisites

1. **DigitalOcean Account**: Sign up at [cloud.digitalocean.com](https://cloud.digitalocean.com)
2. **WhatsApp Account**: You'll need to scan a QR code to connect your WhatsApp
3. **OpenAI API Key**: Get your API key from [OpenAI](https://platform.openai.com)
4. **Domain Name** (optional): For a custom domain

## Required Environment Variables

Before deployment, you need these environment variables:

```bash
# OpenAI
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini

# Optional
SYSTEM_PROMPT=You are a helpful WhatsApp assistant. Keep replies brief and friendly.
PORT=3000
DASHBOARD_PORT=4000
```

## Deployment Options

### Option 1: DigitalOcean App Platform (Recommended)

1. **Connect Your Repository**:
   - Go to DigitalOcean App Platform
   - Connect your GitHub/GitLab repository
   - Select the `whatsapp-agent` directory

2. **Configure the App**:
   - **Build Command**: `npm ci --only=production`
   - **Run Command**: `npm run start:web`
   - **Port**: `3000`
   - **Environment**: Add `DASHBOARD_PORT=4000`

3. **Set Environment Variables**:
   - Add all required environment variables in the App Platform dashboard

4. **Deploy**:
   - Click "Deploy" and wait for the build to complete

### Option 2: DigitalOcean Droplet with Docker

1. **Create a Droplet**:
   - Choose Ubuntu 22.04 LTS
   - Select a plan (Basic $6/month minimum recommended)
   - Add your SSH key

2. **Connect to Your Droplet**:
   ```bash
   ssh root@your-droplet-ip
   ```

3. **Install Docker**:
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   ```

4. **Clone Your Repository**:
   ```bash
   git clone your-repository-url
   cd whatsapp-agent
   ```

5. **Set Environment Variables**:
   ```bash
   export OPENAI_API_KEY="your_key"
   export DASHBOARD_PORT=4000
   ```

6. **Deploy with Docker**:
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

### Option 3: DigitalOcean Container Registry

1. **Build and Push to Registry**:
   ```bash
   # Tag your image
   docker tag whatsapp-agent registry.digitalocean.com/your-registry/whatsapp-agent:latest
   
   # Push to registry
   docker push registry.digitalocean.com/your-registry/whatsapp-agent:latest
   ```

2. **Deploy from Registry**:
   - Use DigitalOcean App Platform or Kubernetes

## Post-Deployment Setup

### 1. Connect WhatsApp

Once deployed, connect your WhatsApp:

1. Access the dashboard at `https://your-domain.com:4000`
2. Scan the QR code with your WhatsApp mobile app
3. Your WhatsApp will be connected to the AI agent

### 2. Test Your Deployment

```bash
# Check if the app is running
curl https://your-domain.com:4000/

# Should show the dashboard interface
```

### 3. Monitor Logs

```bash
# If using Docker
docker logs whatsapp-agent

# If using App Platform
# Check logs in the DigitalOcean dashboard
```

## SSL/HTTPS Setup

### With App Platform
- SSL is automatically configured
- Custom domains are supported

### With Droplet
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com
```

## Scaling and Performance

### App Platform
- Auto-scaling available
- Set minimum and maximum instances

### Droplet
- Upgrade droplet size as needed
- Consider load balancer for multiple instances

## Troubleshooting

### Common Issues

1. **QR Code Not Appearing**:
   - Check if the dashboard is accessible on port 4000
   - Ensure Puppeteer dependencies are installed

2. **WhatsApp Connection Fails**:
   - Make sure you scan the QR code within the time limit
   - Check if WhatsApp Web is already connected elsewhere

3. **AI Not Responding**:
   - Verify `OPENAI_API_KEY` is valid
   - Check OpenAI API quota

### Health Checks

The app includes health checks:
- Dashboard: `GET /` (port 4000)
- Expected response: Dashboard interface

## Security Considerations

1. **Environment Variables**: Never commit sensitive data to git
2. **Firewall**: Configure firewall rules appropriately
3. **Updates**: Keep dependencies updated
4. **Monitoring**: Set up monitoring and alerting

## Cost Optimization

- **App Platform**: Pay per usage, good for variable traffic
- **Droplet**: Fixed cost, good for consistent traffic
- **Container Registry**: Pay for storage and transfer

## Support

For issues:
1. Check application logs
2. Verify environment variables
3. Test webhook endpoints
4. Contact DigitalOcean support if needed
