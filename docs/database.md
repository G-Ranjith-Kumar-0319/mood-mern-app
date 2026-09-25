# Database

MongoDB 8 via Mongoose 9. Three collections: `expressiondetections`, `users`, `authtokens`.
Concepts are explained in [learning/MongoDB-docs.md](learning/MongoDB-docs.md).

## `expressiondetections`

One document per _meaningful_ event (a stable expression segment or a manual save), never per
frame. **No image or video data is stored.**

| Field                    | Type             | Notes                                                                     |
| ------------------------ | ---------------- | ------------------------------------------------------------------------- |
| `_id`                    | ObjectId         | also the tie-breaker for ordering and cursors                             |
| `userId`                 | ObjectId \| null | Owner (`null` = anonymous), always set from the session, never from input |
| `expression`             | string           | enum of the 7 model classes                                               |
| `confidence`             | number           | 0–1 (Zod + schema `min`/`max`)                                            |
| `detectedAt`             | Date             | segment start / manual save time                                          |
| `durationMs`             | number \| null   | segment length (auto-save)                                                |
| `source`                 | `"camera"`       |                                                                           |
| `expiresAt`              | Date \| null     | when MongoDB deletes it (data retention); `null` = kept                   |
| `createdAt`, `updatedAt` | Date             | Mongoose timestamps                                                       |

## `users`

| Field           | Notes                                                                    |
| --------------- | ------------------------------------------------------------------------ |
| `email`         | lowercase, trimmed, **unique index**                                     |
| `passwordHash`  | bcrypt (cost 12), `select: false`                                        |
| `displayName`   | optional                                                                 |
| `tokenVersion`  | incremented on logout / password change / reset → revokes refresh tokens |
| `emailVerified` | set by the verification link (or a successful password reset)            |
| `retentionDays` | 7 / 30 / 90 / 365 / null                                                 |

## `authtokens`

Pending email links. Only `tokenHash = sha256(token)` is stored; the raw token exists only in the email.

| Field                                                 | Notes                                            |
| ----------------------------------------------------- | ------------------------------------------------ |
| `userId`, `type` (`verify-email` \| `reset-password`) |                                                  |
| `tokenHash`                                           | **unique index**: lookup when a link is used     |
| `expiresAt`                                           | 24 h / 1 h; **TTL index** removes expired tokens |

Consumption is `findOneAndDelete({ tokenHash, type, expiresAt: { $gt: now } })`, which is atomic,
so a link works exactly once.

## Query patterns → indexes

| Query (repository method)       | Shape                                                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| History page mode `findMany`    | `{ userId, [expression], [detectedAt range] }` sort `{ detectedAt: -1, _id: -1 }`, skip/limit + `countDocuments` |
| History cursor mode `findAfter` | same filter + `$or: [{ detectedAt < d }, { detectedAt = d, _id < id }]`, same sort, `limit + 1`                  |
| Stats `countByExpression`       | `$match { userId, [range] }` → `$group` by expression                                                            |
| Trends `countByPeriod`          | `$match { userId, [range] }` → `$group` by `$dateTrunc(detectedAt, unit, timezone)` + expression                 |
| Export `streamForOwner`         | `{ userId }` sort `{ detectedAt: 1 }` as a cursor                                                                |
| Retention `applyRetention`      | `updateMany({ userId }, [pipeline])`                                                                             |
| Single item                     | `{ _id, userId }`                                                                                                |
| Login / reset request           | `users.findOne({ email })`                                                                                       |
| Email link                      | `authtokens.findOneAndDelete({ tokenHash, … })`                                                                  |

### Index 1: `expressiondetections { userId: 1, detectedAt: -1, _id: -1 }`

- **Supports:** history (both modes, with or without date range), stats and trends `$match`, export.
  Owner = _equality_ on the prefix; `detectedAt, _id` serve the _sort_ and _range_ (the ESR rule),
  so results come out of the index already ordered.
- **Why `_id` too:** history sorts by `(detectedAt, _id)` so every order is total and cursors are
  exact even for identical timestamps. Without `_id` in the index, MongoDB would need an in-memory
  `SORT` for ties.
- **Selectivity:** high for signed-in users; the anonymous bucket is broader, but the sorted index
  lets a page query stop after `limit` entries.
- **Write overhead:** one B-tree insert per saved detection, which is rare by design.
- **Verified:** tests run `explain("executionStats")` and assert an `IXSCAN` on this index, **no
  `SORT` stage**, and `totalDocsExamined === nReturned`. A deep cursor page examined ≤ 12
  documents for 11 results.
