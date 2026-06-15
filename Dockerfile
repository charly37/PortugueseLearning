# ==================== BUILDER STAGE ====================
FROM node:26-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

RUN npm run build


# ==================== PRODUCTION STAGE ====================
FROM node:26-alpine

# Create non-root user
RUN addgroup -g 1000 appuser && \
    adduser -u 1000 -G appuser -D appuser

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies (as root)
RUN npm ci --only=production

# Copy built files from builder stage with correct ownership
COPY --from=builder --chown=appuser:appuser /app/dist ./dist
COPY --from=builder --chown=appuser:appuser /app/public ./public

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start the application
CMD ["node", "dist/server.js"]