#!/bin/sh
# Run migrations
npx prisma migrate deploy

# Start the application
exec node server.js
