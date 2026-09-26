// Runs before any test file imports application code, so config/env.ts sees these values.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters-long';
// High enough that the suite never trips the per-IP limiters (every request comes from 127.0.0.1).
process.env.RATE_LIMIT_MAX = '10000';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.EMAIL_RATE_LIMIT_MAX = '10000';
process.env.CAMERA_SESSION_RATE_LIMIT_MAX = '10000';
// Tests must never depend on an external STUN server.
process.env.STUN_SERVER = '';
