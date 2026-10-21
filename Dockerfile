# ==============================================================================
# Multi-Stage Production Dockerfile for CondoTransparent SaaS
# ==============================================================================

# Stage 1: Build & Dependencies
FROM node:20-bookworm-slim AS build

WORKDIR /app

ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package*.json ./

RUN npm ci --omit=dev

# ------------------------------------------------------------------------------
# Stage 2: Production Runtime
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Install dumb-init and Chromium runtime dependencies for asynchronous reporting
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    chromium \
    fonts-liberation \
    fonts-dejavu-core \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Production environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy dependencies from build stage
COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./

# Copy application source code
COPY . .

# Ensure storage and upload directories exist with correct permissions for node user
RUN mkdir -p /app/storage/uploads /app/public/uploads \
    && chown -R node:node /app

# Switch to non-root user
USER node

# Expose HTTP port
EXPOSE 3000

# Native Node 20 Healthcheck hitting /healthz endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Use dumb-init as PID 1 to handle signal forwarding and reap zombie processes
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the application
CMD ["node", "server.js"]
