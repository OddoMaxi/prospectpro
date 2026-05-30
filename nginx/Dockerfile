# Stage 1 — build React frontend
FROM node:20-alpine AS builder
WORKDIR /build
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
# VITE_API_URL=/api signifie que le frontend appelle /api sur le même domaine
# Nginx se charge du proxy vers le backend
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Stage 2 — nginx servant les fichiers statiques
FROM nginx:1.25-alpine
COPY --from=builder /build/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80 443
