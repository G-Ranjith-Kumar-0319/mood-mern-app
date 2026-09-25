# syntax=docker/dockerfile:1
# Nginx image that serves the built React app and reverse-proxies /api to the Node instances.
# Build context: the repository root.
#   docker build -f nginx/Dockerfile -t expression-web .

ARG NODE_VERSION=24-alpine

# ---- 1. Build the static frontend ----
FROM node:${NODE_VERSION} AS client-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --workspace client --ignore-scripts
COPY client/ client/
# `prebuild` copies the face-api model weights into dist/models.
RUN npm run build --workspace client

# ---- 2. Unprivileged Nginx (runs as a non-root user, listens on 8080) ----
FROM nginxinc/nginx-unprivileged:1.29-alpine
ARG NGINX_CONF=nginx.conf
COPY nginx/${NGINX_CONF} /etc/nginx/conf.d/default.conf
COPY nginx/snippets/ /etc/nginx/snippets/
COPY --from=client-build /app/client/dist /usr/share/nginx/html
EXPOSE 8080
