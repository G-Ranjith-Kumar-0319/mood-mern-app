# TanStack Query — learning guide for this project

TanStack Query (React Query v5) manages **server state**: data that lives on the
server and is only _cached_ in the browser (history, statistics, trends, the
current user). It handles fetching, caching, refetching, loading and error states,
so components never write that plumbing themselves.

> Rule used in this project: server data lives only in the Query cache, never
> copied into `useState`. UI-only state (form fields, toggles) uses `useState`.

---

## Setup

| API                                   | Where                                                     | Notes                                                                                                                         |
| ------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `new QueryClient({ defaultOptions })` | [app/queryClient.ts](../../client/src/app/queryClient.ts) | `staleTime: 30s`, no refetch on window focus, a custom `retry` that never retries 4xx errors (they will not succeed on retry) |
| `<QueryClientProvider client>`        | [app/App.tsx](../../client/src/app/App.tsx)               | Makes the cache available to every hook                                                                                       |

## Reading data

### `useQuery({ queryKey, queryFn })`

| Hook                   | Key                                | Where                                                                           |
| ---------------------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| `useExpressionHistory` | `['expressions','history',params]` | [hooks/useExpressionHistory.ts](../../client/src/hooks/useExpressionHistory.ts) |
| `useExpressionStats`   | `['expressions','stats',params]`   | same file                                                                       |
| `useExpressionTrends`  | `['expressions','trends',params]`  | same file                                                                       |
| `useCurrentUser`       | `['auth','me']`                    | [hooks/useAuth.ts](../../client/src/hooks/useAuth.ts)                           |

- **Query keys** identify cached data. Including `params` in the key means page 2
  and page 3 are cached separately. All expression keys start with
  `'expressions'`, so one call can invalidate them all.
- **`signal`**: `queryFn: ({ signal }) => api.list(params, signal)` passes an
  `AbortSignal` to `fetch`, so a request is cancelled when it's no longer needed.
- **`placeholderData: keepPreviousData`** keeps showing the old page while the new
  one loads (no flicker when changing filters).
- **Result fields used:** `data`, `isPending`, `error`, `refetch()`.

### `useInfiniteQuery`: cursor pagination

```ts
useInfiniteQuery({
  queryKey: expressionKeys.feed(params),
  queryFn: ({ pageParam, signal }) => expressionApi.feed(params, pageParam, signal),
  initialPageParam: '', // '' = newest first
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined, // undefined = no more
});
```

[HistoryPage](../../client/src/pages/History/HistoryPage.tsx) flattens
`data.pages`, shows **Load more** while `hasNextPage` is true, calls
`fetchNextPage()`, and shows `isFetchingNextPage` as a loading state.

## Writing data: `useMutation`

| Mutation                                                                       | After success                                                                                                                   |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `useSaveDetection`, `useDeleteDetection`                                       | `invalidateQueries({ queryKey: ['expressions'] })`: every history/stats/trend view refetches                                    |
| `useLogin`, `useRegister`, `useLogout`, `useResetPassword`, `useDeleteAccount` | `setQueryData(['auth','me'], user)` + `resetQueries(['expressions'])`: the identity changed, so drop the old user's cached data |
| `useUpdateRetention`, `useChangePassword`                                      | `setQueryData(['auth','me'], user)` with the server's answer                                                                    |
| `useVerifyEmail`                                                               | `invalidateQueries(['auth','me'])`                                                                                              |

Result fields used: `mutate(vars, { onSuccess })`, `isPending`, `isSuccess`,
`error`, `variables` (HistoryPage disables the row being deleted).

**`invalidateQueries` vs `resetQueries` vs `setQueryData`**

- `setQueryData`: "I already know the new value", so it updates the cache instantly.
- `invalidateQueries`: "this may be outdated", so it marks the data stale and refetches if it's on screen.
- `resetQueries`: "forget it completely", so it returns to the initial state. Used on sign-in/out so no
  flash of the previous user's history appears.

## Cache + live updates

[useLiveUpdates](../../client/src/hooks/useLiveUpdates.ts) receives a
Server-Sent Event when a detection is saved anywhere and calls
`invalidateQueries({ queryKey: ['expressions'] })` (debounced). That single line
makes every open page refresh.

## Direct cache access: `useQueryClient()`

Used when a hook needs the cache without owning a query: `useAutoSave` (saves
through the API directly, then invalidates), `useAuth`, `useAccount`, `useLiveUpdates`.

## Testing

Tests create a fresh `QueryClient` per test with `retry: false`
([renderWithProviders.tsx](../../client/src/test/renderWithProviders.tsx)), so
failures surface immediately and no data leaks between tests.

## Exercises

1. Set `staleTime: 0` and switch between the History and Dashboard pages. Watch the
   network tab.
2. Add an optimistic delete: remove the row from the cache in `onMutate` and roll back in
   `onError`.
