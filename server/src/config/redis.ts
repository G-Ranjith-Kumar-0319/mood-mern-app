import { createClient } from 'redis';
import { config } from './env.js';
import { logger } from './logger.js';

/**
 * Optional Redis connection, used for state that must be shared by every API
 * instance (today: rate-limit counters). Without REDIS_URL the app uses
 * per-instance memory instead, which is fine for a single instance.
 */
export const redis = config.redis.url ? createClient({ url: config.redis.url }) : null;

redis?.on('error', (error: unknown) => logger.error({ err: error }, 'Redis error'));
redis?.on('ready', () => logger.info('Redis connected'));

/**
 * Connecting starts as soon as this module is imported — before the rate
 * limiters are created. Their stores send commands immediately; once connect()
 * has been called, node-redis queues those commands until the connection is
 * ready. (If the stores were created against a closed client, their
 * initialisation would fail and — because they fail open — rate limiting would
 * silently switch off.)
 */
const connecting: Promise<unknown> | null = redis ? redis.connect() : null;
connecting?.catch((error: unknown) => logger.error({ err: error }, 'Redis connection failed'));

/** Resolves once Redis is ready (awaited during startup so failures are visible early). */
export async function connectRedis(): Promise<void> {
  await connecting;
}

export async function disconnectRedis(): Promise<void> {
  if (redis?.isOpen) await redis.close();
}

/** null = Redis not configured; otherwise whether it answered a PING. */
export async function pingRedis(): Promise<boolean | null> {
  if (!redis) return null;
  try {
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  }
}
