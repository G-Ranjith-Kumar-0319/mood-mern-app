# Prometheus & Grafana (metrics) — learning guide for this project

**Metrics** are numbers over time: requests per second, latency, memory.
**Prometheus** _pulls_ (scrapes) them from each API instance every 10 s and stores
them. **Grafana** draws dashboards from Prometheus. **prom-client** is the Node
library that exposes the numbers.

Code: [server/src/observability/metrics.ts](../../server/src/observability/metrics.ts) ·
config: [observability/](../../observability/)

Start it: `docker compose --profile observability up --build`, then open
Prometheus at http://localhost:9090 and Grafana at http://localhost:3000.

---

## prom-client API used

| API                                                                        | Metric                                                      | Why                                                            |
| -------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| `new Registry()` + `setDefaultLabels({ service })`                         | —                                                           | Our own registry; every series gets `service="expression-api"` |
| `collectDefaultMetrics({ register })`                                      | `process_cpu_*`, `nodejs_heap_*`, `nodejs_eventloop_lag_*`… | Process health for free                                        |
| `new Histogram({ labelNames: ['method','route','status_code'], buckets })` | `http_request_duration_seconds`                             | Latency distribution → p95/p99                                 |
| `histogram.startTimer()` → `stop(labels)`                                  | —                                                           | Measures one request                                           |
| `new Counter({ labelNames: ['expression'] })` + `.inc()`                   | `expression_detections_saved_total`                         | A business metric                                              |
| `new Gauge({ collect() { this.set(read()) } })`                            | `live_update_subscribers`                                   | Computed only when Prometheus scrapes                          |
| `registry.metrics()` + `registry.contentType`                              | `GET /metrics`                                              | The text format Prometheus reads                               |

### The cardinality rule (important)

Every distinct label value creates a new time series. Labelling by raw URL
(`/expressions/65f0…`) would create one series per id and eventually overload
Prometheus. We label by **route pattern** (`/api/v1/expressions/:id`). `routeLabel()`
rebuilds the pattern because Express resets `req.baseUrl` on errors (a real bug
found by a test). Unmatched URLs become `route="unmatched"`.

## Prometheus configuration

[observability/prometheus.yml](../../observability/prometheus.yml) uses
**DNS service discovery**: Docker's DNS returns one address per `api` replica, so
`--scale api=3` is discovered automatically. Verified: both replicas showed `up`.

`/metrics` is **not** proxied by Nginx. It's reachable only on the private Docker
network.

## PromQL used in the dashboard

```promql
sum by (route) (rate(http_request_duration_seconds_count[1m]))              # requests/s
histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))  # p95
sum(rate(http_request_duration_seconds_count{status_code=~"5.."}[5m]))
  / clamp_min(sum(rate(http_request_duration_seconds_count[5m])), 1e-9)     # error ratio
sum by (expression) (increase(expression_detections_saved_total[1m]))       # business
count(up{job="expression-api"} == 1)                                         # instances up
```

- `rate()` is the per-second rate over a window; `increase()` is the total over a window.
- `histogram_quantile` estimates percentiles from buckets (hence the bucket choice).

## Grafana provisioning

Grafana is configured by files, not clicks
([grafana/provisioning/](../../observability/grafana/provisioning/)): the Prometheus
and Jaeger data sources, and the **Expression API** dashboard
([dashboards/expression-api.json](../../observability/grafana/dashboards/expression-api.json)).
Anonymous viewer access is enabled only for this local setup.

## Exercises

1. Add a histogram for inference-save latency or a counter for failed logins. Then
   add a Grafana panel for it.
2. In Prometheus, run `nodejs_eventloop_lag_p99_seconds` while generating load.
