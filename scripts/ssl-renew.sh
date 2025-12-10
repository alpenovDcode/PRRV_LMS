#!/bin/bash

# SSL Certificate Renewal Script for Proryv LMS
# Run this script via cron to auto-renew Let's Encrypt certificates

set -e

echo "========================================="
echo "SSL Certificate Renewal"
echo "========================================="
echo ""

# Renew certificates
certbot renew --quiet --deploy-hook "docker-compose -f /path/to/proryv_ru_lms/docker-compose.prod.yml exec nginx nginx -s reload"

# Check if renewal was successful
if [ $? -eq 0 ]; then
    echo "✓ SSL certificates renewed successfully"
    
    # Reload NGINX to use new certificates
    cd /path/to/proryv_ru_lms
    docker-compose -f docker-compose.prod.yml exec nginx nginx -s reload
    
    echo "✓ NGINX reloaded with new certificates"
else
    echo "✗ Certificate renewal failed"
    exit 1
fi
