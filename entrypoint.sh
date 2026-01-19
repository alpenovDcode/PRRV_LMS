#!/bin/sh
# Run migrations
npx prisma@5.7.1 migrate deploy


# Start the application
exec node server.js
