# Vitest — learning guide for this project

Vitest 5 runs all unit and integration tests for both the client (in a simulated
browser, jsdom) and the server (in Node). Its API is Jest-compatible.

Config: `test` in [client/vite.config.ts](../../client/vite.config.ts) and
[server/vitest.config.ts](../../server/vitest.config.ts) · run with `npm test`.

---

## Structure and assertions

| API                                                                                                     | Notes                                                                                                            |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `describe`, `it`                                                                                        | Group and name tests. Names read as sentences: _"keeps the UI stable through a single noisy frame"_.             |
| `it.each([...])('maps %s to %s', …)`                                                                    | Table-driven tests: emoji mapping, validation cases, time-bucket cases                                           |
| `expect(x).toBe / toEqual / toMatchObject / toContain / toMatch / toHaveLength / toBeCloseTo / toThrow` | `toBe` compares identity, `toEqual` deep equality, `toMatchObject` a partial shape                               |
| `expect(promise).rejects.toBeInstanceOf(E)`                                                             | Async errors                                                                                                     |
| `expect.any(String)`                                                                                    | Match any value of a type                                                                                        |
| `beforeEach`, `afterEach`, `beforeAll`, `afterAll`                                                      | Setup/teardown (e.g. the in-memory database per file)                                                            |
| `setupFiles`                                                                                            | [client/src/test/setup.ts](../../client/src/test/setup.ts), [server/tests/setup.ts](../../server/tests/setup.ts) |

## Test doubles

| API                                                                       | Where                                                                                                                                                       | Why                                                         |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `vi.fn(impl)`                                                             | everywhere                                                                                                                                                  | A function that records calls (`mock.calls`)                |
| `vi.mock('module', factory)`                                              | [useExpressionDetection.test.ts](../../client/src/hooks/useExpressionDetection.test.ts), [HomePage.test.tsx](../../client/src/pages/Home/HomePage.test.tsx) | Replace the real face-api detector (no ML in unit tests)    |
| `mockResolvedValue` / `mockImplementation` / `mockReset`                  | same                                                                                                                                                        | Script the mock's behaviour                                 |
| `vi.spyOn(obj, 'method')`                                                 | [useLiveUpdates.test.ts](../../client/src/hooks/useLiveUpdates.test.ts)                                                                                     | Observe calls to a real method (`invalidateQueries`)        |
| `vi.stubGlobal('fetch' \| 'EventSource', fake)` + `vi.unstubAllGlobals()` | [renderWithProviders.tsx](../../client/src/test/renderWithProviders.tsx) (`mockFetch`)                                                                      | Replace browser globals                                     |
| `vi.useFakeTimers()` + `vi.advanceTimersByTime(ms)`                       | useLiveUpdates.test.ts                                                                                                                                      | Control `setTimeout` (the refresh debounce) without waiting |
| `expect.poll(fn).toBe(x)` / `vi.waitFor`                                  | [liveUpdates.api.test.ts](../../server/tests/integration/liveUpdates.api.test.ts)                                                                           | Retry an assertion until an async event arrives             |

`restoreMocks: true` in the config restores spies after every test.

## Environments

- Client: `environment: 'jsdom'`, a DOM in Node. It lacks media playback,
  `EventSource`, `OffscreenCanvas` and more, so the setup file stubs
  `HTMLMediaElement.prototype.play`, and tests supply fakes.
- Server: `environment: 'node'`, real HTTP and a real MongoDB (in memory).

## Pitfalls we actually hit

1. **`beforeEach(() => mock.mockReset())`**: the arrow function _returns_ the mock,
   and Vitest treats a returned function as a **teardown** callback. After the test
   it called the mock, which rejected, which failed the test. Fix: use braces:
   `beforeEach(() => { mock.mockReset(); })`.
2. **No auto-cleanup without globals.** React Testing Library cleans up only when
   test globals are enabled, so `setup.ts` calls `afterEach(() => cleanup())`.
3. **jsdom quirks:** `document.visibilityState` is `'prerender'`, `video.play()`
   returns `undefined`, and a `DOMException` isn't an `instanceof Error`. Each one
   shaped the production code to be more defensive.

## What is tested where

- Pure logic (smoothing, tracking, segments, stats, time buckets, cursors, scales):
  plain unit tests, fast and exhaustive.
- Hooks: `renderHook` (see [ReactTestingLibrary-docs.md](ReactTestingLibrary-docs.md)).
- HTTP API: Supertest + an in-memory MongoDB replica set (see [Supertest-docs.md](Supertest-docs.md)).
- Full browser: Playwright (see [Playwright-docs.md](Playwright-docs.md)).

## Exercises

1. Run `npx vitest` (watch mode) in `client/` and break `aggregatePredictions`. Which tests fail?
2. Write a test for `formatDuration(59_999)`. What should it return?
