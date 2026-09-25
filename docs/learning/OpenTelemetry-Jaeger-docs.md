# OpenTelemetry & Jaeger (tracing) — learning guide for this project

A **trace** shows one request's journey as a tree of timed **spans**: HTTP →
Express middleware → route handler → MongoDB query → Redis command. **OpenTelemetry**
(OTel) is the vendor-neutral standard for producing traces. **Jaeger** stores and
displays them.

Code: [server/src/instrumentation.ts](../../server/src/instrumentation.ts)

Start it: `OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318 docker compose --profile observability up --build`,
then open **http://localhost:16686** and pick service `expression-api`.

---

## How automatic instrumentation works

Instrumentation libraries **patch** other libraries (`http`, `express`, `mongodb`,
`mongoose`, `pino`, `redis`) as they're imported, wrapping their functions to
record spans. So:

1. Tracing must be set up **before** the app imports those libraries, hence
   `node --import ./dist/instrumentation.js dist/server.js`.
2. ES modules can't be patched by overriding `require`, so an **ESM loader hook** is
   registered: `module.register('@opentelemetry/instrumentation/hook.mjs', import.meta.url)`.

## APIs used

| API                                                                                                   | Why                                                                          |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `new NodeSDK({ resource, traceExporter, instrumentations })` + `sdk.start()`                          | Wires everything                                                             |
| `resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'expression-api' })`                                   | Names the service in Jaeger                                                  |
| `new OTLPTraceExporter()`                                                                             | Sends spans over OTLP/HTTP to `OTEL_EXPORTER_OTLP_ENDPOINT` (+ `/v1/traces`) |
| `HttpInstrumentation({ ignoreIncomingRequestHook })`                                                  | Skips health checks and `/metrics` scrapes                                   |
| `ExpressInstrumentation`, `MongoDBInstrumentation`, `MongooseInstrumentation`, `RedisInstrumentation` | Spans per middleware, query, command                                         |
| `PinoInstrumentation`                                                                                 | Adds `trace_id`/`span_id` to log lines                                       |
| `sdk.shutdown()` on SIGTERM                                                                           | Flushes buffered spans before exit                                           |

**Opt-in:** without `OTEL_EXPORTER_OTLP_ENDPOINT` the file does nothing, so there's
zero overhead when you don't run a collector. The OTel packages are loaded with
dynamic `import()` only when enabled.

## What was verified

With the observability profile running, Jaeger listed the `expression-api` service.
A search returned 110 spans, including `middleware - helmetMiddleware`,
`router - /register` and `redis-SCRIPT`, and the API's log lines carried matching
`trace_id` values.

(The Jaeger v2 image serves its query API at `/api/v3/...`; `/api/services` returned 404.)

## Metrics vs logs vs traces

| Signal  | Answers                                            | Here                 |
| ------- | -------------------------------------------------- | -------------------- |
| Metrics | _Is something wrong?_ (rates, latencies)           | Prometheus/Grafana   |
| Logs    | _What happened?_ (events with details)             | Pino JSON            |
| Traces  | _Where did the time go?_ (one request, end to end) | OpenTelemetry/Jaeger |

They're linked by ids: request id (Nginx ↔ logs) and trace id (logs ↔ traces).

## Exercises

1. Open a trace for `GET /api/v1/expressions/stats` and find the MongoDB `aggregate` span.
2. Add a custom span around the export in `account.service.ts` using
   `trace.getTracer('app').startActiveSpan(...)` from `@opentelemetry/api`.
