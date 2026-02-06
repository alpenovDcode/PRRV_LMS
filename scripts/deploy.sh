#!/bin/bash

# Zero Downtime Deployment Script
# Usage: ./scripts/deploy.sh

set -e

# Configuration
DOCKER_COMPOSE_FILE="docker-compose.prod.yml"
NGINX_CONTAINER="proryv_nginx"
UPSTREAM_CONF="./nginx/conf.d/upstream.conf"

echo "🚀 Starting Zero Downtime Deployment..."

# 0. Detect Docker Compose command
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
else
    echo "❌ Error: Docker Compose not found. Please install it or check your PATH."
    exit 1
fi
echo "🛠 Using command: $DOCKER_COMPOSE_CMD"

# 1. Detect current active container
if [ ! -f "$UPSTREAM_CONF" ]; then
    echo "⚠️  $UPSTREAM_CONF not found. Assuming first run."
    # Default to assuming blue is "current" (so we deploy green) OR
    # if nothing is running, we just pick one.
    # Let's say we deploy BLUE first if nothing exists.
    # So we pretend CURRENT is GREEN.
    CURRENT_COLOR="green"
    NEW_COLOR="blue"
    NEW_CONTAINER="proryv_app_blue"
    
    # Create the directory if it doesn't exist
    mkdir -p $(dirname "$UPSTREAM_CONF")
elif grep -q "app-blue" "$UPSTREAM_CONF"; then
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
# $DOCKER_COMPOSE_CMD -f $DOCKER_COMPOSE_FILE pull app-$NEW_COLOR

# 3. Build and Start new container
echo "🏗 Building and starting $NEW_COLOR container..."
$DOCKER_COMPOSE_CMD -f $DOCKER_COMPOSE_FILE up -d --build --remove-orphans app-$NEW_COLOR

# 3.1 Run Database Migrations
echo "📦 Running database migrations..."
if ! docker exec app-$NEW_COLOR npx prisma migrate deploy; then
    echo "❌ Migration failed!"
    $DOCKER_COMPOSE_CMD -f $DOCKER_COMPOSE_FILE stop app-$NEW_COLOR
    exit 1
fi

# 4. Wait for healthcheck
echo "⏳ Waiting for $NEW_COLOR to be healthy..."
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
        $DOCKER_COMPOSE_CMD -f $DOCKER_COMPOSE_FILE stop app-$NEW_COLOR
        exit 1
    fi
    
    echo "   ...waiting ($attempt/$max_attempts)"
    sleep 2
done

# 5. Switch Nginx upstream
echo "twisted_rightwards_arrows Switching Nginx traffic to $NEW_COLOR..."
echo "upstream backend { server app-$NEW_COLOR:3000; }" > "$UPSTREAM_CONF"

# 6. Reload Nginx
echo "🔄 Reloading Nginx..."
# Check if nginx is running before reloading
if [ "$(docker ps -q -f name=$NGINX_CONTAINER)" ]; then
    docker exec $NGINX_CONTAINER nginx -s reload
else
    echo "⚠️  Nginx container not found or not running. Starting Nginx..."
    $DOCKER_COMPOSE_CMD -f $DOCKER_COMPOSE_FILE up -d nginx
fi

# 7. Stop old container
echo "🛑 Stopping old $CURRENT_COLOR container..."
# Only stop if it's actually running to avoid errors on first run
if [ "$(docker ps -q -f name=proryv_app_$CURRENT_COLOR)" ]; then
    $DOCKER_COMPOSE_CMD -f $DOCKER_COMPOSE_FILE stop app-$CURRENT_COLOR
else
    echo "ℹ️  Old container proryv_app_$CURRENT_COLOR was not running."
fi

echo "🎉 Deployment Complete! Active: $NEW_COLOR"
