# Architecture

This document explains how the pieces fit together and _why_ they are built this way.
Individual decisions are recorded in [`decisions/`](decisions/). Per-technology
explanations are in [`learning/`](learning/).

## 1. System overview

```text
┌──────────────────────────────── Browser (the user's device) ─────────────────────────────────┐
│                                                                                               │
│  Webcam ─► <video> ─► frame ─► [Web Worker] TinyFaceDetector ─► FaceExpressionNet             │
│ (getUserMedia)   (ImageBitmap,  (or main thread)   (face boxes)        (7 expression scores)  │
│                   ~5–15/s)                                  │                                 │
│                                                             ▼                                 │
│              FaceTracker (per-face identity) ─► ExpressionSmoother per face (window+hysteresis)│
│                                                             │                                 │
│        Emoji · label · confidence · face labels ◄───────────┤──► Session summary (local only) │
│                                                             └──► Segment tracker ─► auto-save  │
│  Service worker: app shell, worker & model weights cached → detection works offline           │
│  EventSource ◄── live "detection.created" events ─────────────────────────┐                    │
└───────────────────────────────────────────────────────────┬───────────────┼────────────────────┘
                              JSON only (label, confidence, time) — no pixels│
                                                            ▼  HTTPS        │ SSE
                                          ┌─────────────── Nginx ───────────┴──────┐
                                          │ TLS · static app · load balancer · CSP │
                                          └────┬───────────┬───────────┬───────────┘
                                               ▼           ▼           ▼
                                           API #1      API #2      API #3   (stateless Node/Express)
                                               │  change streams (each instance watches inserts)
                          ┌────────────────────┼──────────────┬──────────────┬───────────────┐
                          ▼                    ▼              ▼              ▼               ▼
              MongoDB replica set        Redis            SMTP (Mailpit   /metrics ◄──   OTLP traces ──►
              (data, TTL, transactions) (rate limits)      in dev)        Prometheus      Jaeger
```

**Key property:** camera frames never leave the browser. The server only ever receives
small JSON events such as `{ "expression": "happy", "confidence": 0.93, … }`.

## 2. Repository layout

| Path             | Purpose                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `client/`        | React + TypeScript + Vite SPA (MUI, React Router, TanStack Query), service worker, detection worker |
| `server/`        | Express 5 + TypeScript API (Mongoose, Zod, Pino, prom-client, OpenTelemetry)                        |
| `e2e/`           | Playwright end-to-end tests (fake camera, production build)                                         |
| `nginx/`         | Nginx image: builds the client, serves it, reverse-proxies/load-balances `/api`                     |
| `mongo/`         | Replica-set bootstrap/health script (production-style stack)                                        |
| `observability/` | Prometheus scrape config, Grafana data sources and dashboard                                        |
| `scripts/`       | `setup-env` (local secrets) and `setup-prod` (keyfile, credentials, TLS)                            |
| `docs/`          | This documentation, decision records, learning guides                                               |

npm workspaces (`client`, `server`, `e2e`) share one lockfile.

## 3. Frontend

### 3.1 Component tree

```text
App (TanStack Query · MUI theme + chart colour variables · BrowserRouter)
 └── AppLayout (nav · LiveIndicator (SSE) · UserMenu · OfflineBanner)
      ├── HomePage
      │    ├── PrivacyNotice · DetectorError
      │    ├── CameraView ── FaceOverlay (all faces) · PerformanceReadout
      │    ├── DetectorSettingsPanel
      │    ├── ExpressionResult ── ConfidenceIndicator
      │    ├── SaveControls · RecentDetections
      │    └── SessionSummaryDialog
      ├── HistoryPage (cursor "Load more") ── HistoryTable
      ├── DashboardPage ── ExpressionSummary · ExpressionChart · TrendChart
      ├── AccountPage (profile · retention · export · password · delete)
      ├── AuthPage (login / register) · VerifyEmail · ForgotPassword · ResetPassword
      └── NotFoundPage
```

Components render; logic lives in hooks and pure utilities:

