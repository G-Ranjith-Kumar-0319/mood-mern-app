# 0008 — Run inference in a Web Worker, with a main-thread fallback

**Status:** accepted

## Context

TensorFlow.js inference on the main thread competes with rendering, input handling and chart
drawing. On slower devices the page can stutter while the model runs. face-api only configures
itself for `window` or Node.js, so it doesn't run in a worker out of the box.

## Decision

- `detector.worker.ts` runs the shared face-api pipeline (`faceApiAnalysis.ts`) in a **module
  Web Worker**. It registers a custom face-api environment (`env.setEnv`) with `OffscreenCanvas`
  and the worker's `fetch`; frames arrive as tensors, so no DOM element is ever needed.
- The page captures frames with `createImageBitmap(video)` and **transfers** them (zero-copy).
  Requests carry ids; responses resolve the matching promise.
- `detectorFactory` prefers the worker when `Worker`, `OffscreenCanvas` and `createImageBitmap`
  exist, and falls back to the main thread if they're missing or the worker fails to load.
- Users can switch it off in Detection settings; the performance readout shows which backend and
  which TF.js backend (webgl/cpu) is actually running.

## Consequences

- Measured after WebGL warm-up: ~46 ms (worker) vs ~52 ms (main thread) per frame, so there's no
  speed penalty and the UI thread is freed.
- Verified in a real browser under the production CSP (`worker-src 'self' blob:`) with zero
  violations, and covered by a Playwright test.
- Two code paths exist, but they share one analysis module and one interface (`ExpressionDetector`).
- The worker bundles its own copy of face-api/TF.js (~1.3 MB). Only one of the two copies is
  downloaded per visit.
