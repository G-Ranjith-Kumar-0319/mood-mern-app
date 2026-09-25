import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '../config/logger.js';

const SAFE_REQUEST_ID = /^[\w-]{1,64}$/;
const REQUEST_ID_HEADER = 'x-request-id';

/**
 * One structured log line per request with method, URL, status, latency
 * (`responseTime` ms) and a request id. The id is reused from Nginx's
 * `X-Request-Id` when present so a request can be traced across services,
 * and echoed back to the client for support/debugging.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const id =
      typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customLogLevel: (_req, res, error) => {
    if (error || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Load balancer / orchestrator probes hit health endpoints every few seconds; skip the noise.
  autoLogging: {
    ignore: (req) =>
      (req.url?.startsWith('/api/v1/health') || req.url?.startsWith('/metrics')) ?? false,
  },
  serializers: {
    // Keep logs small and free of bodies/headers (which could hold personal data).
    req: (req: { id: unknown; method: string; url: string }) => ({
      id: req.id,
      method: req.method,
      url: req.url,
    }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
});
