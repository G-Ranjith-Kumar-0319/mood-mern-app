# 0006 — One Nginx serves the frontend and load-balances the API

**Status:** accepted

## Context

The production architecture needs TLS termination, static file delivery, and load balancing across
several Node instances.

## Decision

- A single Nginx image (`nginx/Dockerfile`) builds the React app in a Node stage and serves the static
  output. It also reverse-proxies `/api/` to the `api` service.
- Compose scales `api` with `deploy.replicas`. Docker's DNS returns every replica's IP, and Nginx
  round-robins across them with upstream keep-alive, passive failure detection (`max_fails`), and
  `proxy_next_upstream` retries (idempotent requests only).
- The unprivileged Nginx image is used (non-root, ports 8080/8443).
- There is no separate "frontend" container. Serving files is exactly what the gateway Nginx does best,
  and an extra hop would add nothing.

## Consequences

- Same-origin app and API: simpler cookies, no CORS in production.
- The upstream uses `server api:5000 resolve` with Docker's resolver (`valid=10s`), a feature of
  open-source Nginx ≥ 1.27.3. Scaled-up or restarted replicas join the pool within about 10 s, with
  no Nginx restart. This was verified: scaling 2 → 3 gave a 10/10/10 request split, and scaling
  3 → 2 produced 0 failed requests out of 60.
