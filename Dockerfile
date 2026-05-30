FROM node:20-alpine

# Build tools for native modules (better-sqlite3 requires python3, make, g++)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy all source first (.dockerignore excludes node_modules)
COPY . .

# Install root dependencies — compiles better-sqlite3 for Linux
RUN npm ci --omit=dev

# Install Playwright Chromium for live browser automation (used when BROWSER_SANDBOX=false)
RUN npx playwright install chromium --with-deps 2>/dev/null || true

# Build UI
RUN cd ui && npm ci && npm run build

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "scripts/start.js"]
