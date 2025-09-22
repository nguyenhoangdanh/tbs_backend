# Use Node.js 18 Alpine for smaller image size
FROM node:18-alpine AS base

# Install dependencies needed for Prisma and compilation
RUN apk add --no-cache libc6-compat openssl

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy package files
COPY package.json ./

# Generate pnpm-lock.yaml if it doesn't exist, then install dependencies
RUN if [ ! -f pnpm-lock.yaml ]; then \
        echo "Generating pnpm-lock.yaml..." && \
        pnpm install --lockfile-only; \
    fi

# Install all dependencies (including dev dependencies for build)
RUN pnpm install --no-frozen-lockfile

# Copy prisma schema
COPY prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# Production stage
FROM node:18-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache libc6-compat openssl

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy package files
COPY package.json ./

# Install only production dependencies without lockfile requirement
RUN pnpm install --prod --no-frozen-lockfile

# Copy prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy built application
COPY --from=base /app/dist ./dist

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Change ownership of app directory
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose port
EXPOSE 8080

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["node", "dist/src/main.js"]
