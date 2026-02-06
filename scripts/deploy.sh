#!/bin/bash

# Zero Downtime Deployment Script
# Usage: ./scripts/deploy.sh

set -e

# Configuration
DOCKER_COMPOSE_FILE="docker-compose.prod.yml"
NGINX_CONTAINER="proryv_nginx"
UPSTREAM_CONF="./nginx/conf.d/upstream.conf"

echo "🚀 Starting Zero Downtime Deployment..."

# 1. Detect current active container
if grep -q "app-blue" "$UPSTREAM_CONF"; then
    CURRENT_COLOR="blue"
    NEW_COLOR="green"
    NEW_CONTAINER="proryv_app_green"
else
    CURRENT_COLOR="green"
    NEW_COLOR="blue"
    NEW_CONTAINER="proryv_app_blue"
fi

echo "🔵 Current environment: $CURRENT_COLOR"
echo "🟢 Deploying to: $NEW_COLOR"

# 2. Pull latest images (if using remote registry)
# echo "📥 Pulling latest images..."
# docker-compose -f $DOCKER_COMPOSE_FILE pull app-$NEW_COLOR

# 3. Build and Start new container
echo "🏗 Building and starting $NEW_COLOR container..."
docker-compose -f $DOCKER_COMPOSE_FILE up -d --build app-$NEW_COLOR

# 4. Wait for healthcheck
echo "asd Waiting for $NEW_COLOR to be healthy..."
attempt=0
max_attempts=30
while [ $attempt -le $max_attempts ]; do
    attempt=$(( attempt + 1 ))
    health_status=$(docker inspect --format='{{json .State.Health.Status}}' $NEW_CONTAINER)
    
    if [ "$health_status" == "\"healthy\"" ]; then
        echo "✅ $NEW_COLOR is healthy!"
        break
    fi
    
    if [ $attempt -eq $max_attempts ]; then
        echo "❌ Timeout waiting for $NEW_COLOR to become healthy."
        echo "⚠️  Rolling back..."
        docker-compose -f $DOCKER_COMPOSE_FILE stop app-$NEW_COLOR
        exit 1
    fi
    
    echo "   ...waiting ($attempt/$max_attempts)"
    sleep 2
done

# 5. Switch Nginx upstream
echo "twisted_rightwards_arrows Switching Nginx traffic to $NEW_COLOR..."
echo "upstream backend { server app-$NEW_COLOR:3000; }" > "$UPSTREAM_CONF"

# 6. Reload Nginx
echo "res Reloading Nginx..."
docker exec $NGINX_CONTAINER nginx -s reload

# 7. Stop old container
echo "octagonal_sign Stopping old $CURRENT_COLOR container..."
docker-compose -f $DOCKER_COMPOSE_FILE stop app-$CURRENT_COLOR

echo "tada Deployment Complete! Active: $NEW_COLOR"
