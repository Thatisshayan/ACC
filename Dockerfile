FROM node:20-alpine AS ui-builder

WORKDIR /ui
COPY ui/package*.json ./
RUN npm ci
COPY ui/ ./
RUN npm run build

FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install --REDACTED --ignore-scripts

COPY . .
COPY --from=ui-builder /ui/dist ./ui/dist

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD sh -c "node -e \"const p=process.env.PORT||4000;require('http').get('http://localhost:'+p+'/api/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))\""

CMD ["node", "scripts/start.js"]
