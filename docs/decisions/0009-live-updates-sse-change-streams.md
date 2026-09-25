# 0009 — Live updates with Server-Sent Events and MongoDB change streams

**Status:** accepted

## Context

History and dashboards should update when a detection is saved in another tab or on another
device. The API runs several stateless instances; a save handled by instance B must reach a
browser connected to instance A.

Options: polling; WebSockets; Server-Sent Events (SSE). For fan-out across instances: Redis
pub/sub, or MongoDB change streams.

## Decision

- **SSE** (`GET /api/v1/expressions/events`): the data flows one way (server → browser), SSE works
  over plain HTTP through Nginx, sends cookies automatically, and `EventSource` reconnects by
  itself. WebSockets would add a protocol upgrade and reconnection code for no benefit.
- **Change streams:** every API instance watches `insert` events on `expressiondetections` and
  forwards each one to the subscribers of that owner (user id or "anonymous") on that instance.
  Every instance sees every insert, so no extra pub/sub system is needed.
- The client doesn't apply the event's data itself; it invalidates the TanStack Query cache
  (debounced), so the single source of truth stays the API.
- Operational details: heartbeat every 25 s; `X-Accel-Buffering: no` plus an Nginx location with
  `proxy_buffering off` and a 1 h read timeout; compression skips `text/event-stream`; streams end
  first during graceful shutdown.

## Consequences

- Requires a replica set (all our environments are one). On a standalone server the stream stays
  open but silent, which is logged.
- Only inserts are pushed. Delete events carry just the `_id`, so the owner is unknown without
  pre-images (which need admin rights). Deletions made elsewhere appear on the next refetch.
- An open stream isn't re-authenticated when its access token expires (documented in security.md).
- Verified: owner-only delivery (three concurrent streams), through Nginx on HTTP and HTTPS, and
  in Playwright (a row appears without reload).
