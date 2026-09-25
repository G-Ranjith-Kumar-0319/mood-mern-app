# Playwright (end-to-end tests) — learning guide

Playwright drives a **real Chromium** against the real app: the production client
build and the real API. It's the only kind of test that proves the camera,
TensorFlow.js, the Web Worker and the service worker work together.

Config: [e2e/playwright.config.ts](../../e2e/playwright.config.ts) · tests:
[e2e/tests/](../../e2e/tests/) · run: `npm run test:e2e` (first time:
`npx -w e2e playwright install chromium`)

---

## Configuration used

| Option                                                                             | Why                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webServer: [...]`                                                                 | Playwright starts both servers and waits for their URLs: the API (in-memory MongoDB) and `vite build` + `vite preview` (the production bundle with the service worker, `/api` proxied) |
| `projects`                                                                         | `face` and `no-face`: two Chromium setups with different fake cameras                                                                                                                  |
| `launchOptions.args`                                                               | `--use-fake-ui-for-media-stream` (auto-allow camera), `--use-fake-device-for-media-stream`, and `--use-file-for-fake-video-capture=face.mjpeg`                                         |
| `workers: 1`                                                                       | Tests share the anonymous history, so run them one at a time                                                                                                                           |
| `retries` (CI only), `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'` | Debuggable failures                                                                                                                                                                    |
| `reuseExistingServer: !CI`                                                         | Faster local runs                                                                                                                                                                      |

**The fake camera:** Chromium plays an MJPEG file as the webcam. A single JPEG
(face-api's demo photo of three people) is a valid one-frame MJPEG and loops. It's
copied into `e2e/.fixtures/` when the config loads, so no third-party photo is
committed to the repository.

## Test API used

| API                                                                                          | Example                                                         |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `test`, `test.describe`, `expect`                                                            |                                                                 |
| `page.goto('/history')`                                                                      | relative to `baseURL`                                           |
| `page.getByRole`, `getByText`, `getByTestId`, `getByLabel`                                   | same philosophy as React Testing Library                        |
| `locator.click()`, `.check()`, `.count()`, `.first()`, `.filter({ hasText })`                |                                                                 |
| `await expect(locator).toBeVisible() / toHaveText / toHaveCount / toBeHidden / toBeDisabled` | **auto-retrying** assertions (wait until true or timeout)       |
| `expect.poll(() => page.getByTestId('face-box').count()).toBeGreaterThan(1)`                 | poll any value                                                  |
| `page.addInitScript(fn, arg)`                                                                | Runs before the app: pre-sets detector settings in localStorage |
| `request.post('/api/v1/expressions', { data })`                                              | API calls from the test (seed data, trigger a live update)      |
| `context.setOffline(true)`                                                                   | Simulate losing the network (service-worker test)               |
| `page.evaluate(() => navigator.serviceWorker.ready)`                                         | Run code in the page                                            |
| `page.keyboard.press('Escape')`                                                              | Close the session-summary dialog                                |

## The suites

| Spec                | Proves                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `detection.spec.ts` | a face is found, the smoothed expression and confidence show; multi-face mode labels several faces in the **Web Worker**; stopping shows the session summary |
| `no-face.spec.ts`   | the "No face detected" state with Chromium's synthetic pattern                                                                                               |
| `data.spec.ts`      | cursor "Load more"; **a detection saved via the API appears on an open page without reload (SSE)**; dashboard chart + table view                             |
| `offline.spec.ts`   | after one online visit, the app reloads and detects **offline**                                                                                              |

All 8 passed on the first run (≈ 1 minute).

## Safety rule for this machine

Browser automation never fills login or registration forms. On this machine, even a
fresh Edge profile autofilled real saved passwords once. Auth UI is covered by
component tests with mocked `fetch` instead, and Playwright uses its own
Chromium, which has no saved logins.

## In CI

The `e2e` job runs `npx playwright install --with-deps chromium`, then
`npm run test:e2e`, and uploads the HTML report when a test fails.

## Exercises

1. Run `npx -w e2e playwright test --headed --project face` and watch it.
2. Add a test: set the Detection settings "Analyses per second" to 5 and check the
   performance readout shows about 5/s.
