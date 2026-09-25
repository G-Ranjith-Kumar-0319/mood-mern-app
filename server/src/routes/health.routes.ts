import { Router } from 'express';
import { pingDatabase } from '../config/database.js';
import { pingRedis } from '../config/redis.js';
import { SERVICE_NAME } from '../config/logger.js';

export const healthRouter = Router();

/** Basic health (CLAUDE.md §28). */
healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', service: SERVICE_NAME });
});

/** Liveness: the process is up and the event loop responds. Never checks dependencies. */
healthRouter.get('/live', (_req, res) => {
  res.json({ status: 'ok', service: SERVICE_NAME, uptimeSeconds: Math.round(process.uptime()) });
});

/**
 * Readiness: can this instance serve traffic right now? Load balancers and
 * orchestrators stop routing to an instance that returns 503 here.
 */
healthRouter.get('/ready', async (_req, res) => {
  const [databaseReady, redisReady] = await Promise.all([pingDatabase(), pingRedis()]);
  // Redis only degrades rate limiting (it fails open), so it is reported but not required.
  res.status(databaseReady ? 200 : 503).json({
    status: databaseReady ? 'ok' : 'unavailable',
    service: SERVICE_NAME,
    checks: {
      database: databaseReady ? 'ok' : 'unavailable',
      ...(redisReady !== null && { redis: redisReady ? 'ok' : 'unavailable' }),
    },
  });
});
