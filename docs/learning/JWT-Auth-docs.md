# Authentication (JWT, bcrypt, cookies, email tokens) — learning guide

Auth is optional in this app, but when used it follows production practice. Libraries:
**jsonwebtoken** (JWTs), **bcryptjs** (password hashing), **cookie-parser**
(reading cookies), and Node's **crypto** (one-time email tokens).

---

## Passwords: bcryptjs

[utils/passwords.ts](../../server/src/utils/passwords.ts)

| Call                                                 | Why                                                                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bcrypt.hash(password, 12)`                          | Cost 12 ≈ 250 ms per hash: fine for one login, very slow for an attacker trying billions. The salt is generated and embedded automatically.      |
| `bcrypt.compare(password, hash)`                     | Re-hashes and compares                                                                                                                           |
| `bcrypt.hashSync('…', 12)` at startup → `DUMMY_HASH` | When the email doesn't exist, we still compare against a dummy hash, so "unknown email" and "wrong password" take the same time (no timing leak) |

bcrypt only reads the first **72 bytes**; longer passwords are rejected by Zod.

## Tokens: jsonwebtoken

[services/token.service.ts](../../server/src/services/token.service.ts)

```ts
jwt.sign({ type: 'access' }, accessSecret, {
  algorithm: 'HS256',
  subject: userId,
  issuer,
  expiresIn: 900,
});
jwt.verify(token, accessSecret, { algorithms: ['HS256'], issuer });
```

- **Two tokens:** a short-lived _access_ token (15 min, checked without a
  database) and a long-lived _refresh_ token (7 days, checked against the database).
- **Separate secrets and a `type` claim:** a refresh token can never be used as an
  access token, or the other way round (tested).
- **Pinned algorithm** (`algorithms: ['HS256']`) blocks the `alg: none` and
  algorithm-confusion attacks (tested with a forged unsigned token).
- **Revocation without sessions:** refresh tokens carry the user's
  `tokenVersion`. Logout, a password change or a reset does `$inc: { tokenVersion: 1 }`,
  so every older refresh token stops working.

## Cookies

[utils/authCookies.ts](../../server/src/utils/authCookies.ts)

```ts
res.cookie('access_token', token, {
  httpOnly: true,
  secure,
  sameSite: 'strict',
  path: '/api',
  maxAge,
});
```

| Flag                 | Protects against                                                         |
| -------------------- | ------------------------------------------------------------------------ |
| `httpOnly`           | JavaScript (and any XSS payload) can't read the token                    |
| `sameSite: 'strict'` | the browser doesn't send it on cross-site requests (CSRF)                |
| `secure`             | sent over HTTPS only in production (`http://localhost` counts as secure) |
| `path`               | the refresh cookie goes only to `/api/v1/auth`, not every request        |

`res.clearCookie` must use the **same options** or the browser keeps the cookie.

## The request flow

1. `authenticate` middleware: no cookie → anonymous; valid → `req.user`; invalid
   or expired → **401 INVALID_TOKEN** (never silently anonymous).
2. The client's `apiRequest` sees 401 INVALID_TOKEN → calls `/auth/refresh` once
   (shared between parallel requests) → retries the original request.
3. If the refresh fails, the server clears the cookies and the app continues as anonymous.

## One-time email tokens (verification, password reset)

[services/oneTimeToken.service.ts](../../server/src/services/oneTimeToken.service.ts)

- `randomBytes(32).toString('base64url')`: 256 bits of randomness in the link.
- Only `sha256(token)` is stored, so a database leak doesn't expose working links.
- Expiry (24 h for verification, 1 h for reset) is enforced in the query _and_ by a TTL index.
- **Single use:** `findOneAndDelete` finds and removes the token atomically.
- Issuing a new link deletes older ones of the same type.
- The reset _request_ always answers `{ sent: true }`, even for unknown emails (no account enumeration).
- The verify page waits for a **click** instead of auto-submitting, because email
  security scanners pre-open links and would use up the token.

## Authorization

Every expression query includes `userId: req.user?.id ?? null`. Another user's
document looks exactly like a missing one (404), so ids can't be probed. Tests use
two users and an anonymous client to prove this.

## Rate limiting on auth routes

Login, register, password change and account deletion share a strict per-IP limiter
(failures count). Email-sending routes have their own limiter where _every_
request counts. See [ExpressSecurity-docs.md](ExpressSecurity-docs.md).

## Exercises

1. Decode your access token on jwt.io (copy it from DevTools → Application →
   Cookies). What's inside, and what _isn't_ (no email, no password)?
2. Log in on two browsers, change the password in one, and try to refresh in the other.