| Module                                                                                             | Responsibility                                                                                       |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `hooks/useCamera`                                                                                  | `getUserMedia` (video only), start/stop, permission errors, stops every track, ignores stale prompts |
| `hooks/useDetectorSettings`                                                                        | model input size, analyses/second, multi-face, Web Worker, performance readout (localStorage)        |
| `hooks/useExpressionDetection`                                                                     | loads a backend, runs the frame loop, tracks faces, smooths, measures performance                    |
| `services/detectorFactory` → `expressionDetector` / `workerExpressionDetector` + `detector.worker` | where inference runs (worker preferred, main-thread fallback)                                        |
| `services/faceApiAnalysis`                                                                         | the only face-api calls, shared by both backends                                                     |
| `utils/faceTracker`                                                                                | follows faces between frames (IoU matching), one smoother per face, sticky primary face              |
| `utils/expressionSmoothing`                                                                        | adaptive sliding-window, confidence-weighted vote with hysteresis                                    |
| `utils/detectorViewState`                                                                          | camera + model + detection → one of 10 UI states                                                     |
| `utils/detectionSegments` + `hooks/useAutoSave`                                                    | stable segments → saved events                                                                       |
| `utils/sessionRecorder` + `hooks/useSessionSummary`                                                | time per expression in one session                                                                   |
| `hooks/useLiveUpdates`                                                                             | EventSource subscription → refresh cached server data                                                |
| `hooks/useExpressionHistory`, `useAuth`, `useAccount`                                              | server state (TanStack Query)                                                                        |

### 3.2 State management

No Redux. Server state (history feed, stats, trends, current user) lives in the
TanStack Query cache. Saving or deleting invalidates `['expressions']`; a live
event from the server does the same. Signing in or out resets it so identities never
mix. UI state is local React state; per-device preferences use localStorage.

### 3.3 The detection pipeline

1. **Model loading.** The first camera start downloads face-api (TF.js bundled, ~1.3 MB,
   lazy `import()`) and ~0.5 MB of first-party weights. The loader prefers a **Web Worker**:
   frames are captured with `createImageBitmap(video)` and _transferred_ (zero-copy) to the
   worker, which runs TF.js on WebGL through `OffscreenCanvas`. If the browser lacks those
   APIs or the worker fails, it falls back to the main thread. Both backends were measured at
   ~46–54 ms per frame on WebGL after warm-up ([ADR 0008](decisions/0008-web-worker-inference.md)).
2. **Frame scheduling.** A `setTimeout` loop targets the chosen rate (5/10/15 per second) and
   schedules the next run only after the previous one finishes, so slow devices self-throttle.
   Hidden tabs skip inference. Settings are read through a ref, so changing them never restarts the loop.
3. **Detection.** `detectSingleFace` (or `detectAllFaces` in multi-face mode)
   `.withFaceExpressions()` with the chosen detector input size (160–416).
4. **Tracking.** `FaceTracker` matches this frame's faces to known faces by box overlap
   (IoU ≥ 0.3), giving each face a stable id and its own smoother. The _primary_ face (drives the
   main panel and saving) is sticky: it changes only when it disappears.
5. **Smoothing** (§3.4) → **confidence threshold** (0.5 on the smoothed value → "low confidence").
6. **No face.** A face missing for longer than the grace period (700 ms, or 2.5× the observed
   frame gap on slow devices) clears the state and shows _No face detected_.
7. **Performance.** A rolling 2 s window reports analyses/second and mean model time; the
   readout also names the backend (Web Worker / main thread) and the TF.js backend (webgl/cpu).

### 3.4 Temporal smoothing strategy

`ExpressionSmoother` runs a **confidence-weighted vote**:

- Voters: predictions from the last **1 s**. On slow devices, when fewer than **3** fall inside that
  window, it uses the latest 3 that are at most 5 s old (the window adapts to the frame rate).
- First result: the plurality winner. After that, a _different_ expression replaces the current one
  only with **≥ 60 %** of the weighted vote (hysteresis).
- Reported confidence: the mean confidence of the winner's votes.

```text
Frame:     happy .92  happy .89  neutral .55  happy .91  happy .93
Shown:     —          —          happy        happy      happy       ← one odd frame never flips the UI
```

The adaptive part came from a real-browser test: at 3 s per inference, a pure 1 s window never
held 3 samples and nothing was ever shown ([ADR 0003](decisions/0003-temporal-smoothing.md)).

### 3.5 Persistence strategy

Nothing is saved unless the user enables **Auto-save** (stable ≥ 2 s segments, split at 60 s,
saved with `durationMs`) or presses **Save now**. That's at most about one write every 2 s
instead of ~10 per second ([ADR 0004](decisions/0004-persist-stable-segments.md)).

### 3.6 Offline (PWA)

A hand-written [service worker](../client/public/sw.js) (production builds only) caches the app
shell (network-first), hashed assets, the worker chunk and model weights (cache-first). It never
caches `/api`. After one online visit, the app reloads and detects offline; the offline banner
explains that saving and history need a connection. A web manifest and icons make it installable
([ADR 0014](decisions/0014-hand-written-service-worker.md)).

### 3.7 Live updates

`useLiveUpdates` keeps one `EventSource` open (`/api/v1/expressions/events`). When a detection is
saved (this tab, another tab, another device), the server pushes `detection.created`, and the
client invalidates the expression queries (debounced 300 ms), so history and dashboards refresh
by themselves ([ADR 0009](decisions/0009-live-updates-sse-change-streams.md)).

