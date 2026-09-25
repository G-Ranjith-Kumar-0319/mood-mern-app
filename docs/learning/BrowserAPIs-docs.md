# Browser (Web Platform) APIs — learning guide for this project

Much of this app is plain web platform: camera access, threads, offline caching,
server push. No library wraps these; the project calls them directly.

---

## Camera: `navigator.mediaDevices.getUserMedia`

```ts
navigator.mediaDevices.getUserMedia({
  audio: false,
  video: { facingMode: 'user', width: { ideal: 640 } },
});
```

**Where:** [hooks/useCamera.ts](../../client/src/hooks/useCamera.ts), constraints in
[constants/camera.ts](../../client/src/constants/camera.ts)

- Returns a `MediaStream`. It needs a **secure context**: HTTPS, or
  `http://localhost` for development.
- `audio: false` means the microphone is never requested (a product requirement, unit-tested).
- `ideal` is a hint; the browser picks the closest supported mode.
- **Errors** are `DOMException`s with a `name`: `NotAllowedError` (permission
  denied), `NotFoundError` (no camera), `NotReadableError` (busy in another app)…
  [utils/errors.ts](../../client/src/utils/errors.ts) maps them to friendly
  messages. We read `error.name` structurally, because a `DOMException` isn't
  guaranteed to be an `instanceof Error` in every environment (jsdom showed this).
- **Cleanup:** `stream.getTracks().forEach((t) => t.stop())` turns the camera
  light off. It's done on Stop and on unmount.
- The track's `ended` event fires if permission is revoked or the camera is
  unplugged mid-session.

## Video: `HTMLVideoElement`

- `video.srcObject = stream` shows the stream ([CameraView](../../client/src/components/Camera/CameraView.tsx)).
- `autoPlay muted playsInline` are required for autoplay on mobile (iOS).
- `readyState >= HAVE_CURRENT_DATA (2)` and `videoWidth > 0` mean a frame is available.
- The preview is mirrored with CSS (`transform: scaleX(-1)`) like a selfie camera.

## Threads: Web Workers

**Where:** [services/detector.worker.ts](../../client/src/services/detector.worker.ts)
and [services/workerExpressionDetector.ts](../../client/src/services/workerExpressionDetector.ts)

- `new Worker(new URL('./detector.worker.ts', import.meta.url), { type: 'module' })`
  starts a background thread running that module.
- **`postMessage(message, [transferables])`** sends data. Messages are
  _structured-cloned_, but objects listed as transferables are **moved** without
  copying.
- **`createImageBitmap(video)`** snapshots the current video frame. The bitmap is
  transferred to the worker (zero-copy) and closed there with `frame.close()`.
- **`OffscreenCanvas`** is a canvas that works without the DOM. TensorFlow.js uses
  it for WebGL inside the worker.
- **Request/response over messages:** every analyse request carries an `id`; the page
  keeps a `Map<id, {resolve, reject}>` and resolves the promise when the matching
  answer arrives.
- **Feature detection before use:** `isWorkerDetectionSupported()` checks `Worker`,
  `OffscreenCanvas` and `createImageBitmap`; otherwise the app falls back to the main thread.

## Offline: Service Worker + Cache Storage

**Where:** [public/sw.js](../../client/public/sw.js),
[app/registerServiceWorker.ts](../../client/src/app/registerServiceWorker.ts)

- `navigator.serviceWorker.register('/sw.js')` installs a script that sits between
  the page and the network.
- Lifecycle events: `install` (pre-cache the app shell, then `skipWaiting()`),
  `activate` (delete old caches, then `clients.claim()`), `fetch` (answer requests).
- **Cache Storage:** `caches.open(name)`, `cache.put(request, response.clone())`,
  `cache.match(request)`, `caches.keys()` / `caches.delete()`.
- Strategies used: **network-first** for pages (fresh when online, cached shell
  offline), **cache-first** for hashed assets and model weights, and **never** for
  `/api/` (private, must be fresh).
- `event.respondWith(promise)` takes over the response. Returning without calling
  it lets the browser handle the request normally.

## Online status: `navigator.onLine` + `online`/`offline` events

[hooks/useOnlineStatus.ts](../../client/src/hooks/useOnlineStatus.ts) (via
`useSyncExternalStore`) drives the offline banner.

## Server push: `EventSource` (Server-Sent Events)

[hooks/useLiveUpdates.ts](../../client/src/hooks/useLiveUpdates.ts)

- `new EventSource('/api/v1/expressions/events')` opens a long-lived GET. The
  browser sends cookies (same origin) and **reconnects automatically** after drops,
  waiting as long as the server's `retry:` line says.
- `addEventListener('detection.created', …)` listens for a named event;
  `onopen`/`onerror` report the connection state.
- It's simpler than WebSockets when data flows only from server to browser.

## Networking: `fetch`, `AbortController`, `URLSearchParams`

- [services/apiClient.ts](../../client/src/services/apiClient.ts) wraps `fetch`:
  JSON body, `credentials: 'same-origin'`, and typed errors.
- `signal` (an `AbortSignal` from TanStack Query) cancels requests that are no
  longer needed.
- `URLSearchParams` builds query strings. **A bug we hit:** the client skipped
  empty-string values, so `cursor=` (meaning "first page") was never sent and the
  server silently used page mode. Now only `undefined` is skipped.

## Storage: `localStorage`

[hooks/useDetectorSettings.ts](../../client/src/hooks/useDetectorSettings.ts)
stores per-device detector preferences. Every read and write is wrapped in
`try/catch` (storage can be blocked in private mode), and stored JSON is validated
before use.

## Layout: `ResizeObserver`

[hooks/useElementWidth.ts](../../client/src/hooks/useElementWidth.ts) measures the
chart container so the SVG is drawn at real pixel size (crisp text, correct bar widths).

## Time and formatting: `performance.now()`, `Intl.DateTimeFormat`

- `performance.now()`: a monotonic high-resolution clock for inference timing and
  smoothing timestamps (unaffected by system clock changes).
- `Intl.DateTimeFormat(locale, { timeZone, … })` formats dates in the viewer's
  locale and time zone; `resolvedOptions().timeZone` tells the server which zone to
  bucket trends in. The server uses the same API to do calendar maths across DST.

## Page visibility: `document.visibilityState`

The inference loop skips frames while the tab is `hidden`, to save battery.
(jsdom reports `'prerender'`, so the check is `!== 'hidden'` rather than `=== 'visible'`.)

## Exercises

1. In DevTools → Application → Service Workers, tick "Offline" and reload. What
   still works?
2. Open two tabs on /history, save a detection in one, and watch the other update.
   Then look at the `events` request in the Network tab (EventStream view).
