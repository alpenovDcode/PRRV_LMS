# Secrets Management and Rotation Guide

## 🔐 Current Secrets in the Project

### Critical Secrets
1. **JWT_SECRET** - Used for signing access tokens (30min lifetime)
2. **JWT_REFRESH_SECRET** - Used for signing refresh tokens (7 days lifetime)
3. **DATABASE_URL** - PostgreSQL connection string
4. **REDIS_URL** - Redis connection string

### Optional Secrets
- **CLOUDFLARE_API_TOKEN** - For video streaming
- **SMTP credentials** - For email notifications
- **SENTRY_AUTH_TOKEN** - For error tracking

---

## ⚠️ CRITICAL: Remove Secrets from Git History

### Current Issue
The `.env` file with actual secrets is currently in the git repository. This is a **CRITICAL SECURITY RISK**.

### Steps to Fix

#### 1. Remove .env from Git History

```bash
# Option A: Using BFG Repo-Cleaner (Recommended)
# Install BFG
brew install bfg  # macOS
# or download from https://rtyley.github.io/bfg-repo-cleaner/

# Clone a fresh copy
git clone --mirror https://github.com/your-repo/Proryv_ru_LMS.git
cd Proryv_ru_LMS.git

# Remove .env file from all commits
bfg --delete-files .env

# Clean up
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push (WARNING: This rewrites history!)
git push --force

# Option B: Using git filter-branch (Alternative)
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all

git push --force --all
git push --force --tags
```

#### 2. Verify .env is in .gitignore

```bash
# Check if .env is ignored
cat .gitignore | grep .env

# Should show:
# .env
# .env*.local
# .env.development.local
# .env.test.local
# .env.production.local
```

#### 3. Rotate ALL Secrets

After removing from git history, **ALL secrets must be rotated** because they were exposed.

---

## 🔄 Secret Rotation Process

### 1. Generate New JWT Secrets

```bash
# Generate new JWT_SECRET (32 bytes = 64 hex characters)
openssl rand -hex 32

# Generate new JWT_REFRESH_SECRET (64 bytes = 128 hex characters)
openssl rand -hex 64

# Example output:
# JWT_SECRET: 751fcabfa5638c4b560a797299770e375ac5b010e7922b51d815bd4a07222194
# JWT_REFRESH_SECRET: 9cd82b5c0030126725a38f5ece7f9f90fc0ad6a4ab5da4e7a0e856b10a7dbb61...
```

### 2. Update Production Environment

**For Docker Deployment:**

```bash
# Create .env file on production server (NOT in git!)
cat > .env << 'EOF'
DATABASE_URL="postgresql://user:password@postgres:5432/proryv_lms"
DIRECT_URL="postgresql://user:password@postgres:5432/proryv_lms"
REDIS_URL="redis://redis:6379"

JWT_SECRET="<NEW_SECRET_HERE>"
JWT_REFRESH_SECRET="<NEW_REFRESH_SECRET_HERE>"

JWT_EXPIRES_IN="30m"
JWT_REFRESH_EXPIRES_IN="7d"

NEXT_PUBLIC_APP_URL="https://your-domain.com"
ALLOWED_ORIGIN="https://your-domain.com"

NODE_ENV="production"
EOF

# Set proper permissions
chmod 600 .env
```

**For Vercel/Cloud Platforms:**

1. Go to project settings → Environment Variables
2. Add each secret individually
3. Mark as "Production" environment
4. Never commit to git

### 3. Invalidate All User Sessions

When rotating JWT secrets, all existing tokens become invalid. Users will need to re-login.

```sql
-- Option 1: Invalidate all sessions (forces re-login)
UPDATE users SET session_id = NULL;

-- Option 2: Keep admin sessions, invalidate others
UPDATE users 
SET session_id = NULL 
WHERE role != 'admin';
```

### 4. Update Database Credentials

```bash
# Generate strong password
openssl rand -base64 32

# Update PostgreSQL password
psql -U postgres
ALTER USER proryv WITH PASSWORD 'new_strong_password';

# Update .env
DATABASE_URL="postgresql://proryv:new_strong_password@localhost:5432/proryv_lms"
```

---

## 📅 Rotation Schedule

### Regular Rotation (Best Practice)

