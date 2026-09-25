import { pino } from 'pino';
import { config } from './env.js';

export const SERVICE_NAME = 'expression-api';

/**
 * Structured JSON logs (one object per line) so log platforms can index fields.
 * In local development they are pretty-printed for humans instead.
 */
export const logger = pino({
  level: config.isTest ? 'silent' : config.logLevel,
  base: { service: SERVICE_NAME },
  // Never log credentials or tokens, even at debug level.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
    ],
    censor: '[REDACTED]',
  },
  ...(config.nodeEnv === 'development' && {
    transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
  }),
});
