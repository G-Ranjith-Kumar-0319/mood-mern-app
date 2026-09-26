# syntax=docker/dockerfile:1
# Single-service image for Render (or any host without Nginx in front):
# one Node process serves the React build, the REST API and Socket.IO signaling
# from one HTTPS origin. Render terminates TLS, so wss:// and the phone camera work.
# Build context: the repository root.
#   docker build -f render/Dockerfile -t expression-detector-render .

ARG NODE_VERSION=24-alpine

# ---- 1. Frontend build ----
FROM node:${NODE_VERSION} AS client-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --workspace client --ignore-scripts
COPY client/ client/
# `prebuild` copies the face-api model weights into dist/models.
RUN npm run build --workspace client

# ---- 2. Backend build ----
FROM node:${NODE_VERSION} AS server-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace server --ignore-scripts
COPY server/ server/
RUN npm run build --workspace server

# ---- 3. Runtime: production deps + compiled server + static client ----
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace server --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=server-build /app/server/dist server/dist
COPY --from=client-build /app/client/dist client-dist
ENV SERVE_CLIENT_DIR=/app/client-dist

USER node
WORKDIR /app/server
# Render injects PORT (default 10000); the server reads it.
EXPOSE 10000
CMD ["node", "--import", "./dist/instrumentation.js", "dist/server.js"]
