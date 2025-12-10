# 🚀 Production Deployment - Quick Reference

## Critical Files

### ⚠️ NEVER Commit These Files:
- `.env.production` - Production secrets
- `/backups/*.sql` - Database backups
- `/nginx/ssl/*` - SSL certificates
- Any `*.pem`, `*.key`, `*.crt` files

### ✅ Safe to Commit:
- `/scripts/*.sh` - Deployment scripts
- `docker-compose.prod.yml` - Production config
- `nginx/conf.d/*.conf` - NGINX configs
- `.env.example` - Example environment file

## Quick Start

```bash
# 1. Setup production (first time only)
# Create .env.production from .env.example and fill secrets
cp .env.example .env.production
nano .env.production

# 2. Start services
make up

# 3. View logs
make logs
```

## Important Commands

```bash
# Check status
make ps

# Restart services
make restart

# Stop all
make down

# Database backup
make backup

# SSL renewal
# Certbot is handled by nginx container or host, usually auto-renewed if set up correctly.
# If running certbot on host:
sudo certbot renew
```

## Security Checklist

- [ ] Changed database password in `.env.production`
- [ ] DNS configured (prrv.tech → server IP)
- [ ] SSL certificates obtained
- [ ] Firewall configured (ports 80, 443, 22)
- [ ] `.env.production` NOT in git
- [ ] Backups configured

## Support

- 📖 Full guide: See `walkthrough.md` in artifacts
- 🔍 Logs: `docker-compose -f docker-compose.prod.yml logs -f app`
- 🏥 Health: https://prrv.tech/api/health
