# Node.js — learning guide for this project

The API runs on Node.js 24 as **ES modules** (`"type": "module"`), compiled from
TypeScript. This guide covers the built-in Node APIs the server and scripts use.

---

## Modules and paths

| API                                                      | Where                                                                                                                              | Why                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `import.meta.url` + `fileURLToPath` + `dirname`          | [config/env.ts](../../server/src/config/env.ts), scripts                                                                           | ES modules have no `__dirname`; this rebuilds it to find the root `.env`    |
| `createRequire(import.meta.url)` + `require.resolve`     | [client/scripts/copy-models.mjs](../../client/scripts/copy-models.mjs), [e2e/playwright.config.ts](../../e2e/playwright.config.ts) | Find a package's install folder (face-api's `model/` directory) from ESM    |
| `module.register(hook, import.meta.url)`                 | [instrumentation.ts](../../server/src/instrumentation.ts)                                                                          | Installs an ESM loader hook so OpenTelemetry can patch imported libraries   |
| `node --import ./dist/instrumentation.js dist/server.js` | server `start` script, Dockerfile                                                                                                  | Runs a module _before_ the app, so the patches are in place first           |
| Dynamic `await import('…')`                              | [config/database.ts](../../server/src/config/database.ts), instrumentation                                                         | Loads `mongodb-memory-server` (dev only) and OpenTelemetry only when needed |
| Top-level `await`                                        | instrumentation.ts                                                                                                                 | Allowed in ES modules                                                       |

Relative imports end in `.js` (`import { createApp } from './app.js'`) even
though the file is `.ts`: Node resolves the compiled output.

## Environment and process

- `process.loadEnvFile(path)` (Node ≥ 20.12): loads the root `.env` without the
  `dotenv` package. It doesn't override variables already set, so Docker/CI values win.
- `process.env` is validated once with Zod ([env.ts](../../server/src/config/env.ts)).
  The server refuses to start with bad config (fail fast).
- `process.exit(code)`, `process.on('SIGTERM' | 'SIGINT', …)`,
  `process.on('unhandledRejection', …)`: see graceful shutdown below.
- `process.uptime()` is reported by `/health/live`.

## Crypto (`node:crypto`)

| Function                                           | Where                                                                                               | Purpose                                                                    |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `randomUUID()`                                     | [requestLogger.ts](../../server/src/middleware/requestLogger.ts)                                    | Request ids                                                                |
| `randomBytes(32).toString('base64url')`            | [oneTimeToken.service.ts](../../server/src/services/oneTimeToken.service.ts), `scripts/setup-*.mjs` | Unguessable email-link tokens, JWT secrets, passwords, the MongoDB keyfile |
| `createHash('sha256').update(token).digest('hex')` | oneTimeToken.service.ts                                                                             | Store only a _hash_ of email tokens                                        |

## Buffers and encodings

`Buffer.from(json).toString('base64url')` and back, in
[utils/cursor.ts](../../server/src/utils/cursor.ts), makes opaque, URL-safe pagination cursors.

## The HTTP server

- `app.listen(port)` returns a Node `http.Server`.
- **`server.keepAliveTimeout = 65_000`** must be _longer_ than Nginx's upstream
  keep-alive (60 s). Otherwise Node can close a socket at the same moment Nginx
  reuses it, which shows up as sporadic 502 errors. `headersTimeout` must exceed it too.
- **Graceful shutdown** ([server.ts](../../server/src/server.ts)):
  1. `liveUpdates.endAllStreams()`: open Server-Sent Events responses never finish
     on their own, so they're ended first (browsers reconnect elsewhere).
  2. `server.close(cb)` stops accepting connections and waits for in-flight requests.
  3. `server.closeIdleConnections()` closes idle keep-alive sockets immediately.
  4. Close Redis and MongoDB, then `process.exit(0)`.
  5. A `setTimeout(…, 10_000).unref()` safety net force-exits if something hangs.
     (`unref()` means the timer itself doesn't keep the process alive.)

## Streams and async iteration

- **Async generators** (`async function*`, `yield`) in
  [account.service.ts](../../server/src/services/account.service.ts) produce the data
  export piece by piece.
- `for await (const doc of cursor)` reads MongoDB documents one at a time.
- `res.write(chunk)` returns `false` when the socket buffer is full. The
  controller then awaits the `'drain'` event (**back-pressure**), so memory stays
  flat for huge exports.

## Timers

`setTimeout`/`clearTimeout` (shutdown safety net, change-stream restart back-off),
`setInterval` (SSE heartbeat every 25 s), and `.unref()`.

## Why Node for this project

The API is I/O-bound (MongoDB, Redis, HTTP), which is exactly Node's strength: one
thread with non-blocking I/O handles many concurrent requests. CPU-heavy work (face
detection) is kept _out_ of the server entirely; it runs in the browser.

## Exercises

1. Start the API, open an SSE stream (`curl -N localhost:5000/api/v1/expressions/events`)
   and press Ctrl+C on the server. Does it exit immediately? Remove `endAllStreams()`
   and try again.
2. Export a large dataset and watch memory with `process.memoryUsage()`. Then remove
   the drain handling and compare.
