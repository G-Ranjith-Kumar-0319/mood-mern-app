# Express security middleware — learning guide

Five small libraries harden the HTTP layer. All are wired in
[server/src/app.ts](../../server/src/app.ts) and [middleware/rateLimit.ts](../../server/src/middleware/rateLimit.ts).

---

## helmet: security headers

`app.use(helmet())` sets headers such as:

- `Content-Security-Policy`: restricts where scripts and styles may load from
- `X-Content-Type-Options: nosniff`: the browser won't guess MIME types
- `Strict-Transport-Security`: HTTPS only (effective when served over HTTPS)
- `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-*` headers

The web app's CSP (the one that matters for the browser) is set by Nginx; see
[Nginx-docs.md](Nginx-docs.md).

## cors: cross-origin allowlist

`cors({ origin: config.corsOrigins, credentials: true })` lets only listed origins
(e.g. `http://localhost:5173`) read API responses with cookies. The app normally
talks to the API on the **same origin** (via the Vite proxy or Nginx), so CORS is a
second line of defence. A test checks that `https://evil.example` gets no CORS headers.

## cookie-parser

Fills `req.cookies` from the `Cookie` header, which `authenticate` reads.

## compression: gzip responses

Shrinks JSON responses. It's configured with a `filter` that **skips
`text/event-stream`**, because compression buffers output, which would hold
Server-Sent Events back.

## express-rate-limit (+ rate-limit-redis)

```ts
rateLimit({
  windowMs,
  limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) => next(AppError.rateLimited()),
  store: new RedisStore({ prefix: 'rl:api:', sendCommand }),
  passOnStoreError: true,
});
```

| Limiter            | Limit          | Counts                                                                             |
| ------------------ | -------------- | ---------------------------------------------------------------------------------- |
| `apiRateLimiter`   | 300/min per IP | every `/api` request (health checks excluded)                                      |
| `authRateLimiter`  | 10 per 15 min  | failures only (`skipSuccessfulRequests`): login, register, password change, delete |
| `emailRateLimiter` | 5 per 15 min   | every request: verification and reset emails                                       |

- `standardHeaders: 'draft-8'` returns `RateLimit`/`RateLimit-Policy` headers.
- `handler` sends the error through the central error handler, so the 429 has the
  standard JSON shape.
- `app.set('trust proxy', 1)` is essential behind Nginx; otherwise every user
  would share Nginx's IP (and one bucket).
- **Shared counters:** with `REDIS_URL`, counters live in Redis, so "300/min" is
  the total across all API instances. Verified in Docker: limit 20 → exactly 20×200
  and 10×429, even though the two replicas served 15 requests each.
- **`passOnStoreError: true`**: if Redis is down, requests are allowed (availability
  over strict limiting).

### The bug worth remembering

The limiter initialises its store **immediately** when created. Our Redis client
wasn't connected yet, so the store's init failed, and because of `passOnStoreError`
**rate limiting silently switched off** with no visible error except one log line. Unit
tests couldn't catch it (they run without Redis); only the Docker test did. Fix:
start connecting as soon as the Redis module is imported (node-redis then queues
commands). Lesson: _fail-open_ settings need a test proving the feature is actually on.

## Body size limits

`express.json({ limit: '10kb' })` plus Nginx `client_max_body_size 16k`. Oversized
bodies get 413 before any handler runs.

## Exercises

1. `for i in $(seq 1 15); do curl -s -o /dev/null -w '%{http_code} ' -X POST localhost:5000/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"a@b.c","password":"x"}'; done`
   When do 429s start?
2. Look at the `RateLimit` response header and explain each field.
