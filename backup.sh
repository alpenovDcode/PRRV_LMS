#!/bin/bash

# Configuration
BACKUP_DIR="./backups"
CONTAINER_NAME="proryv_db"
DB_USER="postgres"
DB_NAME="proryv_lms"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="${BACKUP_DIR}/backup_${TIMESTAMP}.sql.gz"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create backup
echo "Creating backup: $FILENAME"
docker exec -t "$CONTAINER_NAME" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$FILENAME"

# Check if backup was successful
if [ $? -eq 0 ]; then
  echo "Backup created successfully."
  
  # Remove backups older than 7 days
  find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +7 -delete
  echo "Old backups cleaned up."
else
  echo "Backup failed!"
  exit 1
fi
