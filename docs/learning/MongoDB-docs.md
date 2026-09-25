# MongoDB — learning guide for this project

MongoDB 8 stores users, detection events and one-time email tokens. This guide
covers the **database concepts and operators** used. The Node.js library layer is in
[Mongoose-docs.md](Mongoose-docs.md). The design rationale is in [database.md](../database.md).

---

## Documents and collections

| Collection             | One document is…                                                    |
| ---------------------- | ------------------------------------------------------------------- |
| `expressiondetections` | a saved detection (label, confidence, time, owner, optional expiry) |
| `users`                | an account (email, bcrypt hash, token version, settings)            |
| `authtokens`           | a pending email link (hash of the token, type, expiry)              |

## Query operators used

| Operator        | Meaning             | Where                                                           |
| --------------- | ------------------- | --------------------------------------------------------------- |
| `$gte` / `$lte` | ≥ / ≤ (date ranges) | history, stats, trends filters                                  |
| `$lt` / `$gt`   | < / >               | cursor pagination; unexpired tokens (`expiresAt: { $gt: now }`) |
| `$or`           | any of              | cursor: `detectedAt < d OR (detectedAt = d AND _id < id)`       |
| `$ne`           | not equal           | tests                                                           |

## Update operators used

| Operator                                                         | Where                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `$set`                                                           | settings, email verification                                                    |
| `$inc`                                                           | `tokenVersion + 1` revokes all refresh tokens _atomically_                      |
| **Pipeline update** `[{ $set: { expiresAt: { $dateAdd: … } } }]` | recomputes every document's expiry **inside MongoDB** from its own `detectedAt` |

## Aggregation pipelines

Statistics are computed by MongoDB. Node never loads the individual documents:

```js
[
  { $match: { userId, detectedAt: { $gte, $lte } } },
  {
    $group: {
      _id: '$expression',
      count: { $sum: 1 },
      averageConfidence: { $avg: '$confidence' },
      totalDurationMs: { $sum: { $ifNull: ['$durationMs', 0] } },
    },
  },
  { $sort: { count: -1, _id: 1 } },
];
```

Trends group by **time bucket and expression**, using `$dateTrunc` with a time zone
and Monday week starts:

```js
{ $group: { _id: { period: { $dateTrunc: { date: '$detectedAt', unit: 'day',
                                            timezone: 'Asia/Kolkata', startOfWeek: 'monday' } },
                   expression: '$expression' }, count: { $sum: 1 } } }
```

Stages used: `$match`, `$group`, `$sort`. Accumulators: `$sum`, `$avg`.
Expressions: `$ifNull`, `$dateTrunc`, `$dateAdd`.
**Where:** [repositories/expression.repository.ts](../../server/src/repositories/expression.repository.ts)

## Indexes

| Index                                                                         | Supports                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `{ userId: 1, detectedAt: -1, _id: -1 }`                                      | history sort, date ranges, stats `$match`, cursor pagination |
| `{ expiresAt: 1 }, { expireAfterSeconds: 0 }`                                 | **TTL index**: data retention                                |
| `users { email: 1 } unique`                                                   | login lookup + duplicate-account guard                       |
| `authtokens { tokenHash: 1 } unique`, `{ userId, type }`, `{ expiresAt } TTL` | link lookup, invalidating old links, auto-cleanup            |

- **ESR rule:** Equality fields first (`userId`), then Sort (`detectedAt`, `_id`),
  then Range. With the right order, MongoDB returns documents already sorted (no
  in-memory `SORT` stage).
- **`explain('executionStats')`** proves it. Tests assert an `IXSCAN` on the index,
  no `SORT` stage, and `totalDocsExamined === nReturned`
  ([platform.test.ts](../../server/tests/integration/platform.test.ts),
  [cursor.api.test.ts](../../server/tests/integration/cursor.api.test.ts)).
- **TTL indexes:** a background task (about once a minute) deletes documents whose
  `expiresAt` has passed. Documents with `expiresAt: null` never expire.
- Indexes cost write time and RAM. When a better index replaced
  `{ userId, detectedAt }`, a small migration drops the old one explicitly
  ([config/database.ts](../../server/src/config/database.ts)).

## Keyset (cursor) pagination vs skip/limit

`skip(N)` makes MongoDB walk and discard N entries, so deep pages get slower.
A cursor says "continue after (detectedAt, _id)", and the index jumps straight
there. The test shows a deep cursor examined ≤ 12 documents for an 11-item page.

## Replica sets

A replica set is several `mongod` processes holding the same data: one **PRIMARY**
takes writes, **SECONDARIES** replicate it.

- **High availability:** if the primary dies, the others elect a new one (seconds).
  We tested this by stopping `mongo1`; writes continued.
- **`w: "majority"`** (the default): a write is acknowledged once most members have it.
- **Bootstrap:** `rs.initiate({ _id: 'rs0', members: [...] })`, and `rs.status()` to
  inspect ([mongo/replica-init.js](../../mongo/replica-init.js)).
- **Authentication inside the set:** a shared **keyFile** proves members to each
  other; **users** (`db.createUser`) authenticate clients. The **localhost
  exception** allows creating the first user when none exist.
- **`hello`** is a command answered without authentication. `setName` tells
  whether the server is part of a replica set; the app uses it to decide whether
  transactions and change streams are available.

Development and tests use single-node replica sets (in-memory or Docker), so these
features work everywhere.

## Multi-document transactions

Deleting an account removes detections, tokens and the user _atomically_: all or
nothing (`withTransaction` in database.ts). This requires a replica set. On a
standalone server the steps run in a safe order instead (data first, user last,
so a retry is always possible).

## Change streams

`collection.watch([{ $match: { operationType: 'insert' } }])` pushes every new
detection to the API, which forwards it to that owner's browsers (live updates).
Every API instance watches independently, so fan-out works across instances
without Redis pub/sub. Delete events contain only the `_id` (no owner), which is
why only inserts are streamed.

## Sharding (deliberately not used)

Sharding splits data across several replica sets for write/volume scale. It adds
routers and config servers, and every query must consider the shard key. See
[ADR 0007](../decisions/0007-replica-set-without-sharding.md).

## Exercises

1. In `mongosh`, run the history query with `.explain('executionStats')`, then hide
   the index (`db.expressiondetections.hideIndex(...)`) and compare.
2. Set your retention to 7 days on the Account page and watch documents older than
   7 days disappear within a minute.
3. Watch the collection yourself: `db.expressiondetections.watch()` in mongosh, then
   save a detection in the app.
