FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
# Используем прямой путь к бинарнику и добавляем retry для сетевых проблем
ENV PRISMA_ENGINES_MIRROR=""
RUN ./node_modules/.bin/prisma generate || \
    (echo "Retry 1..." && sleep 10 && ./node_modules/.bin/prisma generate) || \
    (echo "Retry 2..." && sleep 20 && ./node_modules/.bin/prisma generate)

# Отключаем статическую генерацию для проблемных роутов
ENV NEXT_PRIVATE_STANDALONE=true

# Accept build arguments for public env vars
ARG NEXT_PUBLIC_API_SECRET_KEY
ENV NEXT_PUBLIC_API_SECRET_KEY=$NEXT_PUBLIC_API_SECRET_KEY

ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

ARG NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE
ENV NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE=$NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE

ARG NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH
ENV NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH=$NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Install tsx globally for seeding
RUN npm install -g tsx

# Copy public directory
COPY --from=builder /app/public ./public
# Copy Prisma schema and migrations for runtime migrations
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# Copy scripts for seeding
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
# Copy bcryptjs for seed script
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/bcryptjs ./node_modules/bcryptjs

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

