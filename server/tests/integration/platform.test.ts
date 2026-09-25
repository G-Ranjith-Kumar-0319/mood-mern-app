import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { ExpressionDetectionModel } from '../../src/models/expressionDetection.model.js';
import { useTestDatabase } from '../helpers/testDatabase.js';

useTestDatabase();
const app = createApp();

describe('health endpoints', () => {
  it('GET /api/v1/health returns the documented shape', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);
    expect(response.body).toEqual({ status: 'ok', service: 'expression-api' });
  });

  it('GET /api/v1/health/live is always ok', async () => {
    await request(app).get('/api/v1/health/live').expect(200);
  });

  it('GET /api/v1/health/ready checks MongoDB', async () => {
    const response = await request(app).get('/api/v1/health/ready').expect(200);
    expect(response.body.checks).toEqual({ database: 'ok' });
  });
});

describe('cross-cutting HTTP behaviour', () => {
  it('returns 404 in the standard error format for unknown routes', async () => {
    const response = await request(app).get('/api/v1/does-not-exist').expect(404);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route GET /api/v1/does-not-exist not found' },
    });
  });

  it('sets security headers and hides the framework', async () => {
    const response = await request(app).get('/api/v1/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('adds a request id, reusing a safe incoming one', async () => {
    const generated = await request(app).get('/api/v1/health');
    expect(generated.headers['x-request-id']).toMatch(/^[\w-]{8,}$/);

    const propagated = await request(app).get('/api/v1/health').set('X-Request-Id', 'trace-123');
    expect(propagated.headers['x-request-id']).toBe('trace-123');
  });

  it('only allows configured CORS origins', async () => {
    const allowed = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const denied = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('exposes rate-limit headers on API routes', async () => {
    const response = await request(app).get('/api/v1/expressions');
    expect(response.headers['ratelimit-policy'] ?? response.headers.ratelimit).toBeDefined();
  });
});

describe('MongoDB indexes', () => {
  it('serves the history query from the { userId, detectedAt, _id } index (explain executionStats)', async () => {
    const userId = new mongoose.Types.ObjectId();
    await ExpressionDetectionModel.insertMany(
      Array.from({ length: 50 }, (_, i) => ({
        userId: i % 2 === 0 ? userId : null,
        expression: 'happy',
        confidence: 0.9,
        detectedAt: new Date(Date.now() - i * 1000),
      })),
    );

    const explain = (await ExpressionDetectionModel.find({ userId })
      .sort({ detectedAt: -1, _id: -1 })
      .limit(10)
      .explain('executionStats')) as unknown as {
      queryPlanner: { winningPlan: unknown };
      executionStats: { totalDocsExamined: number; nReturned: number };
    };

    const plan = JSON.stringify(explain.queryPlanner.winningPlan);
    expect(plan).toContain('IXSCAN');
    expect(plan).toContain('userId_1_detectedAt_-1__id_-1');
    expect(plan).not.toContain('"SORT"'); // the index already provides the order
    // Only the returned documents are read — no collection scan.
    expect(explain.executionStats.totalDocsExamined).toBe(explain.executionStats.nReturned);
  });
});

describe('GET /metrics (Prometheus)', () => {
  it('exposes request latency by route pattern (never raw ids) and business counters', async () => {
    await request(app)
      .post('/api/v1/expressions')
      .send({ expression: 'happy', confidence: 0.9, detectedAt: new Date().toISOString() })
      .expect(201);
    await request(app).get('/api/v1/expressions/65f000000000000000000000').expect(404);

    const response = await request(app).get('/metrics').expect(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('http_request_duration_seconds_bucket');
    expect(response.text).toMatch(/route="\/api\/v1\/expressions\/:id"/);
    expect(response.text).not.toContain('65f000000000000000000000');
    expect(response.text).toMatch(
      /expression_detections_saved_total\{[^}]*expression="happy"[^}]*\} [1-9]/,
    );
    expect(response.text).toContain('process_cpu_user_seconds_total');
  });
});
