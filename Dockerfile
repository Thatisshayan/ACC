FROM node:20-alpine

# Build tools for native modules (better-sqlite3 requires python3, make, g++)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install root dependencies (including native module compilation)
COPY package*.json ./
RUN npm ci --omit=dev

# Build UI
COPY ui/package*.json ./ui/
RUN cd ui && npm ci

COPY ui/ ./ui/
RUN cd ui && npm run build

# Copy rest of app
COPY . .

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "scripts/start.js"]
