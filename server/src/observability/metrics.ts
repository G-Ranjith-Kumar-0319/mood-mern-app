import type { NextFunction, Request, Response } from 'express';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus metrics, exposed at GET /metrics (plain text format).
 * Prometheus *pulls* this endpoint every few seconds from each API instance.
 * Nginx never proxies /metrics, so it is only reachable inside the private network.
 */
export const registry = new Registry();
registry.setDefaultLabels({ service: 'expression-api' });
// Process metrics: CPU, memory, event-loop lag, GC, open handles…
collectDefaultMetrics({ register: registry });

const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency by route, method and status',
  labelNames: ['method', 'route', 'status_code'] as const,
  // Buckets chosen around this API's expected latencies (ms to seconds).
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const detectionsSaved = new Counter({
  name: 'expression_detections_saved_total',
  help: 'Detection events saved, by expression',
  labelNames: ['expression'] as const,
  registers: [registry],
});

/** Updated on scrape via a callback (no bookkeeping in the hot path). */
export function registerLiveSubscriberGauge(read: () => number): void {
  new Gauge({
    name: 'live_update_subscribers',
    help: 'Open Server-Sent Events connections on this instance',
    registers: [registry],
    collect() {
      this.set(read());
    },
  });
}

/**
 * Records every request's duration. The route label is the *pattern*
 * (/api/v1/expressions/:id), never the raw URL — raw URLs contain ids and would
 * create unbounded label values ("high cardinality"), which overloads Prometheus.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const stop = httpDuration.startTimer();
  res.on('finish', () => {
    stop({ method: req.method, route: routeLabel(req), status_code: String(res.statusCode) });
  });
  next();
}

/**
 * "/api/v1/expressions/65f0…" + matched pattern "/:id" → "/api/v1/expressions/:id".
 * `req.baseUrl` cannot be used here: Express resets it when an error leaves the
 * router, so the prefix is rebuilt from the path instead (our routes have fixed segments).
 */
export function routeLabel(req: Pick<Request, 'route' | 'originalUrl'>): string {
  const pattern: unknown = req.route?.path;
  if (typeof pattern !== 'string') return 'unmatched';
  const segments = (req.originalUrl.split('?')[0] ?? '').split('/').filter(Boolean);
  const patternSegments = pattern.split('/').filter(Boolean);
  const prefix = segments.slice(0, segments.length - patternSegments.length);
  return `/${[...prefix, ...patternSegments].join('/')}`;
}

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  res.setHeader('Content-Type', registry.contentType);
  res.send(await registry.metrics());
}