## 4. Backend

### 4.1 Request flow

```text
/metrics (Prometheus; not proxied by Nginx)
Request → pino-http (request id, latency) → metrics histogram → helmet → CORS allowlist
        → compression (skips event streams) → JSON body (10 KB) → cookies → Cache-Control: no-store
        → /api/v1/health (no rate limit) | rate limiter (Redis-backed when configured)
        → router → authenticate (optional) / requireAuth → validate (Zod)
        → controller → service → repository → Mongoose → MongoDB
        → errorHandler (single place errors become responses)
```

| Layer      | Example                                          | Rule                                                         |
| ---------- | ------------------------------------------------ | ------------------------------------------------------------ |
| Route      | `routes/*.routes.ts`                             | Wiring only                                                  |
| Validation | `schemas/*.schema.ts` + `middleware/validate.ts` | Strict Zod schemas; unknown keys rejected                    |
| Controller | `controllers/*.controller.ts`                    | Read validated input → call service → send envelope          |
| Service    | `services/*.service.ts`                          | Business rules (ownership, retention, stats shaping, tokens) |
| Repository | `repositories/*.repository.ts`                   | The only code that builds MongoDB queries                    |

### 4.2 Modules

| Area         | Files                                                                | Notes                                                                                  |
| ------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Detections   | expression.*                                                         | CRUD, page + **cursor** pagination, stats, **time-zone-aware trends** with gap filling |
| Live updates | `services/liveUpdates.ts`, `controllers/events.controller.ts`        | One change stream per instance → SSE to that owner's browsers                          |
| Auth         | auth.*, `services/token.service.ts`                                  | JWT cookies, refresh, revocation, email verification, password reset                   |
| Account      | account.*                                                            | Retention (TTL), streamed JSON export, password change, transactional delete           |
| Email        | `services/mailer.ts`, `emailTemplates.ts`, `oneTimeToken.service.ts` | SMTP / log / memory / disabled modes; hashed single-use tokens                         |
| Platform     | `config/*`, `observability/metrics.ts`, `instrumentation.ts`         | env validation, Mongo/Redis connections, metrics, tracing                              |

### 4.3 Errors

`AppError` is an expected, client-safe error with a status and a stable `code`. `toAppError()` maps
library errors (invalid JSON, oversized body, cast/validation errors, duplicate keys, database
unavailable). Anything else becomes a generic 500; the stack trace goes to the log with the request id.

### 4.4 Statelessness and horizontal scaling

No API instance keeps user data in memory. Sessions are signed cookies, data is in MongoDB,
rate-limit counters are in Redis (when configured), and live updates reach every instance through
MongoDB change streams. Nginx re-resolves the API service name every 10 s, so `--scale api=N`
takes effect without restarting it. Verified: scaling 2 → 3 gave a 10/10/10 split, and scaling
back down lost 0 of 60 requests.

### 4.5 Observability

- **Logs:** Pino JSON, one line per request (`req.id`, status, `responseTime`); secrets redacted.
  With tracing on, every line also has `trace_id`/`span_id`.
- **Request ids:** Nginx `$request_id` → API log → `X-Request-Id` response header.
- **Metrics:** `GET /metrics`: request-latency histogram by route _pattern_, detections saved, live
  subscribers, and Node process metrics. Prometheus discovers every replica through DNS; Grafana
  has a provisioned dashboard ([ADR 0012](decisions/0012-observability-metrics-and-tracing.md)).
- **Traces:** OpenTelemetry auto-instrumentation (HTTP, Express, MongoDB, Mongoose, Redis, Pino),
  opt-in via `OTEL_EXPORTER_OTLP_ENDPOINT` → Jaeger.
- **Health:** `/health`, `/health/live`, `/health/ready` (MongoDB required, Redis reported).
- **Graceful shutdown:** end SSE streams → stop accepting → finish in-flight → close Redis and
  MongoDB → exit (10 s safety net).

## 5. Infrastructure

See [deployment.md](deployment.md) and [database.md](database.md).

- **Nginx:** TLS (prod), static files with cache rules, `/api` proxy with keep-alive and retries,
  an **unbuffered SSE location**, security headers + strict CSP, 16 KB body limit.
- **Keep-alive tuning:** Node's `keepAliveTimeout` (65 s) exceeds Nginx's (60 s) to avoid sporadic 502s.
- **Containers:** multi-stage builds that run as non-root; the API image starts with
  `node --import ./dist/instrumentation.js`.
- **Compose:** local (Nginx, 2 APIs, MongoDB, Redis, Mailpit, optional observability profile) and
  production-style (TLS, 3 APIs, 3-member authenticated replica set, password-protected Redis).
- **CI:** quality (format, lint, types, tests, build) → E2E (Playwright) and Docker smoke tests.
