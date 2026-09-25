# Deployment

Four ways to run the application, from simplest to most production-like.

| Mode                   | Command                                                   | URL                      | Includes                                                               |
| ---------------------- | --------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| Development            | `npm run dev`                                             | http://localhost:5173    | API + Vite; in-memory MongoDB (or yours)                               |
| Docker (local)         | `docker compose up --build`                               | http://localhost:8080    | Nginx, 2 APIs, MongoDB, Redis, Mailpit                                 |
| Docker + observability | `docker compose --profile observability up --build`       | + :9090 / :3000 / :16686 | + Prometheus, Grafana, Jaeger                                          |
| Production-style       | `docker compose -f docker-compose.prod.yml up --build -d` | https://localhost        | TLS, 3 APIs, 3-member authenticated replica set, Redis with a password |

## 1. Development

```bash
npm install
npm run setup:env        # creates .env with random JWT secrets (optional in dev)
npm run dev              # API on :5000 (tsx watch) + Vite on :5173
```

| Setting in `.env`                                             | Result                                                                                                                                                           |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MONGO_URI` empty/unset                                       | In-memory MongoDB **replica set** (transactions and live updates work). Data is lost on restart.                                                                 |
| `MONGO_URI=mongodb://localhost:27017/expression_detector`     | A MongoDB you run yourself. If it's standalone (not a replica set), live updates are disabled and account deletion runs without a transaction (both are logged). |
| `MONGO_URI=…:27017/expression_detector?directConnection=true` | The Compose `mongo` service (`docker compose up -d mongo`)                                                                                                       |
| `SMTP_HOST` empty                                             | Emails (verification/reset) are **printed in the API log**, so you can click the link                                                                            |
| `REDIS_URL` empty                                             | Rate-limit counters in process memory                                                                                                                            |

If port 27017 is taken (e.g. by a MongoDB Windows service), set `MONGO_HOST_PORT=27018` for Compose.

## 2. Docker (local, production-like)

```bash
npm run setup:env
docker compose up --build                # http://localhost:8080
docker compose up -d --scale api=3       # more API instances (Nginx picks them up automatically)
docker compose logs -f api               # JSON logs
docker compose down                      # keep data (-v deletes it)
```

| Service   | Purpose                                           | Host port                   |
| --------- | ------------------------------------------------- | --------------------------- |
| `nginx`   | app + reverse proxy + load balancer               | 8080                        |
| `api` × 2 | Node API (`NODE_ENV=production`)                  | —                           |
| `mongo`   | single-node replica set `rs0`                     | 127.0.0.1:`MONGO_HOST_PORT` |
| `redis`   | shared rate-limit counters                        | —                           |
| `mailpit` | catches email; **inbox at http://localhost:8025** | 127.0.0.1:8025              |

### Observability profile

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318 docker compose --profile observability up --build
```

- **Prometheus** http://localhost:9090: scrapes `/metrics` from every API replica (DNS discovery)
- **Grafana** http://localhost:3000: _Expression Detector → Expression API_ dashboard (provisioned)
- **Jaeger** http://localhost:16686: traces for service `expression-api`

Put `OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318` in `.env` if you use tracing regularly. Running
`docker compose up` without it recreates the API containers with tracing off.

## 3. Production-style stack

```bash
npm run setup:prod     # .env credentials (Mongo, Redis), secrets/mongo-keyfile, nginx/certs (self-signed)
docker compose -f docker-compose.prod.yml up --build -d --wait
# https://localhost   (ports busy? HTTP_PORT=8088 HTTPS_PORT=8443 …)
```

Adds: TLS (1.2/1.3, HTTP/2, HSTS, 80 → 443), 3 API replicas (256 MB limit each), MongoDB replica
set `rs0` with keyFile internal auth + a least-privilege app user (bootstrapped by
`mongo/replica-init.js`), Redis with `requirepass`, and SMTP via `SMTP_*` variables (without
`SMTP_HOST`, emails aren't sent and links are never logged). Only Nginx is published.

## 4. Verified behaviour

Checked against the running stacks:

| Check                                                   | Result                                                                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| HTTP → HTTPS, TLS                                       | `301` redirect; TLSv1.3; HSTS present                                                                                |
| Replica set / auth                                      | 1 PRIMARY + 2 SECONDARY; unauthenticated query and app user on `admin` → `Unauthorized`                              |
| **Stop the MongoDB primary**                            | `mongo2` elected; the next write returned `201`; mongo1 later rejoined as primary                                    |
| **Stop one API container**                              | 30/30 requests succeeded (Nginx retried on healthy instances)                                                        |
| **Scale API 2 → 3 → 2 (no Nginx restart)**              | 10/10/10 split; 0 of 60 requests failed while scaling down                                                           |
| **Shared rate limit (Redis)**, limit 20/min, 2 replicas | exactly 20 × `200` and 10 × `429` (each replica served 15); counter `rl:api:<ip>` in Redis                           |
| Readiness                                               | `{"database":"ok","redis":"ok"}` (local and prod)                                                                    |
| **SSE through Nginx** (HTTP and HTTPS)                  | a POST produced an immediate `event: detection.created` on an open stream                                            |
| **Mailpit**                                             | registration delivered "Verify your email address" with a `http://localhost:8080/verify-email?token=…` link          |
| **Prometheus / Grafana**                                | both API replicas `up`; the dashboard loaded with 9 panels                                                           |
| **Tracing**                                             | Jaeger listed `expression-api`; 110 spans (Express middleware, routes, Redis); log lines carried matching `trace_id` |
| Real browser (CSP on)                                   | model load and detection worked on the production build, including the Web Worker and offline mode                   |

