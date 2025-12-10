#!/bin/bash

# Production Setup Script for Proryv LMS
# Domain: prrv.tech
# This script sets up the production environment for the first time

set -e  # Exit on error

echo "========================================="
echo "Proryv LMS - Production Setup"
echo "Domain: prrv.tech"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root (sudo)${NC}"
    exit 1
fi

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo -e "${RED}Error: .env.production file not found!${NC}"
    echo "Please create .env.production with your production credentials"
    exit 1
fi

echo -e "${GREEN}✓${NC} Found .env.production"

# Generate strong database password if not set
if grep -q "CHANGE_THIS_PASSWORD" .env.production; then
    echo -e "${YELLOW}⚠${NC}  Generating secure database password..."
    DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
    sed -i "s/CHANGE_THIS_PASSWORD/${DB_PASSWORD}/g" .env.production
    echo -e "${GREEN}✓${NC} Database password generated"
fi

# Create necessary directories
echo "Creating necessary directories..."
mkdir -p backups
mkdir -p nginx/ssl
mkdir -p /var/www/certbot
chmod 755 backups nginx/ssl /var/www/certbot
echo -e "${GREEN}✓${NC} Directories created"

# Install Docker if not installed
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}⚠${NC}  Docker not found. Installing..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    systemctl enable docker
    systemctl start docker
    echo -e "${GREEN}✓${NC} Docker installed"
else
    echo -e "${GREEN}✓${NC} Docker already installed"
fi

# Install Docker Compose if not installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}⚠${NC}  Docker Compose not found. Installing..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    echo -e "${GREEN}✓${NC} Docker Compose installed"
else
    echo -e "${GREEN}✓${NC} Docker Compose already installed"
fi

# Install Certbot for SSL certificates
if ! command -v certbot &> /dev/null; then
    echo -e "${YELLOW}⚠${NC}  Installing Certbot..."
    apt-get update
    apt-get install -y certbot
    echo -e "${GREEN}✓${NC} Certbot installed"
else
    echo -e "${GREEN}✓${NC} Certbot already installed"
fi

# Setup SSL certificates
echo ""
echo "========================================="
echo "SSL Certificate Setup"
echo "========================================="
echo ""

read -p "Do you want to obtain SSL certificates now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Obtaining SSL certificate for prrv.tech..."
    
    # Stop nginx if running
    docker-compose -f docker-compose.prod.yml down nginx 2>/dev/null || true
    
    # Obtain certificate
    certbot certonly --standalone \
        -d prrv.tech \
        -d www.prrv.tech \
        --non-interactive \
        --agree-tos \
        --email admin@prrv.tech \
        --preferred-challenges http
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} SSL certificates obtained successfully"
        
        # Setup auto-renewal
        echo "0 0,12 * * * root certbot renew --quiet" > /etc/cron.d/certbot-renew
        chmod 644 /etc/cron.d/certbot-renew
        echo -e "${GREEN}✓${NC} Auto-renewal configured"
    else
        echo -e "${RED}✗${NC} Failed to obtain SSL certificates"
        echo "You can run this manually later with:"
        echo "  sudo certbot certonly --standalone -d prrv.tech -d www.prrv.tech"
    fi
else
    echo -e "${YELLOW}⚠${NC}  Skipping SSL setup. You'll need to configure it manually."
fi

# Copy production NGINX config
echo ""
echo "Configuring NGINX..."
if [ -f nginx/conf.d/proryv-lms.prod.conf ]; then
    cp nginx/conf.d/proryv-lms.prod.conf nginx/conf.d/proryv-lms.conf
    echo -e "${GREEN}✓${NC} Production NGINX config activated"
else
    echo -e "${YELLOW}⚠${NC}  Production NGINX config not found, using default"
fi

# Build and start services
echo ""
echo "========================================="
echo "Building and Starting Services"
echo "========================================="
echo ""

# Load environment variables
export $(cat .env.production | grep -v '^#' | xargs)

# Build images
echo "Building Docker images..."
docker-compose -f docker-compose.prod.yml build --no-cache

# Start services
echo "Starting services..."
docker-compose -f docker-compose.prod.yml up -d

# Wait for database
echo "Waiting for database to be ready..."
sleep 10

# Run database migrations
echo "Running database migrations..."
docker-compose -f docker-compose.prod.yml exec -T app npx prisma migrate deploy

# Seed database (optional)
read -p "Do you want to seed the database with initial data? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Seeding database..."
    docker-compose -f docker-compose.prod.yml exec -T app npx prisma db seed
    echo -e "${GREEN}✓${NC} Database seeded"
fi

# Setup firewall
echo ""
echo "========================================="
echo "Firewall Configuration"
echo "========================================="
echo ""

if command -v ufw &> /dev/null; then
    echo "Configuring UFW firewall..."
    ufw --force enable
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow ssh
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw reload
    echo -e "${GREEN}✓${NC} Firewall configured"
else
    echo -e "${YELLOW}⚠${NC}  UFW not found. Please configure firewall manually."
fi

# Final checks
echo ""
echo "========================================="
echo "Final Checks"
echo "========================================="
echo ""

# Check if services are running
if docker-compose -f docker-compose.prod.yml ps | grep -q "Up"; then
    echo -e "${GREEN}✓${NC} Services are running"
else
    echo -e "${RED}✗${NC} Some services failed to start"
    docker-compose -f docker-compose.prod.yml ps
    exit 1
fi

# Check health endpoint
sleep 5
if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Application health check passed"
else
    echo -e "${YELLOW}⚠${NC}  Health check failed (this might be normal if SSL is not configured yet)"
fi

echo ""
echo "========================================="
echo "Setup Complete!"
echo "========================================="
echo ""
echo "Your Proryv LMS is now running in production mode!"
echo ""
echo "Next steps:"
echo "1. Configure your DNS to point prrv.tech to this server's IP"
echo "2. If you skipped SSL setup, run: sudo certbot certonly --standalone -d prrv.tech -d www.prrv.tech"
echo "3. Access your application at: https://prrv.tech"
echo "4. Check logs with: docker-compose -f docker-compose.prod.yml logs -f"
echo ""
echo "Important files:"
echo "  - Environment: .env.production"
echo "  - Logs: docker-compose -f docker-compose.prod.yml logs"
echo "  - Backups: ./backups/"
echo ""
echo -e "${GREEN}Happy teaching! 🎓${NC}"
