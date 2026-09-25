import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Loads and validates configuration once at startup. The process refuses to
 * start with invalid configuration rather than failing later at runtime.
 */

// The repository root `.env` is shared by the client and the server.
// (src/config or dist/config → ../../.. is the repository root.)
const ROOT_ENV_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env');
if (process.env.NODE_ENV !== 'test' && existsSync(ROOT_ENV_FILE)) {
  // Variables already set in the real environment win over the file.
  process.loadEnvFile(ROOT_ENV_FILE);
}

const DEV_ONLY_SECRET_PREFIX = 'dev-only-insecure-';
const PLACEHOLDER_SECRET_PREFIX = 'replace_me';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(5000),
    MONGO_URI: z.preprocess(emptyToUndefined, z.string().optional()),
    MONGO_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(500).default(10),
    CLIENT_URL: z.string().default('http://localhost:5173'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    JWT_ACCESS_SECRET: z.string().default(`${DEV_ONLY_SECRET_PREFIX}access-secret-change-me`),
    JWT_REFRESH_SECRET: z.string().default(`${DEV_ONLY_SECRET_PREFIX}refresh-secret-change-me`),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(7 * 24 * 60 * 60),
    COOKIE_SECURE: z.preprocess(emptyToUndefined, booleanString.optional()),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    EMAIL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),

    /** Public base URL of the web app, used to build links in emails. */
    APP_URL: z.url().default('http://localhost:5173'),
    SMTP_HOST: z.preprocess(emptyToUndefined, z.string().optional()),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
    SMTP_SECURE: z.preprocess(emptyToUndefined, booleanString.optional()),
    SMTP_USER: z.preprocess(emptyToUndefined, z.string().optional()),
    SMTP_PASS: z.preprocess(emptyToUndefined, z.string().optional()),
    MAIL_FROM: z.string().default('Expression Detector <no-reply@localhost>'),
    /** Optional: shared rate-limit counters across API instances (e.g. redis://redis:6379). */
    REDIS_URL: z.preprocess(emptyToUndefined, z.string().optional()),
    /** Days before anonymous detections are deleted automatically (0 = keep forever). */
    ANONYMOUS_RETENTION_DAYS: z.coerce.number().int().min(0).max(3650).default(30),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;

    if (!env.MONGO_URI) {
      ctx.addIssue({ code: 'custom', path: ['MONGO_URI'], message: 'Required in production' });
    }
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      const secret = env[key];
      const isUnsafe =
        secret.length < 32 ||
        secret.startsWith(DEV_ONLY_SECRET_PREFIX) ||
        secret.startsWith(PLACEHOLDER_SECRET_PREFIX);
      if (isUnsafe) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'Must be a unique random string of at least 32 characters in production',
        });
      }
    }
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'Access and refresh secrets must differ',
      });
    }
  });

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    // The logger depends on this config, so this is the one place we write to stderr directly.
    process.stderr.write(`Invalid environment configuration:\n${details}\n`);
    process.exit(1);
  }

  const env = parsed.data;
  return {
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    port: env.PORT,
    mongo: { uri: env.MONGO_URI, maxPoolSize: env.MONGO_MAX_POOL_SIZE },
    corsOrigins: env.CLIENT_URL.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    logLevel: env.LOG_LEVEL,
    auth: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlSeconds: env.REFRESH_TOKEN_TTL_SECONDS,
      usesDevSecrets: env.JWT_ACCESS_SECRET.startsWith(DEV_ONLY_SECRET_PREFIX),
      cookieSecure: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
    },
    rateLimit: {
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      authMax: env.AUTH_RATE_LIMIT_MAX,
      emailMax: env.EMAIL_RATE_LIMIT_MAX,
    },
    trustProxyHops: env.TRUST_PROXY_HOPS,
    appUrl: env.APP_URL.replace(/\/$/, ''),
    mail: {
      from: env.MAIL_FROM,
      smtp: env.SMTP_HOST
        ? {
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
            auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : undefined,
          }
        : null,
    },
    redis: { url: env.REDIS_URL },
    retention: {
      anonymousDays: env.ANONYMOUS_RETENTION_DAYS === 0 ? null : env.ANONYMOUS_RETENTION_DAYS,
    },
  } as const;
}

export const config = loadEnv();
export type AppConfig = typeof config;
