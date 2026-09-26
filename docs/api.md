# REST API

Base path: `/api/v1`. All request and response bodies are JSON (except the event stream and
`/metrics`). In the browser the API is always called on the **same origin** (Vite proxies it in
development, Nginx in Docker/production), and authentication uses HttpOnly cookies.

## Endpoint overview

| Method & path                                                                         | Auth     | Purpose                                                      |
| ------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------ |
| `GET /health`, `/health/live`, `/health/ready`                                        | —        | Health checks                                                |
| `POST /expressions`                                                                   | optional | Save a detection                                             |
| `GET /expressions`                                                                    | optional | History: page mode or **cursor mode**                        |
| `GET /expressions/stats`                                                              | optional | Per-expression statistics                                    |
| `GET /expressions/trends`                                                             | optional | Time series by hour/day/week/month in the viewer's time zone |
| `GET /expressions/events`                                                             | optional | **Server-Sent Events**: live `detection.created` pushes      |
| `GET /expressions/:id`, `DELETE /expressions/:id`                                     | optional | One detection                                                |
| `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me` | —        | Session                                                      |
| `POST /auth/verify-email/request`                                                     | required | (Re)send the verification email                              |
| `POST /auth/verify-email`                                                             | —        | Verify with the emailed token                                |
| `POST /auth/password-reset/request`                                                   | —        | Email a reset link (always answers the same)                 |
| `POST /auth/password-reset`                                                           | —        | Set a new password with the emailed token                    |
| `GET /account`                                                                        | required | Current user incl. settings                                  |
| `PATCH /account/settings`                                                             | required | Data retention                                               |
| `POST /account/password`                                                              | required | Change password (signs out other devices)                    |
| `GET /account/export`                                                                 | required | Download all your data (JSON file)                           |
| `DELETE /account`                                                                     | required | Delete account and all data                                  |
| `POST /camera/sessions`                                                               | —        | Phone-camera pairing session (QR code) for WebRTC            |
| Socket.IO at `/socket.io` (no `/api` prefix)                                          | token    | WebRTC signaling for the phone camera                        |
| `GET /metrics` (no `/api` prefix)                                                     | internal | Prometheus metrics; not reachable through Nginx              |

## Conventions

**Success**: `{ "success": true, "data": … }`

**Page mode**: `"pagination": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }`

**Cursor mode**: `"pagination": { "limit": 20, "nextCursor": "eyJk…", "hasMore": true }`

**Error** (never contains stack traces):

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body (expression: Invalid option: ...)",
    "details": [{ "path": "expression", "message": "Invalid option: ..." }]
  }
}
```

| HTTP | `code`                 | When                                                                                      |
| ---- | ---------------------- | ----------------------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`     | Input failed validation (`details` lists every problem)                                   |
| 400  | `INVALID_JSON`         | Body is not valid JSON                                                                    |
| 400  | `INVALID_LINK`         | Email link token unknown, used or expired                                                 |
| 401  | `UNAUTHORIZED`         | Endpoint requires a signed-in user                                                        |
| 401  | `INVALID_TOKEN`        | Access/refresh token invalid, expired or revoked                                          |
| 401  | `INVALID_CREDENTIALS`  | Wrong email/password (identical for unknown emails), or wrong password on account actions |
| 404  | `NOT_FOUND`            | Unknown route, or a detection that doesn't exist _or belongs to someone else_             |
| 409  | `CONFLICT`             | Email already registered                                                                  |
| 413  | `PAYLOAD_TOO_LARGE`    | Body over 10 KB (Nginx caps it at 16 KB)                                                  |
| 429  | `RATE_LIMITED`         | Too many requests from this IP                                                            |
| 503  | `DATABASE_UNAVAILABLE` | MongoDB unreachable                                                                       |
| 500  | `INTERNAL_ERROR`       | Unexpected (details only in server logs)                                                  |

Every response has an `X-Request-Id` header. Rate-limit status is in the standard
`RateLimit` / `RateLimit-Policy` headers.

## Ownership

