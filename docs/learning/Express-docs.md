# Express — learning guide for this project

Express 5 is the HTTP framework of the API. An Express app is a **pipeline of
middleware**: functions `(req, res, next)` that run in order until one sends a
response.

App assembly: [server/src/app.ts](../../server/src/app.ts)

---

## The request pipeline (in order)

```text
GET /metrics                     (Prometheus scrape; outside /api)
requestLogger  → pino-http: request id + one log line per request
metricsMiddleware → latency histogram
helmet  → security headers
cors    → origin allowlist
compression (skips text/event-stream)
express.json({ limit: '10kb' })
cookieParser
/api: Cache-Control: no-store
/api/v1/health → healthRouter   (before the rate limiter: probes are never limited)
/api  → apiRateLimiter
/api/v1 → apiRouter → /auth, /account, /expressions
notFoundHandler → errorHandler
```

## App-level API

| Call                           | Why                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `express()`                    | Creates the app. `createApp()` doesn't listen, so tests can use it in-process.                           |
| `app.disable('x-powered-by')`  | Don't advertise the framework                                                                            |
| `app.set('etag', false)`       | API responses are per-user; no conditional caching                                                       |
| `app.set('trust proxy', 1)`    | Behind exactly one proxy (Nginx), `req.ip` is taken from `X-Forwarded-For`. Rate limiting depends on it. |
| `app.use(path?, …middleware)`  | Mounts middleware/routers                                                                                |
| `app.get('/metrics', handler)` | A single route                                                                                           |
| `express.json({ limit })`      | Parses JSON bodies; oversized → 413, invalid → 400 (mapped by the error handler)                         |

## Routers

`Router()` groups routes: [routes/](../../server/src/routes/). `index.ts` mounts
`/auth`, `/account`, and `/expressions` (with the `authenticate` middleware in front).

**Order matters:** `/expressions/stats`, `/trends` and `/events` are declared _before_
`/:id`, otherwise `"stats"` would be treated as an id.

`router.use(authenticate, requireAuth)` protects every route in
[account.routes.ts](../../server/src/routes/account.routes.ts).

## Middleware written for this project

| Middleware                          | File                                                                      | Pattern shown                                               |
| ----------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `validate({ body, query, params })` | [middleware/validate.ts](../../server/src/middleware/validate.ts)         | A middleware _factory_; validated data goes to `res.locals` |
| `authenticate`                      | [middleware/authenticate.ts](../../server/src/middleware/authenticate.ts) | Optional auth: sets `req.user`                              |
| `requireAuth`                       | [middleware/requireAuth.ts](../../server/src/middleware/requireAuth.ts)   | `next(error)` to reject                                     |
| `errorHandler`                      | [middleware/errorHandler.ts](../../server/src/middleware/errorHandler.ts) | 4 arguments `(err, req, res, next)` = error middleware      |
| `notFoundHandler`                   | same file                                                                 | Last in the chain                                           |
| `metricsMiddleware`                 | [observability/metrics.ts](../../server/src/observability/metrics.ts)     | `res.on('finish')` to measure after the response            |

Types: `RequestHandler` and `ErrorRequestHandler` from `express`.

## Express 5 specifics you must know

1. **Async errors are forwarded automatically.** If an `async` handler throws or
   rejects, Express 5 calls the error middleware. That's why controllers have no
   `try/catch`.
2. **`req.query` is read-only (a getter).** That's why `validate()` stores parsed
   values in `res.locals.validated` instead of overwriting `req.query`.
3. The default query parser is "simple": `?a[$gt]=1` becomes the key `'a[$gt]'`, not
   a nested object. That helps against NoSQL-injection tricks.
4. **`req.baseUrl` is reset when an error leaves a router.** We found this while
   labelling metrics: at `finish`, a 404 from `/expressions/:id` reported only
   `/:id`. The fix rebuilds the prefix from `req.originalUrl`.

## Request and response API used

- `req.body`, `req.params`, `req.query`, `req.cookies` (via cookie-parser),
  `req.headers`, `req.ip`, `req.route.path`, `req.originalUrl`, `req.on('close')`
- `res.status(code).json(body)`, `res.setHeader`, `res.getHeader`,
  `res.cookie(name, value, options)` / `res.clearCookie(name, options)`,
  `res.locals`, `res.send`
- **Streaming:** `res.flushHeaders()`, `res.write()`, `res.end()`, and
  `res.once('drain')`, used for Server-Sent Events
  ([events.controller.ts](../../server/src/controllers/events.controller.ts)) and
  the JSON export ([account.controller.ts](../../server/src/controllers/account.controller.ts))
- `res.headersSent`: the error handler must not respond twice

## Layering (why controllers are tiny)

```text
route → validate → controller → service → repository → Mongoose
```

A controller only reads validated input, calls a service, and sends the envelope
(`sendSuccess` / `sendPaginated` in [utils/apiResponse.ts](../../server/src/utils/apiResponse.ts)).
Services hold business rules; repositories hold queries. Each layer is testable and
replaceable.

## Server-Sent Events with Express

```ts
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('X-Accel-Buffering', 'no'); // tell Nginx not to buffer
res.flushHeaders();
res.write(`event: detection.created\ndata: ${json}\n\n`);
```

The compression middleware would buffer this stream, so its `filter` skips
`text/event-stream` responses.

## Exercises

1. Add `GET /api/v1/expressions/latest` returning the newest detection. Where must the
   route go relative to `/:id`?
2. Throw an error inside a service and follow it through `toAppError` to the JSON
   response. What does the client see? What's in the log?
