# Security & Privacy

## Product statement

> This application estimates visible facial expressions using an AI model. It does not determine
> or diagnose a person's actual emotional or mental state.

The UI says "Detected expression", never "mood" or "emotion". Emojis and the session summary are
presentation only.

## Camera and biometric privacy

| Commitment                           | How it is enforced                                                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Video is analysed on the device      | TensorFlow.js runs in the browser (main thread or a Web Worker). Frames go to the worker as in-memory bitmaps, never over the network. No endpoint accepts images. |
| Microphone is never requested        | `getUserMedia({ audio: false, … })` (unit-tested); Nginx sends `Permissions-Policy: microphone=()`                                                                 |
| Camera is released when not needed   | Every `MediaStreamTrack` is stopped on Stop and unmount (tested); stale permission prompts are discarded                                                           |
| Camera use is visible                | "Camera on" badge + "Camera status: On" text                                                                                                                       |
| Frames are never stored or uploaded  | Only label, confidence, time and duration are sent; strict schemas reject extra fields like `image` (tested)                                                       |
| Nothing is saved by default          | Auto-save is off; "Save now" is explicit                                                                                                                           |
| Session summary stays local          | Computed in the browser, shown once, never sent                                                                                                                    |
| Offline cache excludes personal data | The service worker caches only the app, worker and model files. It **never caches `/api/`** responses.                                                             |
| No frames in logs/analytics          | Logs contain method, URL, status, latency, ids; there are no analytics                                                                                             |
| Model files are first-party          | Served from our origin; CSP `connect-src 'self'`                                                                                                                   |
| HTTPS                                | Required for camera access; prod Nginx terminates TLS 1.2/1.3 with HSTS                                                                                            |

**Anonymous history is shared** by signed-out visitors of one deployment (stated in the UI).
It's deleted automatically after `ANONYMOUS_RETENTION_DAYS` (default 30).

## Data control (privacy rights)

| Right                    | Feature                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Access / portability     | **Export**: a streamed JSON download of the account and every detection (`GET /account/export`)                       |
| Erasure                  | **Delete account**: the user, their detections and pending email tokens, in one transaction; the password is required |
| Storage limitation       | **Retention**: 7 / 30 / 90 / 365 days or keep; enforced by a MongoDB TTL index, also for existing data                |
| Deletion of single items | Delete from the history page                                                                                          |

## Authentication

- **Passwords:** bcrypt cost 12; > 72 bytes rejected (not truncated); never stored or logged in plain text.
- **Tokens:** HS256 JWTs, separate secrets for access (15 min) and refresh (7 days), a `type` claim,
  pinned algorithm and issuer (`alg: none` and forged tokens rejected: tested).
- **Cookies:** `HttpOnly`, `SameSite=Strict` (CSRF defence), `Secure` in production; the refresh cookie
  is scoped to `/api/v1/auth`.
- **Revocation:** `tokenVersion` is incremented on logout, **password change** and **password reset**,
  which kills every other session's refresh token (tested with two agents).
- **No enumeration:** identical login errors plus dummy-hash timing equalisation; the reset request
  always answers `{ sent: true }`.
- **Sensitive actions re-check the password:** password change and account deletion.
- **Brute force:** 10 failed auth attempts per 15 min per IP (login, register, verify, reset, password
  change, delete); **email sending** limited to 5 requests per 15 min per IP. With Redis these
  counters are shared across all instances.
- **Authorization:** every expression query and the live event stream are scoped to the owner from
  the verified token. Others' data looks exactly like missing data (404), and SSE subscribers
  receive only their own events (tested with three concurrent streams).

## Email links (verification, password reset)

| Property                      | Implementation                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------ |
| Unguessable                   | 32 random bytes (`randomBytes`), base64url                                     |
| Useless if the database leaks | only `sha256(token)` is stored                                                 |
| Short-lived                   | 24 h (verify) / 1 h (reset); enforced in the query and by a TTL index          |
| Single use                    | atomic `findOneAndDelete`                                                      |
| Only the latest link works    | issuing a new one deletes older ones                                           |
| Safe from link scanners       | the pages act only after a click, never on load                                |
| Never logged in production    | the production mailer without SMTP is "disabled"; only development logs emails |
| Proof of inbox                | a successful reset also marks the email verified                               |

## API hardening checklist

| Control            | Implementation                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security headers   | `helmet()`; Nginx adds CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS (prod)                                  |
| CORS               | Explicit allowlist (`CLIENT_URL`), credentials only for listed origins (tested)                                                                       |
| Input validation   | Strict Zod schemas (body, query, params, **cursor**, **time zone**); unknown keys rejected                                                            |
| NoSQL injection    | Express 5 simple query parser (no nested objects), Zod primitives, Mongoose `strictQuery`                                                             |
| Body size          | 10 KB (Express), 16 KB (Nginx)                                                                                                                        |
| Rate limiting      | Per-IP, Redis-shared when configured; `trust proxy` = exactly one hop                                                                                 |
| Error output       | Generic 500; stack traces only in logs                                                                                                                |
| Sensitive logs     | Pino redacts cookies, authorization, `set-cookie`, passwords; bodies are never logged                                                                 |
| Caching            | `Cache-Control: no-store`, no ETags on API responses; service worker skips `/api/`                                                                    |
| Secrets            | Environment only; production refuses weak/missing JWT secrets; `.env`, `secrets/`, `nginx/certs/` ignored by git and Docker                           |
| Containers         | Non-root; minimal runtime image; only Nginx published in production                                                                                   |
| Database           | Prod: keyFile internal auth + users; the API user has `readWrite` on one database (verified). Local Compose MongoDB has no auth, bound to `127.0.0.1` |
| Redis              | Prod: `requirepass`, private network only, no persistence (counters only)                                                                             |
| Internal endpoints | `/metrics` is not proxied by Nginx; Prometheus, Grafana and Jaeger ports bind to `127.0.0.1`                                                          |
| Tracing data       | Spans contain routes, timings and query shapes, not request bodies                                                                                    |

## Content Security Policy

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' data: blob:;
worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

`style-src 'unsafe-inline'` is needed by MUI/Emotion. Scripts, the Web Worker, the service worker
and the event stream are all same-origin. Model loading and inference (main thread and worker)
were verified in a real browser under this policy.

## Development-machine note

Browser automation must never fill credential forms on the development machine: headless Edge
autofilled real saved passwords once, even with a fresh profile. Auth UI is covered by component
tests with mocked `fetch`; Playwright uses its own Chromium (no saved logins) and only exercises
camera, history, dashboard, live-update and offline flows.

## Known limitations / future work

- Access tokens stay valid for up to 15 minutes after revocation (stateless by design).
- An open SSE connection isn't re-authenticated when its access token expires. It keeps
  receiving that user's events until it reconnects.
- No MFA, and no CAPTCHA on registration.
- The self-signed certificate from `npm run setup:prod` is for local testing only. Use a real CA
  (e.g. Let's Encrypt) in production.
