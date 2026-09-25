# Nodemailer & Mailpit — learning guide for this project

**Nodemailer** sends email from Node.js over SMTP. **Mailpit** is a fake SMTP
server with a web inbox for development, so no real email leaves your machine.

Code: [services/mailer.ts](../../server/src/services/mailer.ts),
[services/emailTemplates.ts](../../server/src/services/emailTemplates.ts)

---

## Nodemailer API used

```ts
const transport = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
await transport.sendMail({ from, to, subject, text, html });
```

- `secure: true` means TLS from the first byte (port 465); otherwise STARTTLS may upgrade
  the connection (port 587). The config derives `secure` from the port unless set.
- Every email has both `text` and `html` parts (some clients show only one).
- All user-provided values are HTML-escaped in templates (`escapeHtml`).

## Four delivery modes (chosen from configuration)

| Mode       | When                     | Behaviour                                                                        |
| ---------- | ------------------------ | -------------------------------------------------------------------------------- |
| `smtp`     | `SMTP_HOST` set          | Real delivery (Mailpit in Compose, your provider in production)                  |
| `log`      | development without SMTP | The email, **including its link**, is written to the API log so you can click it |
| `memory`   | tests                    | Kept in `sentEmails`; tests read the link from there                             |
| `disabled` | production without SMTP  | Nothing sent, and links are **never** logged (they're secrets)                   |

This is a small strategy pattern: callers just `await mailer.send(email)`.

## Emails the app sends

| Trigger                              | Email                     | Link                                        |
| ------------------------------------ | ------------------------- | ------------------------------------------- |
| Registration, "Re-send verification" | Verify your email address | `/verify-email?token=…` (24 h)              |
| "Forgot password"                    | Reset your password       | `/reset-password?token=…` (1 h, single use) |

A mail outage never blocks registration: the error is logged, and the user can
re-send the verification email later from the Account page.

## Mailpit

`docker compose up` starts `axllent/mailpit`; the API sends to `mailpit:1025`.
Open **http://localhost:8025** to read the emails and click the links.

Its API was used to verify the flow automatically:
`GET /api/v1/messages` lists emails; `GET /api/v1/message/{ID}` shows one.

## Exercises

1. Register in the Docker stack and verify your email through Mailpit.
2. Request a password reset twice. Why does the first link stop working?
