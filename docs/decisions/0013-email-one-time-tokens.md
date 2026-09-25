# 0013 — Email verification and password reset with hashed one-time tokens

**Status:** accepted

## Context

Accounts need a recovery path and a way to confirm addresses, without new attack surface: link
guessing, token theft from the database, account enumeration, or email spam.

## Decision

- Tokens: 32 random bytes (base64url) in the link; **only SHA-256 hashes** are stored in
  `authtokens`, with a TTL index. Lifetimes: 24 h (verify) and 1 h (reset).
- Consumed with `findOneAndDelete` (atomic, single use); issuing a new link deletes older ones.
- Reset requests always answer `{ sent: true }`; a successful reset changes the password, bumps
  `tokenVersion` (signing out every session), marks the email verified and returns a fresh session.
- The client pages act only on a **button click**, because email security scanners pre-open links.
- Delivery through nodemailer in four modes: SMTP; development log (prints the link); test memory
  outbox; production-without-SMTP disabled (never logs links). Docker Compose includes **Mailpit**.
- Email-sending endpoints have their own limiter (5 per 15 min per IP; every request counts).

## Consequences

- Integration tests read links from the memory outbox and prove single use, hashing, re-send
  invalidation and no enumeration. Mailpit delivery was verified in Docker.
- A mail outage doesn't block registration (logged; the user can re-send from the Account page).
