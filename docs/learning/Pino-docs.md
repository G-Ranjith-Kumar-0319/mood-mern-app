# Pino (structured logging) — learning guide for this project

**Pino** writes logs as JSON, one object per line, which log platforms can search
by field. **pino-http** adds one log line per HTTP request. **pino-pretty**
colours logs for humans in development.

Code: [config/logger.ts](../../server/src/config/logger.ts),
[middleware/requestLogger.ts](../../server/src/middleware/requestLogger.ts)

---

## Logger configuration

```ts
pino({
  level: config.isTest ? 'silent' : config.logLevel,
  base: { service: 'expression-api' },
  redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]',
                    '*.password', '*.passwordHash'], censor: '[REDACTED]' },
  transport: (development only) { target: 'pino-pretty' },
});
```

- **Levels:** `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`.
- **`redact`** removes secrets even if someone logs a whole object by accident.
- **`base`** adds `service` to every line, which helps when logs from many services mix.
- Structured calls: `logger.info({ port, env }, 'API server listening')` and
  `logger.error({ err: error }, 'Request failed')`. The `err` key serialises the
  stack trace into the _log_, never into the HTTP response.

## pino-http options used

| Option                | Why                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `genReqId`            | Reuse Nginx's `X-Request-Id` when present (validated), otherwise `randomUUID()`. It's echoed back as a response header. |
| `customLogLevel`      | 5xx → error, 4xx → warn, else info                                                                                      |
| `autoLogging.ignore`  | Skip `/api/v1/health*` and `/metrics` (probes every few seconds would drown real traffic)                               |
| `serializers.req/res` | Log only id, method, URL and status. **Never bodies or headers**, which may contain personal data.                      |

Every request line includes `responseTime` (latency in ms), and `req.log` is a child
logger carrying the request id.

## Correlation: request id → trace id

- The same request id appears in the Nginx access log (`request_id=…`), the API log,
  and the user's response header.
- With OpenTelemetry enabled, the Pino instrumentation adds `trace_id` and
  `span_id` to every log line, so you can jump from a log line to the full trace in
  Jaeger (verified: log lines contained `"trace_id":"1a88…"`).

## Reading logs

```bash
docker compose logs -f api                 # JSON lines
docker compose logs api | grep '"statusCode":5'
```

## Exercises

1. Make a request with `-H 'X-Request-Id: my-test-123'` and find it in the logs.
2. Add `logger.debug(...)` somewhere and run with `LOG_LEVEL=debug`.
