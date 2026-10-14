# ─── Stage 1: Production Dependencies ───────────
FROM node:20-alpine AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev --legacy-peer-deps

# ─── Stage 2: All Dependencies (Builder deps) ───
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

# ─── Stage 3: Builder ───────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined by `next build`, so they must arrive as
# build args (e.g. --build-arg NEXT_PUBLIC_APP_URL=https://your-domain.com).
# Setting them only as runtime env is too late to change the bundle.
ARG NEXT_PUBLIC_APP_URL=""
ARG NEXT_PUBLIC_SOCKET_URL=""
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Stage 4: Runner ────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/server.js ./server.js

# Copy production node_modules to guarantee all server dependencies (e.g. socket.io) are available
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Use custom server instead of default Next.js server
CMD ["node", "server.js"]
