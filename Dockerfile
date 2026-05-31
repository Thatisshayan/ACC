# ── Stage 1: Builder — builds UI, compiles native modules ──────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY ui/package*.json ./ui/
RUN cd ui && npm ci

COPY . .
RUN cd ui && npm run build

# ── Stage 2: Runtime — prod deps only + system Chromium for Playwright ──────
FROM node:20-alpine

# Native build tools (better-sqlite3) + system Chromium for Playwright
RUN apk add --no-cache \
  python3 make g++ \
  chromium nss freetype harfbuzz ca-certificates ttf-freefont

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
COPY --from=builder /app/ui/dist ./ui/dist

# Use system Chromium — skip Playwright's bundled download
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "scripts/start.js"]