| Secret | Rotation Frequency | Priority |
|--------|-------------------|----------|
| JWT_SECRET | Every 90 days | High |
| JWT_REFRESH_SECRET | Every 90 days | High |
| Database Password | Every 180 days | Medium |
| API Keys | Every 180 days | Medium |
| Redis Password | Every 180 days | Low |

### Emergency Rotation (Immediately)

Rotate secrets immediately if:
- ✅ Secrets were committed to git (CURRENT SITUATION)
- Security breach detected
- Employee with access leaves company
- Suspicious activity detected
- Compliance requirement

---

## 🔒 Secrets Storage Best Practices

### Development Environment

```bash
# Use .env file (gitignored)
cp .env.example .env
# Edit .env with your local values
```

### Production Environment

**Option 1: Environment Variables (Recommended)**
```bash
# Docker Compose
docker-compose up -d
# Reads from .env file automatically

# Kubernetes
kubectl create secret generic proryv-secrets \
  --from-literal=JWT_SECRET=xxx \
  --from-literal=DATABASE_URL=xxx
```

**Option 2: Secrets Manager (Best for Enterprise)**
- AWS Secrets Manager
- Google Cloud Secret Manager
- HashiCorp Vault
- Azure Key Vault

**Option 3: Encrypted .env (Alternative)**
```bash
# Encrypt .env file
gpg --symmetric --cipher-algo AES256 .env

# Decrypt on server
gpg --decrypt .env.gpg > .env
```

---

## 🚨 Security Checklist

### Before Production Deployment

- [ ] Remove .env from git history
- [ ] Verify .env is in .gitignore
- [ ] Generate new JWT secrets
- [ ] Update all production secrets
- [ ] Test application with new secrets
- [ ] Document secret locations
- [ ] Set up secret rotation reminders
- [ ] Configure backup secrets access
- [ ] Enable audit logging for secret access
- [ ] Set up monitoring for failed auth attempts

### After Secret Rotation

- [ ] Invalidate all user sessions
- [ ] Notify users to re-login
- [ ] Monitor error logs for auth issues
- [ ] Update documentation
- [ ] Test all authentication flows
- [ ] Verify API integrations still work

---

## 📝 Emergency Contact Plan

### If Secrets Are Compromised

1. **Immediate Actions (Within 1 hour)**
   - Rotate all secrets
   - Invalidate all sessions
   - Enable maintenance mode if needed
   - Notify security team

2. **Investigation (Within 24 hours)**
   - Review audit logs
   - Identify scope of breach
   - Document timeline
   - Assess data exposure

3. **Recovery (Within 48 hours)**
   - Deploy new secrets
   - Re-enable services
   - Monitor for suspicious activity
   - Update incident report

4. **Post-Mortem (Within 1 week)**
   - Root cause analysis
   - Update security procedures
   - Train team on prevention
   - Implement additional safeguards

---

## 🔧 Automation Scripts

### Auto-Rotate JWT Secrets (Cron Job)

```bash
#!/bin/bash
# rotate-jwt-secrets.sh

# Generate new secrets
NEW_JWT_SECRET=$(openssl rand -hex 32)
NEW_REFRESH_SECRET=$(openssl rand -hex 64)

# Backup current .env
cp .env .env.backup.$(date +%Y%m%d)

# Update .env file
sed -i "s/JWT_SECRET=.*/JWT_SECRET=\"$NEW_JWT_SECRET\"/" .env
sed -i "s/JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=\"$NEW_REFRESH_SECRET\"/" .env

# Restart application
docker-compose restart app

# Invalidate sessions
docker-compose exec postgres psql -U proryv -d proryv_lms \
  -c "UPDATE users SET session_id = NULL;"

echo "JWT secrets rotated successfully"
echo "All users must re-login"
```

### Schedule Rotation

```bash
# Add to crontab (every 90 days at 2 AM)
0 2 1 */3 * /path/to/rotate-jwt-secrets.sh >> /var/log/secret-rotation.log 2>&1
```

---

## 📚 Additional Resources

- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [12-Factor App: Config](https://12factor.net/config)
- [BFG Repo-Cleaner Documentation](https://rtyley.github.io/bfg-repo-cleaner/)

---

## ✅ Quick Checklist for New Developers

When joining the project:
1. Never commit .env files
2. Use .env.example as template
3. Request secrets from team lead
4. Store secrets in password manager
5. Never share secrets via email/Slack
6. Report any accidental commits immediately

---

**Last Updated:** December 9, 2025  
**Next Review:** March 9, 2026 (90 days)