Authentication is optional for detections. Every expression endpoint is **scoped to the caller**:
signed in → only that user's detections; anonymous → only anonymous detections (a shared bucket,
auto-deleted after `ANONYMOUS_RETENTION_DAYS`, 30 by default). The owner always comes from the
session cookie; a `userId` in a request body is rejected.

---

## Health

- `GET /health` → `{ "status": "ok", "service": "expression-api" }`
- `GET /health/live` → process is running (`uptimeSeconds`)
- `GET /health/ready` → `200` when MongoDB answers a ping, `503` otherwise. When Redis is
  configured it's reported (`checks.redis`) but not required, because rate limiting fails open.

## Expressions

### `POST /expressions`

| Field        | Type     | Rules                                                        |
| ------------ | -------- | ------------------------------------------------------------ |
| `expression` | string   | one of `neutral happy sad angry fearful disgusted surprised` |
| `confidence` | number   | 0–1                                                          |
| `detectedAt` | string   | ISO-8601 with timezone; ≤ 5 min in the future                |
| `durationMs` | integer? | 0 – 86 400 000                                               |
| `source`     | string?  | `camera`                                                     |

Unknown fields (e.g. `userId`, `image`) are rejected. `201` returns the saved detection. The
server sets its expiry from the owner's retention setting.

### `GET /expressions`: history

| Query        | Default       | Rules                                                                                             |
| ------------ | ------------- | ------------------------------------------------------------------------------------------------- |
| `page`       | 1 (page mode) | integer ≥ 1                                                                                       |
| `cursor`     | —             | **cursor mode**; `cursor=` (empty) = start at the newest; otherwise the `nextCursor` you received |
| `limit`      | 20            | 1–100                                                                                             |
| `expression` | —             | filter                                                                                            |
| `from`, `to` | —             | ISO range on `detectedAt` (inclusive)                                                             |

`page` and `cursor` can't be combined. Cursor mode has no `total` (counting is what makes deep
pages slow) and costs the same at any depth. The cursor is opaque; pass it back unchanged.
Results are newest first, with ties broken by id.

### `GET /expressions/stats`

Query: `from`, `to`. The response has `total`, and `byExpression` for all 7 expressions
(zero-filled, sorted by count then name) with `count`, `percentage`, `averageConfidence` and
`totalDurationMs`.

### `GET /expressions/trends`

| Query        | Default | Rules                                                                     |
| ------------ | ------- | ------------------------------------------------------------------------- |
| `groupBy`    | `day`   | `hour` \| `day` \| `week` (Monday start) \| `month`                       |
| `timezone`   | `UTC`   | IANA zone, e.g. `Asia/Kolkata`; buckets are the viewer's local hours/days |
| `from`, `to` | —       | range; without `from` the series starts at the first detection            |

```json
{
  "success": true,
  "data": {
    "groupBy": "day",
    "timezone": "Asia/Kolkata",
    "from": "2025-01-01T00:00:00.000Z",
    "to": null,
    "series": [
      {
        "period": "2024-12-31T18:30:00.000Z",
        "total": 2,
        "counts": { "happy": 2, "sad": 0, "…": 0 }
      },
      { "period": "2025-01-01T18:30:00.000Z", "total": 0, "counts": { "happy": 0, "…": 0 } }
    ]
  }
}
```

`period` is the bucket's start (UTC instant of local midnight). Empty periods are included with
zeros. More than 400 periods → `400` (choose a coarser `groupBy`).

### `GET /expressions/events`: Server-Sent Events

`Content-Type: text/event-stream`. It stays open and sends:

```text
retry: 5000

event: detection.created
data: {"id":"…","expression":"happy","confidence":0.9,"detectedAt":"…","durationMs":null,…}

: heartbeat            (every 25 s)
```

Only the caller's own detections (or anonymous ones for anonymous callers) are sent. Browsers use
`new EventSource(url)`, which reconnects automatically. It requires a MongoDB replica set;
otherwise the stream stays open but silent.

### `GET /expressions/:id` · `DELETE /expressions/:id`

