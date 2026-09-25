# 😊 AI Facial Expression Detector

A full-stack MERN + TypeScript application that uses your webcam to **estimate visible facial
expressions in the browser** and shows a matching emoji, with optional history, statistics, trends
and live updates backed by MongoDB.

> This application estimates visible facial expressions using an AI model. It does not determine
> or diagnose a person's actual emotional or mental state.

**Privacy by design:** video is analysed on your device with TensorFlow.js (in a background Web
Worker). Camera frames are never uploaded, stored or logged. Only a label, a confidence and a time
are saved, and only if you choose to save them.

📚 **New to a technology used here?** Start with the **[learning guides](docs/learning/)**: one
per technology (React, Express, MongoDB, Docker, …), explaining every API this project uses and why.

---

## Contents

1. [What it does](#1-what-it-does)
2. [Architecture](#2-architecture)
3. [Technology stack](#3-technology-stack)
4. [Project structure](#4-project-structure)
5. [Local setup](#5-local-setup)
6. [Environment variables](#6-environment-variables)
7. [Running the frontend](#7-running-the-frontend)
8. [Running the backend](#8-running-the-backend)
9. [Running MongoDB](#9-running-mongodb)
10. [Running with Docker](#10-running-with-docker)
11. [Testing](#11-testing)
12. [Production deployment](#12-production-deployment)
13. [Privacy considerations](#13-privacy-considerations)
14. [Known limitations](#14-known-limitations)
15. [Documentation map](#15-documentation-map)

---

## 1. What it does

**Detection (in the browser)**

- Start/stop the webcam (video only, never the microphone) with a visible _Camera on_ indicator.
- Detects faces and classifies **7 visible expressions** (neutral, happy, sad, angry, fearful,
  disgusted, surprised). These are exactly the classes the model supports.
- **Multi-face mode:** every face gets its own box, label and smoothing (faces are tracked between frames).
- **Temporal smoothing** so the display doesn't flicker; _No face detected_ and _Low confidence_ states.
- **Detection settings:** model accuracy (input size), analyses per second, multi-face, Web Worker
  on/off, and a live **FPS / latency readout** (it also shows WebGL vs CPU).
- **Runs in a Web Worker** so the page stays smooth, with an automatic main-thread fallback.
- **Session summary** when you stop the camera: time per expression (never saved).
- **Works offline** after the first visit (installable PWA; the model is cached by a service worker).

**Data (optional)**

- _Save now_ or _Auto-save_ stable expression segments (never every frame).
- **History** with filtering, deletion and fast **cursor-based "Load more"**.
- **Dashboard:** statistics plus a **trend chart** over time (hour/day/month buckets in _your_ time zone).
- **Live updates:** save in one tab or device and every open page refreshes (Server-Sent Events).

**Accounts (optional)**

- Register / sign in; **email verification**; **forgot / reset password** (emails via Mailpit locally).
- **Account page:** data retention (auto-delete after 7/30/90/365 days), **export all your data**
  (JSON), change password (signs out other devices), **delete account** and all data.

Responsive, light/dark from the OS, keyboard and screen-reader friendly.

## 2. Architecture

```text
Browser: Webcam → [Web Worker] face detection → expressions → tracking + smoothing → emoji
         Service worker (offline) · EventSource (live updates)
                              │ small JSON events only                     ▲ SSE
                              ▼                                             │
         Nginx (TLS · static app · load balancer · CSP) → Node API ×N (stateless)
                                                             │  change streams
              MongoDB replica set · Redis (rate limits) · SMTP · Prometheus/Grafana · Jaeger
```

- Frontend logic lives in hooks and pure utilities; components only render.
- The backend is layered: **Route → Zod validation → Controller → Service → Repository → Mongoose**.
- API instances hold no state (JWT cookies, MongoDB, Redis counters), so they scale horizontally;
  change streams deliver live events to whichever instance a browser is connected to.

Full details: **[docs/architecture.md](docs/architecture.md)** · decisions: **[docs/decisions/](docs/decisions/)**

## 3. Technology stack

| Area             | Technologies                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------- |
| Frontend         | React 19, TypeScript, Vite, React Router, Material UI, TanStack Query                        |
| Browser platform | getUserMedia, Web Workers + OffscreenCanvas, Service Worker, EventSource (SSE)               |
| Computer vision  | `@vladmandic/face-api` (TensorFlow.js): TinyFaceDetector + FaceExpressionNet                 |
| Backend          | Node.js 24, Express 5, TypeScript, Mongoose 9, Zod, Helmet, CORS, express-rate-limit         |
| Auth & email     | bcrypt, JWT (access + refresh) in HttpOnly cookies, hashed one-time email tokens, Nodemailer |
| Data             | MongoDB 8 (replica set: transactions, TTL, change streams), Redis (shared rate limits)       |
| Observability    | Pino logs, Prometheus + Grafana (prom-client), OpenTelemetry + Jaeger                        |
| Testing          | Vitest, React Testing Library, Supertest, mongodb-memory-server, Playwright                  |
| Infrastructure   | Docker (multi-stage, non-root), Docker Compose, Nginx, Mailpit, GitHub Actions               |

## 4. Project structure

```text
.
├── client/                    React app
│   ├── public/                sw.js (service worker), manifest, icons, models/ (copied weights)
│   └── src/
│       ├── app/               App, routes, theme, QueryClient, service-worker registration
│       ├── components/        Camera, FaceOverlay, ExpressionResult, DetectorSettings, Dashboard
│       │                      (charts), History, Layout (live/offline), SessionSummary, …
│       ├── pages/             Home, History, Dashboard, Account, Auth (+ email-link pages)
│       ├── hooks/             useCamera, useExpressionDetection, useDetectorSettings, useAutoSave,
│       │                      useLiveUpdates, useSessionSummary, useAuth, useAccount, …
│       ├── services/          apiClient, APIs, detector (main thread + worker + factory)
│       ├── utils/             smoothing, face tracker, segments, performance, chart scales, …
│       └── constants/ types/
├── server/
│   ├── src/
│   │   ├── config/            env (validated), logger, database, redis
│   │   ├── routes/ controllers/ services/ repositories/ models/ schemas/ middleware/
│   │   ├── observability/     Prometheus metrics
│   │   ├── instrumentation.ts OpenTelemetry (loaded with --import)
│   │   ├── app.ts / server.ts
│   └── tests/                 unit + integration (in-memory MongoDB replica set)
├── e2e/                       Playwright tests (fake camera, production build)
├── nginx/                     Dockerfile, nginx.conf, nginx.prod.conf (TLS), snippets/
├── observability/             prometheus.yml, Grafana provisioning + dashboard
├── mongo/replica-init.js      replica-set bootstrap (prod compose)
├── scripts/                   setup-env.mjs, setup-prod.mjs
├── docs/                      architecture, api, database, security, deployment, decisions/, learning/
├── docker-compose.yml         local stack (+ observability profile)
├── docker-compose.prod.yml    production-style stack
└── .github/workflows/ci.yml   quality → e2e + Docker smoke test
```

## 5. Local setup

**Prerequisites:** Node.js ≥ 22.12 (developed on 24), npm ≥ 10, optionally Docker Desktop, a webcam
and a recent Chrome, Edge, Firefox or Safari.

```bash
npm install
npm run dev
```

Open **http://localhost:5173** and press **Start camera**. Without a `.env` file the API uses a
throw-away **in-memory MongoDB replica set**, and emails are printed in the API log.

| Script                                                      | What it does                               |
| ----------------------------------------------------------- | ------------------------------------------ |
| `npm run dev`                                               | API (:5000) + Vite (:5173) with hot reload |
| `npm run setup:env`                                         | Create `.env` with random JWT secrets      |
| `npm run lint` / `typecheck` / `test` / `build`             | All workspaces                             |
| `npm run test:e2e`                                          | Playwright end-to-end tests                |
| `npm run validate`                                          | What CI's quality job runs                 |
| `npm run docker:up` / `docker:down`                         | Local Docker stack                         |
| `npm run setup:prod`, `docker:prod:up` / `docker:prod:down` | Production-style stack                     |

## 6. Environment variables

One root **`.env`** (never committed). Create it with `npm run setup:env` or copy
[`.env.example`](.env.example). The most important variables:

| Variable                                   | Default                           | Purpose                                   |
| ------------------------------------------ | --------------------------------- | ----------------------------------------- |
| `MONGO_URI`                                | _(empty → in-memory in dev)_      | Required in production                    |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | dev-only fallbacks                | ≥ 32 random chars in production           |
| `CLIENT_URL` / `APP_URL`                   | `http://localhost:5173`           | CORS allowlist / base URL for email links |
| `SMTP_HOST` (+ `SMTP_*`, `MAIL_FROM`)      | _(empty → emails logged in dev)_  | Email delivery                            |
| `REDIS_URL`                                | _(empty → per-instance counters)_ | Shared rate limits                        |
| `ANONYMOUS_RETENTION_DAYS`                 | `30`                              | Auto-delete anonymous detections          |
| `OTEL_EXPORTER_OTLP_ENDPOINT`              | _(empty → tracing off)_           | OpenTelemetry                             |

⚠️ Don't put `NODE_ENV` in `.env`: Vite reads the same file and would build a development bundle.
Full table: [docs/deployment.md](docs/deployment.md#environment-variables).

## 7. Running the frontend

```bash
npm run dev -w client        # http://localhost:5173 (proxies /api to :5000)
npm run build -w client      # production build (client/dist, with service worker)
npm run preview -w client    # serve the build locally
```

The first _Start camera_ downloads the model (~1.8 MB, then cached). Camera access needs **HTTPS or localhost**.

## 8. Running the backend

```bash
npm run dev -w server                              # tsx watch, pretty logs
npm run build -w server && npm start -w server     # compiled JS
curl http://localhost:5000/api/v1/health
```

API reference: **[docs/api.md](docs/api.md)**

## 9. Running MongoDB

```bash
# a) Nothing: leave MONGO_URI empty → in-memory replica set (development only)
# b) Docker Compose: docker compose up -d mongo
#    MONGO_URI=mongodb://localhost:27017/expression_detector?directConnection=true
# c) Your own MongoDB: MONGO_URI=mongodb://localhost:27017/expression_detector
#    (standalone servers work, but live updates are disabled)
```

Schema, indexes, TTL retention, transactions and change streams: **[docs/database.md](docs/database.md)**

## 10. Running with Docker

```bash
npm run setup:env
docker compose up --build                            # http://localhost:8080 · Mailpit http://localhost:8025
docker compose --profile observability up --build    # + Prometheus :9090, Grafana :3000, Jaeger :16686
```

Nginx, **2 API replicas**, MongoDB, Redis and Mailpit. Scale with `docker compose up -d --scale api=3`;
Nginx picks up new replicas automatically.

## 11. Testing

```bash
npm test                # server (Supertest + in-memory MongoDB) + client (Vitest + RTL)
npm run test:e2e        # Playwright: real Chromium, fake camera, production build
```

| Suite      | Count | Highlights                                                                                                                                                                       |
| ---------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server     | 107   | validation, auth & authorization, email tokens, retention/TTL, transactions, cursor pagination, trends across time zones, SSE owner isolation, metrics, `explain()` index checks |
| Client     | 115   | camera lifecycle, smoothing/tracking, settings, pages, API client refresh, live updates, offline banner                                                                          |
| End-to-end | 8     | face detection, multi-face in the Web Worker, session summary, no-face, cursor paging, live updates, dashboard, **offline detection**                                            |

Tests never touch a developer's database or real email.

## 12. Production deployment

```bash
npm run setup:prod                                        # credentials, keyfile, Redis password, self-signed TLS
docker compose -f docker-compose.prod.yml up --build -d   # https://localhost
```

TLS + HSTS, 3 API replicas, a 3-member authenticated MongoDB replica set, and password-protected
Redis. Primary failover, API-instance failure, live scaling, shared rate limiting, SSE over TLS and
tracing were all verified. CI runs quality checks, E2E and a Docker smoke test on every push and PR.
Details: **[docs/deployment.md](docs/deployment.md)**

## 13. Privacy considerations

- Inference runs **in the browser**; no endpoint accepts images, and extra fields are rejected.
- No microphone; visible camera indicator; all camera tracks stopped on stop/leave.
- **Nothing is saved by default.** The session summary is never saved.
- The service worker never caches API data.
- Your data, your control: **retention**, **export**, **delete account**.
- Anonymous saves are shared on that server and auto-deleted after 30 days.

More: **[docs/security.md](docs/security.md)**

## 14. Known limitations

- **Expressions are not emotions.** The model sees facial muscle patterns only.
- The model is small and fast, not state of the art; accuracy drops with poor lighting, head turns
  and occlusion, and may be uneven across demographics.
- Live updates push new detections only (deletions made elsewhere appear on the next refresh), and
  need a MongoDB replica set.
- Access tokens remain valid up to 15 minutes after revocation (stateless by design).
- Offline detection needs one online session with the camera first (to cache the model).
- `@vladmandic/face-api` was last published in early 2025; it's isolated behind one module
  ([ADR 0002](docs/decisions/0002-browser-inference-with-face-api.md)).

## 15. Documentation map

| Document                                     | Contents                                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [docs/learning/](docs/learning/)             | **Learning guides**: one per technology (`React-docs.md`, `Express-docs.md`, `MongoDB-docs.md`, …) |
| [docs/architecture.md](docs/architecture.md) | How everything fits together                                                                       |
| [docs/api.md](docs/api.md)                   | Every endpoint                                                                                     |
| [docs/database.md](docs/database.md)         | Collections, indexes, retention, transactions, change streams                                      |
| [docs/security.md](docs/security.md)         | Privacy, auth, hardening checklist                                                                 |
| [docs/deployment.md](docs/deployment.md)     | Running, verification results, environment variables, CI                                           |
| [docs/decisions/](docs/decisions/)           | 14 architecture decision records                                                                   |
