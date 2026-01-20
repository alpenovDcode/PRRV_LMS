#!/bin/sh
# Run migrations
# Run migrations
prisma migrate deploy


# Start the application
exec node server.js
