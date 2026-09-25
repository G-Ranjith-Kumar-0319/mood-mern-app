# Redis — learning guide for this project

Redis is an in-memory key/value store. Here it has exactly one job: **shared
rate-limit counters**, so several API instances enforce one global limit. It's
optional. Without `REDIS_URL`, each instance counts in its own memory.

Code: [server/src/config/redis.ts](../../server/src/config/redis.ts),
[middleware/rateLimit.ts](../../server/src/middleware/rateLimit.ts)

---

## Why Redis (and why only this)

The API is stateless so it can scale horizontally. Rate-limit counters are _state_.
With N instances and in-memory counters, a client could make N× the allowed
requests. Redis is fast (sub-millisecond), atomic (`INCR` in a Lua script), and
supports expiring keys (a counter disappears when its window ends), which is exactly
what rate limiting needs.

We did **not** use Redis for sessions (JWT cookies are stateless) or for live-update
fan-out (MongoDB change streams already reach every instance). Each component
must earn its place.

## node-redis client API used

| Call                               | Why                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| `createClient({ url })`            | `redis://redis:6379`, or `redis://:password@redis:6379` in production             |
| `client.connect()`                 | Called at **import time** so commands issued early are queued (see the bug below) |
| `client.on('error' \| 'ready', …)` | Logging                                                                           |
| `client.sendCommand(args)`         | Raw command bridge used by `rate-limit-redis`                                     |
| `client.ping()`                    | Readiness check (`/health/ready` reports `redis: ok`)                             |
| `client.close()`                   | Graceful shutdown (`QUIT` is deprecated)                                          |
| `client.isOpen`                    | Whether a connection was started                                                  |

## rate-limit-redis

`new RedisStore({ prefix: 'rl:api:', sendCommand })` stores one key per client IP
per limiter (e.g. `rl:api:172.19.0.1`). The increment runs as a Lua script on the
Redis server, so it's atomic even with many API instances.

## Deployment

- Local Compose: `redis:8-alpine`, persistence disabled (`--save '' --appendonly no`,
  since counters don't need to survive restarts).
- Production Compose: same, plus `--requirepass` (password from `npm run setup:prod`).
  It's reachable only on the private Docker network.
- If Redis fails, requests are allowed (`passOnStoreError`), and readiness shows
  `redis: unavailable` without marking the API unhealthy.

## The ordering bug

`express-rate-limit` calls the store's `init()` when the limiter is _created_
(at import). If the client isn't connected, node-redis throws `ClientClosedError`,
init fails, and the fail-open setting disables limiting. The fix is to call
`connect()` in the Redis module itself, before the limiters are constructed. Found
by a Docker test that counted 429 responses (see [ExpressSecurity-docs.md](ExpressSecurity-docs.md)).

## Exercises

1. `docker compose exec redis redis-cli --scan --pattern 'rl:*'` after some requests.
   Then `TTL <key>`: what does the number mean?
2. Stop Redis (`docker compose stop redis`) and send requests. What happens to limiting
   and to `/api/v1/health/ready`?
