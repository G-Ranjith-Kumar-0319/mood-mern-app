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

## Render (single service, free tier)

The quickest public HTTPS deployment, and the easiest way to use the **phone camera** from any
network. One Render Web Service runs one Node process that serves the React build
(`SERVE_CLIENT_DIR`), the REST API and Socket.IO signaling on one origin, e.g.
`https://mood-mern.onrender.com`. Files: [`render.yaml`](../render.yaml) (Blueprint) and
[`render/Dockerfile`](../render/Dockerfile).

```text
Browser / phone ──HTTPS + WSS──► Render (TLS) ──► Node: React build · /api · /socket.io
                                                     └──► MongoDB Atlas (replica set)
Phone ═══════════ WebRTC video (direct, or via TURN) ═══════════► Laptop browser
```

1. **MongoDB Atlas** (free M0): create a cluster, add a database user, and under _Network Access_
   allow `0.0.0.0/0` (Render's free tier has no fixed outbound IPs). Copy the connection string
   and add the database name:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/expression_detector?retryWrites=true&w=majority`.
   Atlas is a replica set, so change streams (live updates) and transactions work.
2. **Render**: _New → Blueprint_, connect the GitHub repo, pick the branch. Render reads
   `render.yaml`, generates both JWT secrets, and asks for `MONGO_URI` (paste it). Leave the
   TURN values empty for now.
3. Wait for the first deploy (the Docker build takes a few minutes), then open the `onrender.com`
   URL. `APP_URL` and the QR-code URL default to Render's `RENDER_EXTERNAL_URL`, so the QR code
   already points at the public HTTPS address.

Notes:

- **Free tier sleeps** after ~15 minutes without traffic; the first request then takes up to a
  minute. Open the page on the laptop _before_ scanning the QR code.
- **One instance**, so there is no sticky-routing concern for Socket.IO. For several instances,
  put Nginx with the `sessionId` hash in front (see [phone-camera-webrtc.md](phone-camera-webrtc.md#6-production-docker--nginx--https--stunturn--node)).
- **TURN**: Render cannot host a TURN server (no UDP). For phones on mobile data or strict
  networks, use a hosted TURN service and set `TURN_SERVER`, `TURN_USERNAME`, `TURN_CREDENTIAL`
  in the Render dashboard (redeploy). The API refuses to start if `TURN_SERVER` is set without
  credentials.
- **Email**: see [Email with Gmail](#email-with-gmail-free-works-on-render) below. Render's
  free tier blocks outbound SMTP (ports 25/465/587), so Gmail SMTP times out there, but the
  Gmail API (HTTPS) works.
- Test the image locally the way Render runs it:
  `docker build -f render/Dockerfile -t expression-detector-render .` then
  `docker run -p 10000:10000 -e PORT=10000 -e MONGO_URI=… -e JWT_ACCESS_SECRET=… -e JWT_REFRESH_SECRET=… expression-detector-render`.

## Email with Gmail (free, works on Render)

The API can send verification and password-reset emails from your Gmail account through the
**Gmail API over HTTPS** (`server/src/services/gmailApi.ts`). No SMTP port is involved, so it works
on Render's free tier. Gmail allows roughly 500 emails/day from a personal account, and messages
come from a real Gmail address, so they rarely land in spam. The app only gets the `gmail.send`
permission: it can send mail as you, not read your mailbox.

**1. Google Cloud (once, ~5 minutes)** at [console.cloud.google.com](https://console.cloud.google.com):

1. Create a project (any name).
2. _APIs & Services → Library_: search **Gmail API** → **Enable**.
3. _APIs & Services → OAuth consent screen_ (Google Auth Platform): app name, your email as
   support/developer contact, audience **External**. Add your Gmail address as a **test user**.
4. **Publish the app** (_Audience → Publish app_ → "In production"). Otherwise Google expires the
   refresh token after 7 days. Verification by Google is not needed for your own account; you
   will just see an "unverified app" warning once.
5. _Credentials → Create credentials → OAuth client ID_ → type **Desktop app**. Copy the
   **Client ID** and **Client secret**.

**2. Get the refresh token (on your laptop):**

```bash
# put GMAIL_CLIENT_ID=… and GMAIL_CLIENT_SECRET=… in the root .env, then:
npm run gmail:token
```

Open the printed URL, sign in with the Gmail account that should send the emails, allow
"Send email on your behalf". (On "Google hasn't verified this app": _Advanced → Go to … (unsafe)_,
since it is your own app.) The terminal prints `GMAIL_REFRESH_TOKEN=…`.

**3. Render** → your service → _Environment_: set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
`GMAIL_REFRESH_TOKEN` and `MAIL_FROM=Mood Detector <that-address@gmail.com>`, then _Save, rebuild,
and deploy_. The log shows `Email ready` (via "Gmail API") at startup. If it shows
`invalid_grant`, the refresh token was revoked or expired: run `npm run gmail:token` again.

Treat the client secret and refresh token like passwords: only in Render/`.env`, never in Git. To
revoke access: [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

Other options: any SMTP provider via `SMTP_*` (on Render's free tier it must accept port 2525,
e.g. Mailjet `in-v3.mailjet.com` or SMTP2GO `mail.smtp2go.com`), or Gmail SMTP with an _app
password_ (`smtp.gmail.com:465`) on hosts that allow SMTP.

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

| Variable                                                                                 | Used by                     | Default                         | Notes                                                                                                 |
| ---------------------------------------------------------------------------------------- | --------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                               | API                         | `development`                   | Set by Compose (`production`). **Don't put it in `.env`**, because Vite would build a dev bundle.     |
| `PORT`                                                                                   | API                         | `5000`                          |                                                                                                       |
| `MONGO_URI`                                                                              | API                         | —                               | Required in production; empty in dev = in-memory replica set                                          |
| `MONGO_MAX_POOL_SIZE`                                                                    | API                         | `10`                            |                                                                                                       |
| `CLIENT_URL`                                                                             | API                         | `http://localhost:5173`         | CORS allowlist (comma-separated)                                                                      |
| `APP_URL`                                                                                | API                         | `http://localhost:5173`         | Base URL for links in emails and (in production) the phone-camera QR code                             |
| `SERVE_CLIENT_DIR`                                                                       | API                         | —                               | Serve the React build from Node (single-service hosting such as Render); unset behind Nginx           |
| `CAMERA_SESSION_TTL_SECONDS`, `PHONE_CAMERA_URL`, `CAMERA_SESSION_RATE_LIMIT_MAX`        | API                         | `600`, empty, `30`              | Phone camera pairing; see [phone-camera-webrtc.md §3](phone-camera-webrtc.md#3-environment-variables) |
| `STUN_SERVER`, `TURN_SERVER`, `TURN_USERNAME`, `TURN_CREDENTIAL`, `TURN_SHARED_SECRET`   | API                         | Google STUN, no TURN            | ICE servers handed to browsers per session; **TURN is needed in production**                          |
| `LOG_LEVEL`                                                                              | API                         | `info`                          |                                                                                                       |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`                                                | API                         | dev-only values                 | ≥ 32 chars, distinct, required in production                                                          |
| `ACCESS_TOKEN_TTL_SECONDS` / `REFRESH_TOKEN_TTL_SECONDS`                                 | API                         | `900` / `604800`                |                                                                                                       |
| `COOKIE_SECURE`                                                                          | API                         | `true` in production            |                                                                                                       |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`, `EMAIL_RATE_LIMIT_MAX`  | API                         | `60000`, `300`, `10`, `5`       |                                                                                                       |
| `REDIS_URL`                                                                              | API                         | —                               | Shared rate-limit counters (`redis://[:password@]host:6379`)                                          |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`           | API                         | —, `1025`, auto, —, —, no-reply | Email delivery                                                                                        |
| `ANONYMOUS_RETENTION_DAYS`                                                               | API                         | `30`                            | `0` keeps anonymous data forever                                                                      |
| `TRUST_PROXY_HOPS`                                                                       | API                         | `0`                             | `1` behind Nginx                                                                                      |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`                                       | API                         | —, `expression-api`             | Tracing (off when empty)                                                                              |
| `VITE_PERSIST_MIN_SEGMENT_MS` / `VITE_PERSIST_MAX_SEGMENT_MS`                            | Client (public, build time) | `2000` / `60000`                | Auto-save tuning                                                                                      |
| `MONGO_HOST_PORT`                                                                        | Compose                     | `27017`                         | Host port of the local `mongo`                                                                        |
| `MONGO_ROOT_*`, `MONGO_APP_*`, `REDIS_PASSWORD`, `PUBLIC_URL`, `HTTP_PORT`, `HTTPS_PORT` | Prod compose                | set by `setup:prod`             |                                                                                                       |
