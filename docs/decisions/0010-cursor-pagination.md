# 0010 — Cursor (keyset) pagination for the history feed

**Status:** accepted

## Context

`skip/limit` pagination gets slower with depth (MongoDB walks and discards `skip` entries) and
needs an extra `countDocuments`. Items also shift between pages when new detections arrive.

## Decision

- `GET /expressions?cursor=` switches the same endpoint to cursor mode (no new endpoint). An empty
  cursor means "newest first"; the response carries an opaque `nextCursor` = base64url(JSON
  `{ detectedAt, _id }`) of the last item, plus `hasMore` (one extra document is fetched to know).
- The sort is `(detectedAt desc, _id desc)`, so every order is total, even for identical timestamps.
- The index became `{ userId: 1, detectedAt: -1, _id: -1 }` so the tie-broken sort needs no
  in-memory SORT. Startup drops the superseded `{ userId, detectedAt }` index.
- Page mode stays for compatibility (the home page's "Recent history" uses page 1). `page` and
  `cursor` together are rejected.
- The History page uses TanStack `useInfiniteQuery` with a **Load more** button.

## Consequences

- Constant cost per page: `explain()` shows ≤ 12 documents examined for an 11-item page deep in the
  feed. There are no totals or page numbers in cursor mode.
- An integration test walks 23 documents with identical timestamps in pages of 5 and sees each
  exactly once.
- While building this we found that the API client dropped empty query parameters, so `cursor=`
  never reached the server. The client now omits only `undefined`.
