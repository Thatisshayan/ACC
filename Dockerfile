FROM node:18-alpine

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first (layer cache)
COPY package*.json ./

# Production deps only — do NOT install ui/ or run vite
RUN npm install --production --ignore-scripts

# Copy source (excluding what's in .dockerignore)
COPY . .

# Expose API port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start Express backend only — NOT vite, NOT ui
CMD ["node", "scripts/start.js"]
