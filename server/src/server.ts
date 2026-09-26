import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { config } from './config/env.js';
import { logger } from './config/logger.js';
import { connectRedis, disconnectRedis } from './config/redis.js';
import { attachCameraSignaling } from './realtime/cameraSignaling.js';
import { liveUpdates } from './services/liveUpdates.js';

/**
 * Must exceed the proxy's upstream keep-alive timeout (Nginx: 60 s) so Node
 * never closes an idle connection Nginx is about to reuse (which causes 502s).
 */
const KEEP_ALIVE_TIMEOUT_MS = 65_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  if (config.auth.usesDevSecrets) {
    logger.warn('Using built-in development JWT secrets. Set JWT_*_SECRET in .env.');
  }

  const app = createApp();
  await connectDatabase();
  await connectRedis();
  await liveUpdates.start();

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, 'API server listening');
  });
  // WebRTC signaling (Socket.IO) shares the HTTP server, under /socket.io.
  const cameraSignaling = attachCameraSignaling(server);
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = KEEP_ALIVE_TIMEOUT_MS + 1000;

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down gracefully');

    // Safety net if in-flight requests or connections never finish.
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    // Stop accepting new connections, let in-flight requests finish, then close MongoDB.
    // Open event streams and signaling sockets never "finish" on their own, so end them first.
    liveUpdates.endAllStreams();
    cameraSignaling.stop();
    server.close(() => {
      liveUpdates
        .stop()
        .then(() => disconnectRedis())
        .then(() => disconnectDatabase())
        .then(() => process.exit(0))
        .catch((error: unknown) => {
          logger.error({ err: error }, 'Error while closing MongoDB');
          process.exit(1);
        });
    });
    server.closeIdleConnections();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Failed to start API server');
  process.exit(1);
});
