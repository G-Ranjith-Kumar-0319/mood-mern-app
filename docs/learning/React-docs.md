# React — learning guide for this project

React 19 builds the whole user interface. This guide covers every React API the
project uses, **why** it is used here, and **where** to find it. Read it with the
code open next to it.

> Mental model: a component is a function `state → UI`. React re-runs the function
> when state changes and updates only the parts of the page that differ. Everything
> else in this guide is a tool for managing _state_, _side effects_, or _identity_.

---

## 1. Rendering the app

### `createRoot(element).render(<App />)`

Creates the React root inside `<div id="root">` and renders the app.
**Where:** [client/src/main.tsx](../../client/src/main.tsx)

### `<StrictMode>`

A development-only checker. It runs every effect **twice** (mount → unmount →
mount) so bugs from missing cleanup show up early.

This mattered in this project. Some examples:

- `useCamera` must stop camera tracks in its cleanup, or StrictMode would leave the
  webcam light on.
- The verify-email page deliberately does **not** fire its request from an effect,
  partly because StrictMode would send it twice and waste the single-use token.

---

## 2. State hooks

### `useState`

Holds a value that, when changed, re-renders the component.

| Where                                                                                       | What it stores                         | Why it is state                                    |
| ------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------- |
| [hooks/useCamera.ts](../../client/src/hooks/useCamera.ts)                                   | camera `status`, `stream`, `error`     | The UI must change when the camera starts or fails |
| [hooks/useExpressionDetection.ts](../../client/src/hooks/useExpressionDetection.ts)         | face results, performance, load result | Each inference produces new data to draw           |
| [pages/History/HistoryPage.tsx](../../client/src/pages/History/HistoryPage.tsx)             | selected expression filter             | Changes which query runs                           |
| [components/Dashboard/TrendChart.tsx](../../client/src/components/Dashboard/TrendChart.tsx) | hovered bar, table/chart toggle        | Purely visual state                                |
| [app/App.tsx](../../client/src/app/App.tsx)                                                 | the `QueryClient`                      | See the lazy-initialiser tip below                 |

**Lazy initialiser:** `useState(createQueryClient)` passes the _function_, not
`createQueryClient()`. React calls it only on the first render, so one client is
created for the app's lifetime. [hooks/useDetectorSettings.ts](../../client/src/hooks/useDetectorSettings.ts)
does the same with `useState(readSettings)` so localStorage is read once.

**Functional updates:** `setCount((count) => count + 1)` computes the new state
from the _latest_ state. It is used in `useAutoSave` and `useDetectorSettings`,
where several updates can happen before a re-render.

**Deriving instead of storing.** This is the most important lesson in the project.
React's lint rule `react-hooks/set-state-in-effect` flagged
`setModelStatus('loading')` inside an effect. The fix was to _derive_ the status
during render instead:

