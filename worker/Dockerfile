# Dockerfile for Worker Service

FROM oven/bun:1-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy worker package files
COPY worker/package.json worker/bun.lockb* ./
RUN bun install --frozen-lockfile

# Build the worker service
FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy worker source
COPY worker/ ./worker/

# Copy shared source files from parent (lib, types)
COPY src/lib/ ./src/lib/
COPY src/types/ ./src/types/

# Build worker
WORKDIR /app/worker
RUN bun run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 worker

# Copy built files and dependencies
COPY --from=builder /app/worker/dist ./dist
COPY --from=builder /app/worker/node_modules ./node_modules

# Set permissions
RUN chown -R worker:nodejs /app

USER worker

CMD ["bun", "dist/index.js"]
