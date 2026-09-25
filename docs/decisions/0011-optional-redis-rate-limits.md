# 0011 — Optional Redis for shared rate-limit counters

**Status:** accepted (supersedes the "per-instance counters" limitation)

## Context

In-memory rate-limit counters let a client make up to N× the limit against N API instances.

## Decision

- When `REDIS_URL` is set, `express-rate-limit` uses `rate-limit-redis` stores (prefixes `rl:api:`,
  `rl:auth:`, `rl:email:`), shared by all instances. Without it, memory stores are used, which is
  fine for a single instance and for tests.
- **Fail open** (`passOnStoreError: true`): if Redis is unavailable, requests are allowed.
  Readiness reports Redis but doesn't require it.
- Redis is used _only_ for this. Sessions are JWT cookies, and live-update fan-out uses change
  streams ([ADR 0009](0009-live-updates-sse-change-streams.md)).
- Production: `requirepass`, private network, no persistence.

## Consequences

- Verified in Docker: limit 20/min with 2 replicas gave exactly 20 × `200` and 10 × `429`.
- **Lesson:** the first Docker run showed _no_ limiting at all. The stores initialise when the
  limiters are created; the Redis client wasn't connected yet, initialisation failed, and fail-open
  silently disabled limiting. The client now starts connecting when its module is imported, so
  node-redis queues the commands. A fail-open feature needs a test that proves it's actually on.
