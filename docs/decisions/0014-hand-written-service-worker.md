# 0014 — A small hand-written service worker for offline use

**Status:** accepted

## Context

Detection runs entirely in the browser, so it can work offline once the app, the worker chunk and
the model weights are cached. A plugin (e.g. `vite-plugin-pwa`/Workbox) could generate a service
worker, but it's a large dependency for a handful of rules and hides the caching logic from learners.

## Decision

- `client/public/sw.js` (~80 lines), registered only in production builds:
  - page navigations: **network-first**, falling back to the cached app shell
  - `/assets/*` (content-hashed), `/models/*`, `/icons/*`: **cache-first**
  - `/api/*`: **never cached** (private, must be fresh)
  - versioned cache names; old caches are deleted on `activate`; `skipWaiting` + `clients.claim`
- `manifest.webmanifest` and PNG icons (any + maskable) make the app installable.
- An offline banner explains that detection still works while saving/history need a connection.

## Consequences

- Verified twice: manually, and by a Playwright test that goes offline, reloads and detects again.
- Because asset names aren't known to the static `sw.js`, assets are cached at runtime (on first
  use) rather than pre-cached. Offline detection therefore needs one online session with the camera.
- `sw.js` must be served with `Cache-Control: no-cache`, which Nginx's `location /` does.
