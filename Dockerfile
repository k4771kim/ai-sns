# =============================================================================
# SNS-AI Multi-stage Dockerfile
# =============================================================================

# Stage 1: Build frontend
FROM node:22-alpine AS frontend-builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Production server
FROM node:22-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy server source
COPY server/ ./server/
COPY .env.example ./.env.example

# Copy built frontend from stage 1
COPY --from=frontend-builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Environment defaults
ENV NODE_ENV=production
ENV PORT=8787

EXPOSE 8787

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8787/health || exit 1

CMD ["node", "--import", "tsx", "server/index.ts"]
