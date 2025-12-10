#!/bin/bash

# Database Backup Script for Proryv LMS
# Add to crontab: 0 2 * * * /path/to/backup-db.sh

set -e

BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="proryv_lms_backup_${DATE}.sql"
RETENTION_DAYS=30

# Load environment
source .env

echo "🗄️  Starting database backup..."

# Create backup directory
mkdir -p $BACKUP_DIR

# Run backup
docker-compose -f docker-compose.prod.yml exec -T postgres pg_dump \
  -U ${POSTGRES_USER:-proryv} \
  -d ${POSTGRES_DB:-proryv_lms} \
  > "${BACKUP_DIR}/${BACKUP_FILE}"

# Compress backup
gzip "${BACKUP_DIR}/${BACKUP_FILE}"

echo "✅ Backup created: ${BACKUP_FILE}.gz"

# Remove old backups
find $BACKUP_DIR -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "✅ Old backups cleaned (retention: ${RETENTION_DAYS} days)"

# Optional: Upload to S3 or other cloud storage
# aws s3 cp "${BACKUP_DIR}/${BACKUP_FILE}.gz" s3://your-bucket/backups/

echo "✅ Backup complete!"
