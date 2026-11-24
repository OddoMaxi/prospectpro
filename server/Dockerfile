# Prospect Pro – serveur cible et interface (contexte de construction : racine du dépôt).
# docker build -f server/Dockerfile -t prospectpro .

# 1. Interface (web/)
FROM node:26-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# 2. Serveur (server/) : compilation TypeScript, puis dépendances de production seules
FROM node:26-alpine AS serveur
WORKDIR /server
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/ ./
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

# 3. Image d'exécution
FROM node:26-alpine
ENV NODE_ENV=production PORT=4100 WEB_DIR=/app/web/dist STOCKAGE_DIR=/app/stockage
WORKDIR /app/server
COPY --from=serveur /server/package.json ./
COPY --from=serveur /server/node_modules ./node_modules
COPY --from=serveur /server/dist ./dist
COPY --from=serveur /server/migrations ./migrations
COPY --from=web /web/dist /app/web/dist
RUN mkdir -p /app/stockage && chown node:node /app/stockage
USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD wget -qO- http://127.0.0.1:4100/api/sante || exit 1
CMD ["node", "dist/index.js"]
