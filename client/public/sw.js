/* Service worker: makes the app installable and usable offline.
 *
 * Caching strategy (kept deliberately small and explicit):
 *   /api/*            → never touched. API data is private, per-user and must be fresh.
 *   page navigations  → network first; offline falls back to the cached app shell.
 *   /assets/*         → cache first. Vite file names contain a content hash, so a
 *                       cached file can never be stale.
 *   /models/*, /icons/*, manifest → cache first (they rarely change; ~0.5 MB of model
 *                       weights are what make offline *detection* possible).
 *
 * Bump CACHE_VERSION to discard every old cache on the next activation.
 */
const CACHE_VERSION = 'v1';
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const APP_SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png'];
const STATIC_PREFIXES = ['/assets/', '/models/', '/icons/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      // Activate the new version immediately instead of waiting for every tab to close.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function networkFirstPage(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put('/', response.clone());
    return response;
  } catch {
    // Offline: every route is the same single-page app shell.
    return (await cache.match('/')) ?? Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
  } else if (STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(cacheFirst(request));
  }
});
