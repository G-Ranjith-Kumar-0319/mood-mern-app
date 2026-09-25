import type { Request, Response } from 'express';
import { liveUpdates, type LiveEvent } from '../services/liveUpdates.js';

/** Proxies and load balancers drop idle connections; a comment line every 25 s keeps it open. */
const HEARTBEAT_MS = 25_000;
/** Tells EventSource how long to wait before reconnecting after a drop. */
const RETRY_MS = 5000;

/**
 * Server-Sent Events: a long-lived HTTP response the server writes to whenever
 * something happens. Simpler than WebSockets for one-way server→browser pushes,
 * and the browser's EventSource reconnects automatically.
 */
export function streamEvents(req: Request, res: Response): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Nginx: deliver each event immediately instead of buffering the response.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(`retry: ${RETRY_MS}\n\n`);

  const send = (event: LiveEvent) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.detection)}\n\n`);
  };
  const unsubscribe = liveUpdates.subscribe(req.user?.id ?? null, { send, close: () => res.end() });
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}
