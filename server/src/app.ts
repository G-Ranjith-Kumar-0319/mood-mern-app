import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { config } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRateLimiter } from './middleware/rateLimit.js';
import { requestLogger } from './middleware/requestLogger.js';
import { metricsHandler, metricsMiddleware } from './observability/metrics.js';
import { healthRouter } from './routes/health.routes.js';
import { apiRouter } from './routes/index.js';

/** Largest JSON body we accept. A detection event is ~200 bytes. */
const JSON_BODY_LIMIT = '10kb';

/**
 * Builds the Express app without starting a server or connecting to MongoDB,
 * so tests can drive it in-process with supertest.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  // Responses are per-user (cookie-based) and change often: never let browsers/proxies cache them.
  app.set('etag', false);
  // Needed so req.ip (used by rate limiting) is the real client IP behind Nginx.
  app.set('trust proxy', config.trustProxyHops > 0 ? config.trustProxyHops : false);

  // Prometheus scrape endpoint: before logging/rate limiting, never proxied by Nginx.
  app.get('/metrics', metricsHandler);

  app.use(requestLogger);
  app.use(metricsMiddleware);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  // Event streams must reach the browser immediately; compression would buffer them.
  app.use(
    compression({
      filter: (req, res) =>
        !String(res.getHeader('Content-Type') ?? '').startsWith('text/event-stream') &&
        compression.filter(req, res),
    }),
  );
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());

  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use('/api/v1/health', healthRouter);
  app.use('/api', apiRateLimiter);
  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
