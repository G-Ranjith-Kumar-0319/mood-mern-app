# Vite — learning guide for this project

Vite 8 is the client's dev server and production bundler. In development it
serves source files as native ES modules with instant hot reload. For production
it bundles, minifies and splits the code into hashed files in `client/dist/`.

Configuration: [client/vite.config.ts](../../client/vite.config.ts)

---

## Configuration options used

| Option                        | Value                      | Why                                                                                                                                          |
| ----------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugins: [react()]`          | `@vitejs/plugin-react`     | JSX transform + React Fast Refresh (edits keep component state)                                                                              |
| `envDir: '..'`                | repo root                  | One shared `.env` for client and server                                                                                                      |
| `server.port`                 | 5173                       | Fixed port (the API allows it in CORS)                                                                                                       |
| `server.proxy['/api']`        | → `http://localhost:5000`  | The browser calls same-origin `/api/…`; Vite forwards it. Cookies stay first-party and no CORS is needed. Nginx does the same job in Docker. |
| `optimizeDeps.include`        | `['@vladmandic/face-api']` | Pre-bundles face-api at startup (see "bug we hit" below)                                                                                     |
| `worker.format`               | `'es'`                     | Builds the detection Web Worker as an ES module                                                                                              |
| `build.chunkSizeWarningLimit` | 1600 KB                    | face-api/TF.js is large but lazy-loaded; the warning would be noise                                                                          |
| `test`                        | Vitest settings            | Vitest reads the same config (jsdom environment, setup file)                                                                                 |

`vite preview` serves the production build and inherits `server.proxy`, which is
how the Playwright E2E tests run against the real bundle.

## Environment variables: `import.meta.env`

- Only variables prefixed `VITE_` reach browser code
  ([constants/persistence.ts](../../client/src/constants/persistence.ts) reads
  `VITE_PERSIST_MIN_SEGMENT_MS`). **They end up in the public bundle, so never put
  secrets in them.**
- `import.meta.env.PROD` is `true` in production builds.
  [registerServiceWorker.ts](../../client/src/app/registerServiceWorker.ts) only
  registers the service worker in production.
- Types for custom variables are declared in [vite-env.d.ts](../../client/src/vite-env.d.ts).

## Code splitting

- **Dynamic `import()`** creates a separate chunk that is downloaded on demand:
  `await import('@vladmandic/face-api')` in
  [expressionDetector.ts](../../client/src/services/expressionDetector.ts). The
  1.3 MB model runtime downloads only when the camera starts.
- **Workers:** `new Worker(new URL('./detector.worker.ts', import.meta.url), { type: 'module' })`
  is a pattern Vite recognises. It bundles the worker file and its imports
  (face-api) into their own chunk and rewrites the URL.
  ([workerExpressionDetector.ts](../../client/src/services/workerExpressionDetector.ts))

## Static files: `public/`

Files in `client/public/` are copied as-is to the build root: model weights
(`/models`, copied from node_modules by `scripts/copy-models.mjs`), icons,
`manifest.webmanifest` and `sw.js`. They are not hashed, which is why the service
worker must be served with `Cache-Control: no-cache`.

## npm lifecycle scripts

`predev` and `prebuild` in `client/package.json` run `copy-models` automatically
before `dev` and `build`.

## Two bugs we hit (and why they teach something)

1. **Page reload switched the camera off.** Vite's dependency optimiser discovered
   face-api only when the lazy `import()` first ran. It then re-bundled and
   _force-reloaded the page_, which killed the camera. Fix: `optimizeDeps.include`.
2. **Production bundle was 1 MB instead of 650 KB.** The shared root `.env`
   contained `NODE_ENV=development`. Vite honours `NODE_ENV` from `.env` files, so
   `vite build` produced a development build of React. Fix: never set `NODE_ENV`
   in a file Vite reads. We found it by measuring bundle composition from source
   maps.

## Exercises

1. Run `npm run build -w client` and look at `dist/assets`. Which chunk contains face-api?
   Which contains the worker?
2. Temporarily remove `optimizeDeps.include`, delete `node_modules/.vite`, run
   `npm run dev`, and start the camera. Watch the network tab for the reload.
