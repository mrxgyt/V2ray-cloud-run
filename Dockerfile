# ─── Stage 1: Node deps ───────────────────────────────────────
FROM node:20-alpine AS node-deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

# ─── Stage 2: Final image ─────────────────────────────────────
FROM teddysun/v2ray:latest

# Install Node.js (Alpine-compatible)
RUN apk add --no-cache nodejs npm

# Copy V2Ray config
COPY config.json /etc/v2ray/config.json

# Copy Node.js panel
WORKDIR /app
COPY --from=node-deps /app/node_modules ./node_modules
COPY panel.js .
COPY public ./public

# Copy startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Panel port (HTTP) — Northflank will expose this via HTTPS
EXPOSE 3000
# V2Ray internal WebSocket port
EXPOSE 8080

ENV PANEL_PORT=3000

CMD ["/start.sh"]
