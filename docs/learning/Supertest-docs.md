# Supertest & mongodb-memory-server — learning guide

Server integration tests send **real HTTP requests** to the Express app (Supertest)
backed by a **real MongoDB** that lives only for the test run
(mongodb-memory-server). No developer database is ever touched.

Tests: [server/tests/integration/](../../server/tests/integration/) · helpers:
[server/tests/helpers/](../../server/tests/helpers/)

---

## Supertest API used

```ts
const app = createApp(); // not listening on a port
await request(app).post('/api/v1/expressions').send(body).expect(201);
await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');
```

| API                                        | Why                                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `request(app).get/post/patch/delete(path)` | Starts the app on an ephemeral port per request                                                       |
| `.send(json)`, `.set(header, value)`       | Body and headers (`Cookie`, `Origin`, `X-Request-Id`, `Content-Type`)                                 |
| `.expect(status)`                          | Assert the status code                                                                                |
| `response.body`, `.headers`, `.text`       | Inspect the response (`text` for `/metrics` and the export)                                           |
| **`request.agent(app)`**                   | Keeps cookies between requests, like a browser session. Used for "Alice", "Bob" and "another device". |

`signedInAgent(app, email)` ([factories.ts](../../server/tests/helpers/factories.ts))
registers a user and returns their agent.

## The in-memory database

[testDatabase.ts](../../server/tests/helpers/testDatabase.ts):

```ts
server = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
await mongoose.connect(server.getUri('expression_test'));
await ensureIndexes();
afterEach: delete all documents   afterAll: disconnect + stop
```

It's a **replica set**, not a standalone server, so transactions (account deletion)
and change streams (live updates) behave as in production. The MongoDB binary is
downloaded once and cached; CI caches it too (`MONGOMS_DOWNLOAD_DIR`).

## Streaming responses (SSE)

Supertest waits for a response to _end_, which an event stream never does. The
live-updates test starts `app.listen(0)` and reads the stream with Node's
`fetch` + `response.body.getReader()`, parsing `event:`/`data:` blocks, and
aborts with an `AbortController` at the end.

## What the integration suites prove

- Validation (every rejection case), pagination (page + cursor with identical timestamps),
  statistics and time-zone-correct trends
- Auth: cookies' flags, bcrypt storage, token revocation, refresh misuse, generic
  login errors
- Authorization: users can't see, read or delete each other's data
- Account: export, retention (TTL), password change signing out other devices,
  transactional delete
- Email: links in the memory outbox, single use, hashed storage, no enumeration
- Platform: health, 404 shape, security headers, CORS, request ids, rate-limit headers,
  `/metrics` labels, and `explain()` index usage

## Exercises

1. Add a test that `DELETE /api/v1/expressions/:id` by Bob on Alice's record leaves it in the database.
2. Use `request.agent` to write a test that logout makes `/auth/refresh` fail.