`200` / `400` (malformed id) / `404` (missing or not yours). Delete returns `{ "id": "…" }`.

---

## Authentication

Tokens are only ever set as cookies, never returned in bodies:

| Cookie          | Lifetime | Path           | Flags                                    |
| --------------- | -------- | -------------- | ---------------------------------------- |
| `access_token`  | 15 min   | `/api`         | HttpOnly, SameSite=Strict, Secure (prod) |
| `refresh_token` | 7 days   | `/api/v1/auth` | HttpOnly, SameSite=Strict, Secure (prod) |

User object: `{ id, email, displayName, emailVerified, retentionDays }`.

- **`POST /auth/register`** `{ email, password (8 chars–72 bytes), displayName? }` → `201 { user }`
  - cookies + a verification email.
- **`POST /auth/login`** `{ email, password }` → `200 { user }` or `401 INVALID_CREDENTIALS`.
- **`POST /auth/refresh`** issues a new pair; on failure it clears cookies → `401 INVALID_TOKEN`.
  The web client calls it automatically on `401 INVALID_TOKEN` and retries once.
- **`POST /auth/logout`** revokes **all** refresh tokens (increments `tokenVersion`) and clears cookies.
- **`GET /auth/me`** → `{ user }` or `{ user: null }`.

### Email verification and password reset

Links look like `APP_URL/verify-email?token=…` and `APP_URL/reset-password?token=…`. Tokens are
random 32-byte values, stored only as SHA-256 hashes, single-use, and expire after 24 h
(verification) or 1 h (reset). Requesting a new link invalidates the previous one.

- **`POST /auth/verify-email/request`** (signed in) → `{ sent: true }`
- **`POST /auth/verify-email`** `{ token }` → `{ verified: true }` or `400 INVALID_LINK`
- **`POST /auth/password-reset/request`** `{ email }` → always `{ sent: true }`, whether or not the account exists
- **`POST /auth/password-reset`** `{ token, password }` → `{ user }` + fresh cookies; all other
  sessions are signed out and the email is marked verified

Rate limits: register/login/verify/reset/password-change/delete share the strict auth limiter
(10 failures / 15 min / IP). Email-sending endpoints allow 5 requests / 15 min / IP.

---

## Account (signed-in users only)

- **`GET /account`** → `{ user }`
- **`PATCH /account/settings`** `{ "retentionDays": 7 | 30 | 90 | 365 | null }` → `{ user }`. Applies
  to existing detections too; expired ones are removed by MongoDB within about a minute.
- **`POST /account/password`** `{ currentPassword, newPassword }` → `{ user }` + fresh cookies;
  every other session is signed out.
- **`GET /account/export`** → a file download (`Content-Disposition: attachment`), streamed:

  ```json
  { "format": "expression-detector-export/v1", "exportedAt": "…",
    "account": { "id": "…", "email": "…", "emailVerified": true, "retentionDays": 30, "createdAt": "…" },
    "detections": [ { "id": "…", "expression": "happy", … } ] }
  ```

- **`DELETE /account`** `{ password }` → `{ deleted: true, deletedDetections: 12 }`. Removes the
  user, their detections and pending email tokens in one transaction, and clears the cookies.

---

## Phone camera (WebRTC signaling)

`POST /api/v1/camera/sessions` (no body, rate-limited) returns `sessionId`, `hostToken`,
`phoneToken`, `cameraUrl` (token in the `#fragment`), `expiresAt` (10 min) and `iceServers`.
The Socket.IO events, payloads, direction rules and error codes are documented in
**[phone-camera-webrtc.md §4](phone-camera-webrtc.md#4-the-api-and-events)**. Video never
passes through the API.

## `GET /metrics`

Prometheus text format, served on the API port and scraped from inside the Docker network (Nginx
doesn't expose it). Main series: `http_request_duration_seconds{method,route,status_code}`,
`expression_detections_saved_total{expression}`, `live_update_subscribers`, and Node process
metrics. See [learning/Prometheus-Grafana-docs.md](learning/Prometheus-Grafana-docs.md).