## Real certificates

Replace `nginx/certs/fullchain.pem` / `privkey.pem` with a certificate for your domain (e.g. Let's
Encrypt) and set `PUBLIC_URL=https://your.domain`. The key must be readable by the Nginx container
user (uid 101) and nobody else. Without OpenSSL on PowerShell, generate a local certificate in Git Bash:

```bash
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout nginx/certs/privkey.pem -out nginx/certs/fullchain.pem \
  -subj /CN=localhost -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

## Going to a real cloud

1. **Database:** MongoDB Atlas (or three VMs in different zones); least-privilege user in `MONGO_URI`.
2. **API:** run `server/Dockerfile` on a container platform with ≥ 2 instances. Liveness
   `/api/v1/health/live`, readiness `/api/v1/health/ready`; `SIGTERM` is handled gracefully.
3. **Redis:** a managed Redis (e.g. ElastiCache / Memorystore) in `REDIS_URL`.
4. **Email:** your provider's SMTP in `SMTP_*`; `APP_URL` = the public URL.
5. **Edge:** `nginx/Dockerfile` behind a cloud load balancer (keep `proxy_buffering off` for the SSE
   route), or serve the static files from a CDN; `TRUST_PROXY_HOPS` = number of proxies.
6. **Observability:** scrape `/metrics` from inside the network; point `OTEL_EXPORTER_OTLP_ENDPOINT`
   at your collector; ship stdout JSON logs to CloudWatch/Loki.
7. **Secrets:** from the platform's secret manager, never in images.

## CI/CD

`.github/workflows/ci.yml` (push to `main`, pull requests):

1. **quality:** `npm ci` → Prettier → ESLint → `tsc` (all workspaces) → unit + integration tests → builds
2. **e2e** (after quality): Playwright Chromium → `npm run test:e2e` → HTML report on failure
3. **docker** (after quality): `setup:env` → `docker compose up --build --wait` → smoke tests → teardown

To add delivery, push the two images from `main` with `docker/build-push-action` and trigger your
platform's rollout.

## Environment variables

| Variable                                                                                 | Used by                     | Default                         | Notes                                                                                             |
| ---------------------------------------------------------------------------------------- | --------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                               | API                         | `development`                   | Set by Compose (`production`). **Don't put it in `.env`**, because Vite would build a dev bundle. |
| `PORT`                                                                                   | API                         | `5000`                          |                                                                                                   |
| `MONGO_URI`                                                                              | API                         | —                               | Required in production; empty in dev = in-memory replica set                                      |
| `MONGO_MAX_POOL_SIZE`                                                                    | API                         | `10`                            |                                                                                                   |
| `CLIENT_URL`                                                                             | API                         | `http://localhost:5173`         | CORS allowlist (comma-separated)                                                                  |
| `APP_URL`                                                                                | API                         | `http://localhost:5173`         | Base URL for links in emails                                                                      |
| `LOG_LEVEL`                                                                              | API                         | `info`                          |                                                                                                   |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`                                                | API                         | dev-only values                 | ≥ 32 chars, distinct, required in production                                                      |
| `ACCESS_TOKEN_TTL_SECONDS` / `REFRESH_TOKEN_TTL_SECONDS`                                 | API                         | `900` / `604800`                |                                                                                                   |
| `COOKIE_SECURE`                                                                          | API                         | `true` in production            |                                                                                                   |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`, `EMAIL_RATE_LIMIT_MAX`  | API                         | `60000`, `300`, `10`, `5`       |                                                                                                   |
| `REDIS_URL`                                                                              | API                         | —                               | Shared rate-limit counters (`redis://[:password@]host:6379`)                                      |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`           | API                         | —, `1025`, auto, —, —, no-reply | Email delivery                                                                                    |
| `ANONYMOUS_RETENTION_DAYS`                                                               | API                         | `30`                            | `0` keeps anonymous data forever                                                                  |
| `TRUST_PROXY_HOPS`                                                                       | API                         | `0`                             | `1` behind Nginx                                                                                  |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`                                       | API                         | —, `expression-api`             | Tracing (off when empty)                                                                          |
| `VITE_PERSIST_MIN_SEGMENT_MS` / `VITE_PERSIST_MAX_SEGMENT_MS`                            | Client (public, build time) | `2000` / `60000`                | Auto-save tuning                                                                                  |
| `MONGO_HOST_PORT`                                                                        | Compose                     | `27017`                         | Host port of the local `mongo`                                                                    |
| `MONGO_ROOT_*`, `MONGO_APP_*`, `REDIS_PASSWORD`, `PUBLIC_URL`, `HTTP_PORT`, `HTTPS_PORT` | Prod compose                | set by `setup:prod`             |                                                                                                   |
