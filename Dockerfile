# syntax=docker/dockerfile:1.7

# ---- deps ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- builder ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build args let Next pick up build-time public env (NEXT_PUBLIC_*) without leaking secrets.
ARG NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
RUN npm run build

# ---- runner ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
# CRITICAL for Cloud Run: bind to all interfaces and use the injected $PORT.
ENV HOSTNAME=0.0.0.0
ENV PORT=8080

# Non-root user for least privilege.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

# Copy the standalone server, static assets and public folder from the build stage.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/scripts/chat-observability-retention.mjs ./scripts/chat-observability-retention.mjs

USER nextjs

EXPOSE 8080

CMD ["node", "server.js"]