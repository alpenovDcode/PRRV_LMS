#!/bin/bash

# Production Deployment Script for Proryv LMS
# This script handles updates and deployments to production

set -e  # Exit on error

echo "========================================="
echo "Proryv LMS - Production Deployment"
echo "========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo -e "${RED}Error: .env.production not found!${NC}"
    exit 1
fi

# Load environment variables
export $(cat .env.production | grep -v '^#' | xargs)

# Backup database before deployment
echo -e "${BLUE}→${NC} Creating database backup..."
BACKUP_FILE="backups/backup_$(date +%Y%m%d_%H%M%S).sql"
docker-compose -f docker-compose.prod.yml exec -T postgres pg_dump -U ${POSTGRES_USER} ${POSTGRES_DB} > $BACKUP_FILE
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Database backed up to: $BACKUP_FILE"
    # Keep only last 7 backups
    ls -t backups/*.sql | tail -n +8 | xargs -r rm
else
    echo -e "${RED}✗${NC} Backup failed!"
    exit 1
fi

# Pull latest code
echo -e "${BLUE}→${NC} Pulling latest code..."
git pull origin main
echo -e "${GREEN}✓${NC} Code updated"

# Build new images
echo -e "${BLUE}→${NC} Building Docker images..."
docker-compose -f docker-compose.prod.yml build --no-cache app
echo -e "${GREEN}✓${NC} Images built"

# Run database migrations
echo -e "${BLUE}→${NC} Running database migrations..."
docker-compose -f docker-compose.prod.yml run --rm app npx prisma migrate deploy
echo -e "${GREEN}✓${NC} Migrations completed"

# Restart services with zero-downtime
echo -e "${BLUE}→${NC} Deploying new version..."

# Start new app container
docker-compose -f docker-compose.prod.yml up -d --no-deps --build app

# Wait for health check
echo -e "${BLUE}→${NC} Waiting for application to be healthy..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Application is healthy"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT+1))
    echo -n "."
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "\n${RED}✗${NC} Health check failed after $MAX_RETRIES attempts"
    echo "Rolling back..."
    
    # Restore from backup
    docker-compose -f docker-compose.prod.yml exec -T postgres psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} < $BACKUP_FILE
    
    # Restart old version
    docker-compose -f docker-compose.prod.yml up -d
    
    echo -e "${RED}Deployment failed and rolled back${NC}"
    exit 1
fi

# Reload nginx
echo -e "${BLUE}→${NC} Reloading NGINX..."
docker-compose -f docker-compose.prod.yml exec nginx nginx -s reload
echo -e "${GREEN}✓${NC} NGINX reloaded"

# Clean up old images
echo -e "${BLUE}→${NC} Cleaning up old Docker images..."
docker image prune -f
echo -e "${GREEN}✓${NC} Cleanup completed"

# Show status
echo ""
echo "========================================="
echo "Deployment Status"
echo "========================================="
echo ""
docker-compose -f docker-compose.prod.yml ps

echo ""
echo -e "${GREEN}✓ Deployment completed successfully!${NC}"
echo ""
echo "Useful commands:"
echo "  View logs:    docker-compose -f docker-compose.prod.yml logs -f"
echo "  Restart:      docker-compose -f docker-compose.prod.yml restart"
echo "  Stop:         docker-compose -f docker-compose.prod.yml down"
echo ""