```ts
// useExpressionDetection.ts: 'loading' is computed, never stored
const requestKey = loadModel ? `${useWorker ? 'worker' : 'main'}#${loadAttempt}` : null;
const modelStatus = deriveModelStatus(requestKey, loadResult);
```

The effect only writes the _result_ (`ready` or `error`) when the async work
finishes. `useLiveUpdates` uses the same trick: the status is stored _together
with the identity it belongs to_, so a new identity automatically reads as
"connecting". Fewer states means fewer impossible combinations.

### `useRef`

A mutable box (`ref.current`) that survives re-renders **without** causing one.

| Where                    | Holds                             | Why a ref and not state                                                                                                      |
| ------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `useCamera`              | `streamRef`, `requestIdRef`       | Cleanup needs the _current_ stream, not the one captured in an old closure. `requestIdRef` detects stale permission prompts. |
| `useExpressionDetection` | `detectorRef`, `settingsRef`      | The inference loop reads the latest settings without restarting                                                              |
| `useAutoSave`            | the segment tracker, `mountedRef` | The tracker is a long-lived object; changing it must not re-render                                                           |
| `HomePage`               | `videoRef`                        | Gives hooks access to the real `<video>` DOM element                                                                         |
| `TrendChart`             | `containerRef`                    | Measures the chart's width                                                                                                   |

**Pattern: the latest value in a ref.** `settingsRef.current = settings` (in an
effect) lets a long-running `setTimeout` loop read the newest settings. Without
it, you would have to tear the loop down and restart it on every change.

### `useId`

Generates a unique, stable id. [TrendChart](../../client/src/components/Dashboard/TrendChart.tsx)
uses it for SVG `<clipPath id>` values, so two charts on one page cannot clash.

---

## 3. Effects

### `useEffect(fn, deps)`

Runs _after_ render to synchronise with something outside React: the camera,
timers, the network, the DOM. The function it returns is the **cleanup**, which
runs before the next effect and on unmount.

| Where                                                                      | Synchronises with                              | Cleanup does                                   |
| -------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| [useCamera](../../client/src/hooks/useCamera.ts)                           | MediaStream                                    | stops every track (turns the camera light off) |
| [CameraView](../../client/src/components/Camera/CameraView.tsx)            | `<video>.srcObject`                            | none needed                                    |
| [useExpressionDetection](../../client/src/hooks/useExpressionDetection.ts) | model loading; the inference `setTimeout` loop | sets `cancelled = true`, clears the timer      |
| [useAutoSave](../../client/src/hooks/useAutoSave.ts)                       | the segment tracker                            | flushes the last segment on disable/unmount    |
| [useLiveUpdates](../../client/src/hooks/useLiveUpdates.ts)                 | `EventSource`                                  | `source.close()`                               |
| [useElementWidth](../../client/src/hooks/useElementWidth.ts)               | `ResizeObserver`                               | `observer.disconnect()`                        |
| [useSessionSummary](../../client/src/hooks/useSessionSummary.ts)           | a `SessionRecorder`                            | produces the summary when the camera stops     |

**The cancelled-flag pattern** (for async work inside effects):

```ts
useEffect(() => {
  let cancelled = false;
  loadDetector(...).then((detector) => {
    if (cancelled) return;      // the component moved on; ignore the stale result
    setLoadResult(...);
  });
  return () => { cancelled = true; };
}, [requestKey]);
```

**Dependency arrays** tell React when to re-run. The ESLint rule
`react-hooks/exhaustive-deps` checks them. Every value from the component that
the effect reads must be listed, or you get stale values.

**A bug we hit:** a test passed a new `{ current: video }` object on every render
as the "ref". Because it appeared in the dependency array, the effect re-ran on
every render and looped forever ("Maximum update depth exceeded"). Real
`useRef` objects are stable. See the fixed test in
[useExpressionDetection.test.ts](../../client/src/hooks/useExpressionDetection.test.ts).

### `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`

The official way to read a value owned by something _outside_ React.
[useOnlineStatus](../../client/src/hooks/useOnlineStatus.ts) subscribes to the
browser's `online`/`offline` events and reads `navigator.onLine`. React
guarantees the UI never shows a "torn" (half-old, half-new) value.

---

## 4. Memoising functions

### `useCallback(fn, deps)`

Returns the _same_ function object between renders until a dependency changes.
It matters when a function is itself a dependency of an effect, or is passed to
children:

- `useCamera`: `stop` is used inside `start`, and both are returned to the page
- `useAutoSave`: `persist` is an effect dependency; without `useCallback` the
  effect would re-run on every render
- `useDetectorSettings`: `update`/`reset` are handed to the settings panel

The project does not use `useMemo`: no computation was expensive enough to be
worth it ("optimise only after identifying a real bottleneck").

---

## 5. Custom hooks: the architecture of this app

A custom hook is a function starting with `use` that calls other hooks. It is the
main way this app keeps **logic out of components**:

| Hook                                 | Responsibility                                              |
| ------------------------------------ | ----------------------------------------------------------- |
| `useCamera`                          | permission, start/stop, cleanup, camera errors              |
| `useExpressionDetection`             | model loading, frame loop, tracking, smoothing, performance |
| `useDetectorSettings`                | per-device preferences in localStorage                      |
| `useAutoSave`                        | turns stable expressions into saved segments                |
| `useSessionSummary`                  | the stop-camera summary                                     |
| `useExpressionHistory` & co.         | server data via TanStack Query                              |
| `useAuth`, `useAccount`              | session and account mutations                               |
| `useLiveUpdates`                     | Server-Sent Events subscription                             |
| `useOnlineStatus`, `useElementWidth` | small browser adapters                                      |

[HomePage](../../client/src/pages/Home/HomePage.tsx) composes several of these,
and the components below it only render.

---

## 6. Components and JSX patterns used

- **Props with TypeScript interfaces.** Every component declares its props, e.g.
  `ExpressionResultProps`.
- **Discriminated-union rendering.** `ExpressionResult` switches on
  `state.kind` (10 UI states). TypeScript forces every state to be handled.
- **Conditional rendering:** `{expression && <ConfidenceIndicator … />}`
- **Lists need `key`:** `faces.map((face) => <g key={face.id}>…)`. The key is the
  _tracked face id_, so React keeps each face's element as it moves.
- **Keys to reset state:** `<AuthPage key="login" mode="login" />` makes React
  treat login and register as different components, so the form resets when
  switching.
- **Fragments** (`<>…</>`) group elements without an extra DOM node (e.g. the
  camera overlay).
- **Refs to DOM elements:** `<Box component="video" ref={videoRef} />`. React 19
  lets `ref` be passed like a normal prop.

---

## 7. React 19 details worth knowing

- `ref` as a regular prop (no `forwardRef` needed). `CameraView` receives
  `videoRef` directly.
- The React Compiler-era lint rules (`eslint-plugin-react-hooks` v7) are stricter:
  `set-state-in-effect` pushed us toward derived state (section 2).

---

## 8. Testing React code

See [ReactTestingLibrary-docs.md](ReactTestingLibrary-docs.md). In short: tests render
components or hooks (`render`, `renderHook`) and interact like a user would
(`userEvent`). They never test implementation details such as state variable names.

## Exercises

1. Add a "Pause detection" button to the home page without stopping the camera.
   (Hint: add a `paused` argument to `useExpressionDetection` and include it in
   the loop effect's condition.)
2. Why does `useAutoSave` keep the tracker in a `useRef` instead of `useState`?
   Change it to state and watch what happens to rendering.
3. Remove the `cancelled` check from the model-loading effect and start and stop
   the camera quickly. What can go wrong?
