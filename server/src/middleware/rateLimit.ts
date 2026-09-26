import { rateLimit, type Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { config } from '../config/env.js';
import { redis } from '../config/redis.js';
import { AppError } from '../utils/AppError.js';

/**
 * Per-IP limits. With REDIS_URL set, counters live in Redis and are shared by
 * every API instance, so "300 requests/minute" means 300 in total, not 300 per
 * instance. Without Redis each instance counts in its own memory.
 */
function storeFor(prefix: string): Partial<Options> {
  if (!redis) return {};
  const client = redis;
  return {
    store: new RedisStore({
      prefix: `rl:${prefix}:`,
      sendCommand: (...args: string[]) => client.sendCommand(args),
    }),
    // If Redis is down, let requests through rather than taking the whole API down
    // (availability over strict limiting). The error is still logged by the client.
    passOnStoreError: true,
  };
}

const baseOptions = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // Hand off to the central error handler so the response shape stays consistent.
  handler: (_req, _res, next) => next(AppError.rateLimited()),
} satisfies Partial<Options>;

export const apiRateLimiter = rateLimit({
  ...baseOptions,
  ...storeFor('api'),
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.max,
});

/** Much stricter: slows down password guessing / credential stuffing. */
export const authRateLimiter = rateLimit({
  ...baseOptions,
  ...storeFor('auth'),
  windowMs: 15 * 60 * 1000,
  limit: config.rateLimit.authMax,
  // Successful logins do not count against the user.
  skipSuccessfulRequests: true,
});

/**
 * Emails cost money and can be used to harass someone: every request counts
 * (successful or not) — at most 5 emails per IP per 15 minutes by default.
 */
export const emailRateLimiter = rateLimit({
  ...baseOptions,
  ...storeFor('email'),
  windowMs: 15 * 60 * 1000,
  limit: config.rateLimit.emailMax,
});

/** Pairing sessions are cheap but not free: a person needs a handful, not hundreds. */
export const cameraSessionRateLimiter = rateLimit({
  ...baseOptions,
  ...storeFor('camera'),
  windowMs: 15 * 60 * 1000,
  limit: config.rateLimit.cameraSessionMax,
});
