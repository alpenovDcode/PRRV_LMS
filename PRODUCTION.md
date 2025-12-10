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
sudo ./scripts/setup-production.sh

# 2. Deploy updates
./scripts/deploy-production.sh

# 3. View logs
docker-compose -f docker-compose.prod.yml logs -f
```

## Important Commands

```bash
# Check status
docker-compose -f docker-compose.prod.yml ps

# Restart services
docker-compose -f docker-compose.prod.yml restart

# Stop all
docker-compose -f docker-compose.prod.yml down

# Database backup
./scripts/backup-db.sh

# SSL renewal
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
