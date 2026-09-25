# 0012 — Prometheus metrics and opt-in OpenTelemetry tracing

**Status:** accepted

## Context

Logs (Pino) and request ids existed. We also wanted rates, latency percentiles and error ratios
across instances (metrics), and per-request timing through Express, MongoDB and Redis (traces).

## Decision

- **Metrics:** `prom-client` exposes `GET /metrics`, with default process metrics, a request-latency
  histogram labelled by **route pattern** (never raw URLs, which would mean unbounded cardinality),
  `expression_detections_saved_total{expression}` and `live_update_subscribers`. Nginx doesn't proxy
  `/metrics`.
- **Prometheus** discovers every API replica through Docker DNS (`dns_sd_configs`); **Grafana** is
  provisioned from files (data sources + dashboard).
- **Tracing:** OpenTelemetry `NodeSDK` with HTTP, Express, MongoDB, Mongoose, Pino and Redis
  instrumentations, exported over OTLP/HTTP to **Jaeger**. It's loaded with
  `node --import ./dist/instrumentation.js` and an ESM loader hook (`module.register`). It's
  **opt-in**: without `OTEL_EXPORTER_OTLP_ENDPOINT` the file does nothing.
- The monitoring stack lives in a Compose **profile** (`observability`), so the default stack stays small.

## Consequences

- Verified: both replicas scraped, a 9-panel dashboard, 110 spans in Jaeger, and `trace_id` in log lines.
- Route labels had to be rebuilt from `originalUrl`, because Express resets `req.baseUrl` when an
  error leaves a router (found by a test).
- Extra dependencies (OTel) ship in the API image even when tracing is off; the runtime cost is zero.
