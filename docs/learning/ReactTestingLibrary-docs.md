# React Testing Library — learning guide for this project

React Testing Library (RTL) tests components **the way a user uses them**: find
things by their role and label, click and type, and check what's shown. It
deliberately makes testing internal state awkward. **user-event** simulates real
interactions; **jest-dom** adds DOM matchers.

---

## Rendering

| API                                                      | Where                                                                                                 | Why                                                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `render(<Component />)`                                  | component tests                                                                                       | Mounts into jsdom                                                                                      |
| `renderWithProviders(ui, { route })`                     | [test/renderWithProviders.tsx](../../client/src/test/renderWithProviders.tsx)                         | Our helper: QueryClient (no retries) + theme + `MemoryRouter`                                          |
| `renderHook(() => useHook(), { wrapper, initialProps })` | [useCamera.test.ts](../../client/src/hooks/useCamera.test.ts), useExpressionDetection, useLiveUpdates | Test a hook directly; `result.current` is its latest return value; `rerender(newProps)` changes inputs |
| `cleanup()`                                              | [test/setup.ts](../../client/src/test/setup.ts)                                                       | Unmount after each test                                                                                |

## Finding elements (the query priority)

1. **`getByRole('button', { name: 'Start camera' })`** is preferred: it's what
   assistive technology sees. Roles used: button, table, row, cell, combobox, option,
   dialog, alert, status, progressbar, link, heading.
2. **`getByLabelText(/Email/)`**: form fields (and MUI switches, which are
   checkboxes with labels).
3. **`getByText('No face detected')`**: visible text.
4. **`getByTestId('expression-title')`**: last resort, for things with no role/text
   hook (the face overlay SVG).

Variants: `getBy…` (must exist), `queryBy…` (may be absent → `null`), `findBy…`
(async, waits for it), `getAllBy…`. **`within(element)`** scopes a query (e.g.
"the delete button inside this row").

## Interacting

```ts
const user = userEvent.setup();
await user.click(screen.getByRole('button', { name: 'Start camera' }));
await user.type(screen.getByLabelText(/Password/), 'a-strong-password');
```

user-event fires the full event sequence (pointer, focus, key presses), unlike
the lower-level `fireEvent`.

## Waiting and `act`

- `await screen.findByText(...)` and `await waitFor(() => expect(...))` wait for
  async updates (fetch mocks, effects).
- `act(() => { ... })` wraps code that updates React state outside RTL's helpers,
  e.g. triggering a fake `EventSource` or dispatching `online`/`offline` events.

## jest-dom matchers used

`toBeInTheDocument`, `toHaveTextContent`, `toBeDisabled`, `toHaveAttribute`.
Imported once via `@testing-library/jest-dom/vitest` in the setup file.

## Test-helper patterns

- **Fake camera:** [test/mediaMocks.ts](../../client/src/test/mediaMocks.ts)
  creates a fake `MediaStream` whose tracks record `stop()` calls, and installs a
  `getUserMedia` mock.
- **Fake API:** `mockFetch((url, init) => ({ status, body }))` routes requests by
  path, so pages can be tested against scripted server responses.
- **Fake EventSource:** a tiny class with `emit()` in
  [useLiveUpdates.test.ts](../../client/src/hooks/useLiveUpdates.test.ts).

## Things these tests caught

- The privacy notice announced itself as an **alert** to screen readers (found by
  "multiple elements with role alert").
- The API client dropped `cursor=`, so the History page never used cursor paging.
- `set-state-in-effect` issues and missing `key`s surfaced as lint or test failures
  before they reached users.

## Exercises

1. Write a test that the "Save now" button becomes enabled once an expression is detected.
   (Hint: mock the detector to return a face.)
2. Rewrite one `getByTestId` query with `getByRole`. Is it possible? What would it
   take in the component?
