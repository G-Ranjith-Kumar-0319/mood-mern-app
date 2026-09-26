import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import express, { Router, type Response } from 'express';

/**
 * Serves the built React app from Node, for single-service hosts (e.g. Render)
 * where there is no Nginx in front. Mirrors nginx.conf: long-lived caching for
 * content-hashed assets, no-cache for the HTML shell and service worker, and an
 * SPA fallback so React Router handles deep links such as /camera/:sessionId.
 *
 * API, signaling and metrics paths are never answered with index.html.
 */
const API_PREFIXES = ['/api/', '/socket.io/', '/metrics'];
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
const ONE_WEEK_SECONDS = 7 * 24 * 60 * 60;

/** The app may use the camera on its own origin only; never the microphone or location. */
const PERMISSIONS_POLICY = 'camera=(self), microphone=(), geolocation=()';

function setCacheHeaders(res: Response, filePath: string) {
  const path = filePath.replaceAll('\\', '/');
  if (path.includes('/assets/')) {
    res.setHeader('Cache-Control', `public, max-age=${ONE_YEAR_SECONDS}, immutable`);
  } else if (path.includes('/models/')) {
    res.setHeader('Cache-Control', `public, max-age=${ONE_WEEK_SECONDS}`);
  } else {
    // index.html, sw.js, manifest: always revalidate so a deploy is picked up immediately.
    res.setHeader('Cache-Control', 'no-cache');
  }
}

export function serveClient(directory: string): Router {
  const root = resolve(directory);
  const indexHtml = join(root, 'index.html');
  if (!existsSync(indexHtml)) {
    throw new Error(`SERVE_CLIENT_DIR has no index.html: ${root}`);
  }

  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    next();
  });
  router.use(express.static(root, { index: false, setHeaders: setCacheHeaders }));
  router.get(/.*/, (req, res, next) => {
    if (API_PREFIXES.some((prefix) => req.path.startsWith(prefix))) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
  return router;
}
