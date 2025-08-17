# WhatsApp AI Agent SaaS - Deployment Guide

## Quick Start

1. **Install dependencies and setup:**
   ```bash
   chmod +x deploy-saas.sh
   ./deploy-saas.sh
   ```

2. **Update configuration:**
   - Edit `.env` file with your API keys
   - Update admin credentials

3. **Start the application:**
   ```bash
   ./start-saas.sh
   ```

## Access Points

- **Landing Page**: http://localhost:3000
- **Dashboard**: http://localhost:3000/dashboard
- **Admin Panel**: http://localhost:3000/admin
- **Login**: http://localhost:3000/login
- **Register**: http://localhost:3000/register

## Default Admin Credentials

- **Email**: admin@yourdomain.com
- **Password**: admin123

⚠️ **Important**: Change these credentials immediately after first login!

## Production Deployment

### Option 1: PM2 (Recommended)
```bash
chmod +x deploy-production.sh
./deploy-production.sh
```

### Option 2: Docker
```bash
docker-compose up -d
```

## Environment Variables

Required environment variables in `.env`:

- `OPENAI_API_KEY`: Your OpenAI API key
- `ADMIN_EMAIL`: Admin email address
- `ADMIN_PASSWORD`: Admin password
- `SESSION_SECRET`: Random string for session security
- `JWT_SECRET`: Random string for JWT tokens

Optional:
- `META_WHATSAPP_TOKEN`: WhatsApp Business API token
- `META_PHONE_NUMBER_ID`: WhatsApp phone number ID
- `META_VERIFY_TOKEN`: Webhook verification token

## Security Checklist

- [ ] Change default admin credentials
- [ ] Set strong session and JWT secrets
- [ ] Configure HTTPS in production
- [ ] Set up proper firewall rules
- [ ] Enable rate limiting
- [ ] Configure backup strategy
- [ ] Set up monitoring and logging

## Monitoring

- **PM2**: `pm2 monit`
- **Logs**: `pm2 logs`
- **Status**: `pm2 status`

## Backup

Regular backup of the `data/` directory is recommended:

```bash
tar -czf backup-$(date +%Y%m%d).tar.gz data/
```

## Support

For issues and questions:
1. Check the logs in `logs/` directory
2. Review the main README.md
3. Check the SaaS business guide
