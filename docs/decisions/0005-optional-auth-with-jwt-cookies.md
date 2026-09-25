# 0005 — Optional auth with JWTs in HttpOnly cookies

**Status:** accepted

## Context

Detection must work without an account (MVP), but users should be able to keep private history.
The API must stay stateless so it scales horizontally.

## Decision

- Auth is **optional**. Expression endpoints scope every query to the session user, or to the anonymous
  bucket (`userId: null`) when no session exists. An _invalid_ token returns 401 rather than silently
  falling back to anonymous, so the client knows to refresh.
- Short-lived access JWT (15 min) plus refresh JWT (7 days), each signed with its own secret and
  carrying a `type` claim.
- Tokens live in **HttpOnly, SameSite=Strict, Secure** cookies. The refresh cookie is path-scoped to
  `/api/v1/auth`. The browser talks to the API on the same origin (Vite proxy or Nginx), so no
  cross-site cookies or CORS are needed.
- Revocation without a session store: refresh tokens embed the user's `tokenVersion`. Logout increments it.
- bcrypt (cost 12) for passwords. Login is rate limited.

## Alternatives rejected

- **Tokens in localStorage:** readable by any XSS payload.
- **Server-side sessions in memory:** breaks with more than one API instance. A Redis session store
  would work, but adds infrastructure the MVP does not need.

## Consequences

- Any API instance can verify any request with no shared state.
- A stolen access token stays valid for up to 15 minutes. Logout revokes refresh tokens on **all** devices.
- Anonymous history is shared between anonymous visitors of one deployment. This is documented and shown in the UI.
