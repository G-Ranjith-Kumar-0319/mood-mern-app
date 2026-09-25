# Docker & Docker Compose — learning guide for this project

**Docker** packages each part of the system with its runtime into an _image_;
a running image is a _container_. **Docker Compose** describes several containers,
their networks and volumes in one YAML file and starts them together.

Files: [server/Dockerfile](../../server/Dockerfile), [nginx/Dockerfile](../../nginx/Dockerfile),
[.dockerignore](../../.dockerignore), [docker-compose.yml](../../docker-compose.yml),
[docker-compose.prod.yml](../../docker-compose.prod.yml)

---

## Dockerfile techniques used

| Technique                                                                 | Where             | Why                                                                                        |
| ------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------ |
| **Multi-stage builds** (`FROM … AS deps/build/runtime`)                   | both Dockerfiles  | Compilers and dev dependencies stay in build stages; the final image has only what runs    |
| Copy `package*.json` first, then `npm ci`, then the source                | server/Dockerfile | Layer caching: dependencies re-install only when the lockfile changes                      |
| `npm ci --workspace server --omit=dev --ignore-scripts`                   | runtime stage     | Reproducible install from the lockfile; no dev packages; no install scripts                |
| `ARG NODE_VERSION` / `ARG NGINX_CONF`                                     | both              | One Dockerfile, different builds (the prod Nginx config)                                   |
| `USER node` / `nginxinc/nginx-unprivileged`                               | both              | **Never run as root** inside containers                                                    |
| `HEALTHCHECK CMD wget … /health/live`                                     | server            | Docker knows when the API is healthy (Compose waits for it)                                |
| `CMD ["node", "--import", "./dist/instrumentation.js", "dist/server.js"]` | server            | Exec form: node is PID 1 and receives `SIGTERM` for graceful shutdown (not wrapped by npm) |
| `.dockerignore`                                                           | root              | Keeps `node_modules`, `.env`, `secrets/`, certs and `docs` out of the build context        |

The client isn't a separate container: the Nginx image builds the React app in a
Node stage and serves the static output ([ADR 0006](../decisions/0006-nginx-serves-frontend-and-balances-api.md)).

## Compose features used

| Feature                                                            | Example                                                                           |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `build` + `image`                                                  | builds and tags `expression-detector-api`                                         |
| `environment` with `${VAR:-default}` / `${VAR:?error}`             | defaults, and a **clear error** if a required secret is missing                   |
| `.env` interpolation                                               | secrets come from `.env`, never written in the YAML                               |
| `depends_on: condition: service_healthy`                           | the API starts only after MongoDB and Redis are healthy; Nginx only after the API |
| `healthcheck`                                                      | MongoDB's check also **initiates the replica set** on first boot                  |
| `deploy.replicas: 2` / `docker compose up --scale api=3`           | horizontal scaling                                                                |
| `ports: '127.0.0.1:27017:27017'`                                   | publish on loopback only (never expose a no-auth database)                        |
| `volumes: mongo-data:`                                             | data survives container restarts                                                  |
| `profiles: ['observability']`                                      | Prometheus/Grafana/Jaeger start only with `--profile observability`               |
| `secrets:` (prod)                                                  | the MongoDB keyfile mounted at `/run/secrets/…`                                   |
| YAML anchors `x-mongo-member: &mongo-member` + `<<: *mongo-member` | three MongoDB members share one definition                                        |
| `up --wait --wait-timeout`                                         | blocks until every container is healthy (used in CI)                              |

## The stacks

```text
docker-compose.yml       nginx:8080 → api ×2 → mongo (1-node replica set), redis, mailpit
                         (+ profile observability: prometheus, grafana, jaeger)
docker-compose.prod.yml  nginx:80/443 (TLS) → api ×3 → mongo1/2/3 (keyFile + users), redis (password)
```

## Things we learned the hard way

- **Port conflicts:** your Windows MongoDB service already used 27017, so the host
  port became configurable (`MONGO_HOST_PORT`).
- **Keyfile permissions:** mongod rejects keyfiles readable by others, and bind
  mounts keep host permissions. The entrypoint copies it with
  `install -m 400 -o mongodb` before starting mongod.
- **Recreating containers:** running `docker compose up` for one service can recreate
  its dependencies with _current_ shell variables. We lost `OTEL_EXPORTER_OTLP_ENDPOINT`
  that way once, so pass the same variables every time (or put them in `.env`).

## Everyday commands

```bash
docker compose up --build -d            # build + start in background
docker compose ps                       # state + health
docker compose logs -f api              # follow logs
docker compose exec mongo mongosh       # shell inside a container
docker compose down                     # stop (keep volumes)   | down -v to delete data
```

## Exercises

1. `docker image ls expression-detector-api`: compare its size with `node:24` (≈ 1 GB).
   Which Dockerfile choices made the difference?
2. Scale to 3 API replicas and watch `docker compose ps`. Does Nginx use the new one?
