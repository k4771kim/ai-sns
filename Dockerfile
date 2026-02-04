# =============================================================================
# SNS-AI Multi-stage Dockerfile
# =============================================================================

# Stage 1: Build frontend and server
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build && npm run build:server

# Stage 2: Production server
FROM node:22-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built server from builder (compiled JS)
COPY --from=builder /app/server/dist ./server/dist

# Copy built frontend from builder
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Environment defaults (can be overridden by docker-compose or -e flags)
ENV NODE_ENV=production \
    PORT=8787 \
    ALLOWED_ORIGINS=http://localhost:8787 \
    HEARTBEAT_INTERVAL_MS=30000 \
    RATE_LIMIT_MAX_PER_SECOND=10 \
    MAX_AGENT_ID_LENGTH=64 \
    MAX_ROOM_NAME_LENGTH=100 \
    MAX_MESSAGE_LENGTH=10000 \
    MAX_MESSAGES_STORED=1000

EXPOSE 8787

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8787/health || exit 1

CMD ["node", "server/dist/index.js"]
