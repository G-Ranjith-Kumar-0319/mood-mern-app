# Mongoose — learning guide for this project

Mongoose 9 is the MongoDB object-data-modelling library: schemas, validation,
typed models and a query builder on top of the official driver. Database _concepts_
are in [MongoDB-docs.md](MongoDB-docs.md).

---

## Connection

| API                                                                                  | Where                                                     | Notes                                                                                   |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `mongoose.connect(uri, { maxPoolSize, serverSelectionTimeoutMS, autoIndex: false })` | [config/database.ts](../../server/src/config/database.ts) | Connection **pool** per instance; fail fast (5 s) if MongoDB is down                    |
| `mongoose.set('strictQuery', true)`                                                  | database.ts                                               | Filters on fields not in the schema are dropped instead of silently matching everything |
| `mongoose.connection.on('connected' \| 'disconnected' \| 'reconnected' \| 'error')`  | database.ts                                               | Connection monitoring → logs                                                            |
| `mongoose.connection.readyState` / `ConnectionStates.connected`                      | database.ts                                               | Readiness                                                                               |
| `mongoose.connection.db.admin().ping()` / `.command({ hello: 1 })`                   | database.ts                                               | Readiness probe; replica-set detection                                                  |
| `mongoose.connection.transaction(fn)`                                                | `withTransaction`                                         | Runs `fn(session)` in a transaction and retries transient errors                        |
| `mongoose.disconnect()`                                                              | shutdown                                                  |                                                                                         |

`MongoMemoryReplSet` (from `mongodb-memory-server`) supplies a throw-away replica
set for development and tests.

## Schemas and models

```ts
const schema = new Schema({ expression: { type: String, enum: SUPPORTED_EXPRESSIONS, required: true }, … },
                          { timestamps: true, versionKey: false });
schema.index({ userId: 1, detectedAt: -1, _id: -1 });
export type ExpressionDetection = InferSchemaType<typeof schema> & { _id: Types.ObjectId };
export const ExpressionDetectionModel = model('ExpressionDetection', schema);
```

- Validators used: `required`, `enum`, `min`, `max`, `maxlength`, `lowercase`, `trim`,
  `default`. They're the last line of defence after Zod.
- `select: false` on `passwordHash`: never returned unless asked for (`.select('+passwordHash')`).
- `timestamps: true` adds `createdAt`/`updatedAt`; `versionKey: false` drops `__v`.
- `InferSchemaType` derives the TypeScript type from the schema (one source of truth).
- Files: [models/](../../server/src/models/)

## Queries (all in `repositories/`)

| Method                                                        | Used for                                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Model.create(doc)`                                           | insert                                                                                                        |
| `find(filter, projection)` + `.sort()` `.skip()` `.limit()`   | history (page and cursor modes)                                                                               |
| `findOne`, `findById`                                         | lookups                                                                                                       |
| `findByIdAndUpdate(id, update, { returnDocument: 'after' })`  | update + return the new version (`{ new: true }` is deprecated in Mongoose 9; the test run printed a warning) |
| `findOneAndDelete`                                            | **consume** an email token atomically: find and delete in one step, so a link works once                      |
| `updateOne`, `updateMany`                                     | settings, verification, retention                                                                             |
| `updateMany(filter, [pipeline], { updatePipeline: true })`    | pipeline updates need an explicit opt-in in Mongoose 9 (we got a 500 until this was added)                    |
| `deleteOne`, `deleteMany` (`{ session }` inside transactions) | deletion                                                                                                      |
| `countDocuments(filter)`                                      | page-mode totals                                                                                              |
| `aggregate([...])`                                            | stats and trends                                                                                              |
| `.lean<T>()`                                                  | return plain objects instead of full documents (faster, less memory). Used for every read.                    |
| `.cursor()`                                                   | stream results one by one (data export)                                                                       |
| `Model.watch(pipeline)`                                       | change stream (live updates)                                                                                  |
| `.explain('executionStats')`                                  | index verification in tests                                                                                   |
| `Model.createIndexes()`                                       | create schema indexes at startup (never drops any)                                                            |
| `insertMany`                                                  | bulk inserts in tests                                                                                         |

**Projection** (`PUBLIC_PROJECTION`) returns only the fields the API exposes.

**Concurrency:** `Promise.all([find(...), countDocuments(...)])` runs both queries
at the same time instead of one after the other.

## Errors Mongoose throws (mapped in errorHandler)

- `mongoose.Error.CastError`: e.g. an invalid ObjectId → 400
- `mongoose.Error.ValidationError`: schema validation → 400
- `mongoose.mongo.MongoServerError` with `code 11000`: duplicate key (email) → 409
- `MongoServerSelectionError` / `MongoNetworkError` / `MongoNotConnectedError` → 503

## `Types.ObjectId`

Used for owner ids (`req.user.id`), `isValid` checks, and creating ids from strings
(cursor decoding, JWT subjects).

## Exercises

1. Remove `.lean()` from the history query and measure the response time with 5 000 documents.
2. Make `displayName` required in the schema but not in Zod. Which layer rejects a
   registration without one, and with what error?
