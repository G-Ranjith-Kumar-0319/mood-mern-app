import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { serveClient } from '../../src/middleware/serveClient.js';

const dist = mkdtempSync(join(tmpdir(), 'client-dist-'));
writeFileSync(join(dist, 'index.html'), '<!doctype html><title>app</title>');
writeFileSync(join(dist, 'sw.js'), 'self.addEventListener("fetch", () => {});');
mkdirSync(join(dist, 'assets'));
writeFileSync(join(dist, 'assets', 'index-abc123.js'), 'console.log(1);');

const app = express();
app.use(serveClient(dist));
app.use((_req, res) => {
  res.status(404).json({ success: false });
});

afterAll(() => rmSync(dist, { recursive: true, force: true }));

describe('serveClient (single-service hosting, e.g. Render)', () => {
  it('serves hashed assets with long-lived caching', async () => {
    const response = await request(app).get('/assets/index-abc123.js').expect(200);
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('never caches the service worker', async () => {
    const response = await request(app).get('/sw.js').expect(200);
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('falls back to index.html for app routes such as the phone camera page', async () => {
    const response = await request(app).get('/camera/abc123def456').expect(200);
    expect(response.text).toContain('<title>app</title>');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.headers['permissions-policy']).toBe(
      'camera=(self), microphone=(), geolocation=()',
    );
  });

  it('never answers API or signaling paths with the SPA', async () => {
    await request(app).get('/api/v1/unknown').expect(404);
    await request(app).get('/socket.io/?EIO=4').expect(404);
  });

  it('refuses a directory without a build', () => {
    expect(() => serveClient(join(dist, 'assets'))).toThrow(/index\.html/);
  });
});

describe('Content Security Policy', () => {
  it('matches the Nginx policy the detector needs (blob: workers, same-origin connections)', async () => {
    const response = await request(createApp()).get('/api/v1/health');
    const csp = String(response.headers['content-security-policy']);
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("connect-src 'self' data: blob:");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response.headers['x-frame-options']).toBe('DENY');
  });
});
