# syntax=docker/dockerfile:1
# Build context: the repository root (npm workspaces share one lockfile).
#   docker build -f server/Dockerfile -t expression-api .

ARG NODE_VERSION=24-alpine

# ---- 1. Install all server dependencies (incl. dev, needed to compile TypeScript) ----
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
# --ignore-scripts: no dependency needs an install script at build time
# (and it stops mongodb-memory-server from downloading a MongoDB binary).
RUN npm ci --workspace server --ignore-scripts

# ---- 2. Compile TypeScript → dist/ ----
FROM deps AS build
COPY server/ server/
RUN npm run build --workspace server

# ---- 3. Minimal runtime image: production deps + compiled JS only ----
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace server --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/server/dist server/dist

# Never run as root inside the container.
USER node
WORKDIR /app/server
EXPOSE 5000

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/api/v1/health/live > /dev/null || exit 1

# Run node directly (not via npm) so SIGTERM reaches the app for graceful shutdown.
# --import loads OpenTelemetry first (a no-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set).
CMD ["node", "--import", "./dist/instrumentation.js", "dist/server.js"]