- **Migration:** it replaces the earlier `{ userId: 1, detectedAt: -1 }`. `createIndexes()` never
  drops anything, so startup explicitly drops the superseded index (`OBSOLETE_INDEXES` in
  `config/database.ts`).

### Index 2: `expressiondetections { expiresAt: 1 }` with `expireAfterSeconds: 0` (TTL)

Data retention. MongoDB's TTL monitor (about once a minute) deletes documents whose `expiresAt`
has passed. Documents with `expiresAt: null` are ignored. `expiresAt` is set at insert
(`detectedAt + retention`) and recomputed for all of a user's documents when they change the
setting, with one server-side pipeline update:

```js
updateMany(
  { userId },
  [{ $set: { expiresAt: { $dateAdd: { startDate: '$detectedAt', unit: 'day', amount: 30 } } } }],
  { updatePipeline: true },
); // Mongoose 9 requires this opt-in
```

Anonymous detections use `ANONYMOUS_RETENTION_DAYS` (default 30, `0` = keep).

### Index 3: `users { email: 1 }` (unique)

Login lookup, plus the real guarantee against duplicate accounts (no check-then-insert race).

### Indexes 4–6: `authtokens`

`{ tokenHash: 1 }` unique (link lookup), `{ userId: 1, type: 1 }` (invalidate older links),
`{ expiresAt: 1 }` TTL (cleanup).

### Deliberately _not_ created

| Candidate                                      | Why not (yet)                                                                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `{ detectedAt: -1 }`                           | No query ignores the owner. Redundant with index 1.                                                                         |
| `{ expression: 1, detectedAt: -1 }`            | No cross-user expression query.                                                                                             |
| `{ userId: 1, expression: 1, detectedAt: -1 }` | Helps only expression-filtered history. Add it when `explain()` shows `totalKeysExamined ≫ nReturned` for filtered queries. |

## Aggregations

**Stats:** `$match` → `$group` (`$sum`, `$avg`, `$ifNull`) → `$sort`, returning at most 7 documents.

**Trends:**

```js
{ $group: { _id: { period: { $dateTrunc: { date: '$detectedAt', unit, timezone, startOfWeek: 'monday' } },
                   expression: '$expression' },
            count: { $sum: 1 } } }
```

MongoDB does the time-zone-aware bucketing. `buildTrends()` then fills **empty periods** with
zeros, using the same calendar maths in TypeScript (`utils/timeBuckets.ts`, handling DST and
half-hour zones). An integration test proves both sides agree for `Asia/Kolkata` (UTC+5:30).

## Pagination: page vs cursor

|                           | Page (`?page=N`)                      | Cursor (`?cursor=…`)       |
| ------------------------- | ------------------------------------- | -------------------------- |
| Cost of page N            | grows with N (`skip`) + a count query | constant (index seek)      |
| Total / page numbers      | yes                                   | no                         |
| Stable while data changes | no (items shift)                      | yes                        |
| Used by                   | Recent detections (page 1)            | History page ("Load more") |

## Transactions and change streams (replica set required)

Development (in-memory), tests (in-memory), Docker (1-node) and production (3-node) all run
**replica sets**, so both features work everywhere:

- **Transactions:** account deletion removes detections, email tokens and the user atomically
  (`withTransaction`). On a standalone server (e.g. a developer's local mongod) the same steps
  run in a safe order instead: data first, user last, so a retry is always possible.
- **Change streams:** each API instance watches `insert`s on `expressiondetections` and pushes
  them to that owner's open browsers (SSE). Delete events carry only `_id`, so they're not
  streamed. Streams resume automatically after errors (5 s back-off).

`isReplicaSet()` asks the server (`hello.setName`) once.

## Performance practices

Projection (public fields only), `lean()` everywhere, `find` + `countDocuments` in parallel,
streaming export (cursor + back-pressure), connection pooling (`MONGO_MAX_POOL_SIZE`), fail-fast
server selection (5 s), no N+1 queries, and all counting and grouping inside MongoDB.

## Replication vs high availability vs sharding

| Concept           | What it gives                  | This project                                                                 |
| ----------------- | ------------------------------ | ---------------------------------------------------------------------------- |
| Replication       | copies on several servers      | 3 members in prod compose, 1 locally                                         |
| High availability | automatic failover (election)  | yes; tested by stopping the primary, writes continued                        |
| Read scaling      | reads from secondaries         | not used (read-your-own-writes)                                              |
| Sharding          | data split across replica sets | **not used**: see [ADR 0007](decisions/0007-replica-set-without-sharding.md) |

## Backups (production)

Not automated here. Use platform snapshots (e.g. MongoDB Atlas backup) or scheduled `mongodump`
from a **secondary**, and test restores.
