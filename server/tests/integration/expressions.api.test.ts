import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { detectionPayload, signedInAgent } from '../helpers/factories.js';
import { useTestDatabase } from '../helpers/testDatabase.js';

useTestDatabase();
const app = createApp();
const BASE = '/api/v1/expressions';

describe('POST /api/v1/expressions', () => {
  it('stores a detection and returns the public shape', async () => {
    const response = await request(app).post(BASE).send(detectionPayload()).expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      expression: 'happy',
      confidence: 0.91,
      durationMs: 4200,
      source: 'camera',
    });
    expect(response.body.data.id).toMatch(/^[a-f\d]{24}$/);
    expect(response.body.data).not.toHaveProperty('userId');
    expect(response.body.data).not.toHaveProperty('_id');
  });

  it.each([
    ['an unsupported expression', { expression: 'confused' }],
    ['confidence above 1', { confidence: 1.2 }],
    ['negative confidence', { confidence: -0.1 }],
    ['an invalid timestamp', { detectedAt: 'yesterday' }],
    ['a timestamp in the future', { detectedAt: new Date(Date.now() + 86_400_000).toISOString() }],
    ['a client-supplied userId', { userId: '65f000000000000000000000' }],
    ['a raw image payload', { image: 'data:image/png;base64,AAAA' }],
  ])('rejects %s with VALIDATION_ERROR', async (_label, override) => {
    const response = await request(app).post(BASE).send(detectionPayload(override)).expect(400);
    expect(response.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('rejects malformed JSON', async () => {
    const response = await request(app)
      .post(BASE)
      .set('Content-Type', 'application/json')
      .send('{"expression":')
      .expect(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
  });

  it('rejects oversized bodies', async () => {
    const response = await request(app)
      .post(BASE)
      .send({ ...detectionPayload(), padding: 'x'.repeat(20_000) })
      .expect(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('GET /api/v1/expressions (history)', () => {
  it('paginates newest first', async () => {
    for (let minute = 1; minute <= 5; minute++) {
      const detectedAt = new Date(Date.now() - minute * 60_000).toISOString();
      await request(app).post(BASE).send(detectionPayload({ detectedAt })).expect(201);
    }

    const page1 = await request(app).get(`${BASE}?page=1&limit=2`).expect(200);
    const page3 = await request(app).get(`${BASE}?page=3&limit=2`).expect(200);

    expect(page1.body.pagination).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3 });
    expect(page1.body.data).toHaveLength(2);
    expect(page3.body.data).toHaveLength(1);
    const [first, second] = page1.body.data;
    expect(new Date(first.detectedAt) > new Date(second.detectedAt)).toBe(true);
  });

  it('filters by expression and date range', async () => {
    const old = new Date('2024-01-01T00:00:00.000Z').toISOString();
    await request(app)
      .post(BASE)
      .send(detectionPayload({ expression: 'sad', detectedAt: old }));
    await request(app)
      .post(BASE)
      .send(detectionPayload({ expression: 'sad' }));
    await request(app)
      .post(BASE)
      .send(detectionPayload({ expression: 'happy' }));

    const sad = await request(app).get(`${BASE}?expression=sad`).expect(200);
    expect(sad.body.pagination.total).toBe(2);

    const recentSad = await request(app)
      .get(`${BASE}?expression=sad&from=2025-01-01T00:00:00.000Z`)
      .expect(200);
    expect(recentSad.body.pagination.total).toBe(1);
  });

  it.each([
    ['limit above the maximum', '?limit=500'],
    ['page 0', '?page=0'],
    ['an unknown parameter', '?sort=confidence'],
    ['from after to', '?from=2025-02-01T00:00:00Z&to=2025-01-01T00:00:00Z'],
  ])('rejects %s', async (_label, query) => {
    await request(app).get(`${BASE}${query}`).expect(400);
  });
});

describe('GET /api/v1/expressions/stats', () => {
  it('aggregates counts, shares and averages per expression', async () => {
    await request(app)
      .post(BASE)
      .send(detectionPayload({ expression: 'happy', confidence: 0.8 }));
    await request(app)
      .post(BASE)
      .send(detectionPayload({ expression: 'happy', confidence: 1 }));
    await request(app)
      .post(BASE)
      .send(detectionPayload({ expression: 'neutral', durationMs: undefined }));

    const response = await request(app).get(`${BASE}/stats`).expect(200);
    const { total, byExpression } = response.body.data;

    expect(total).toBe(3);
    expect(byExpression).toHaveLength(7); // zero-filled for every supported expression
    expect(byExpression[0]).toEqual({
      expression: 'happy',
      count: 2,
      percentage: 66.7,
      averageConfidence: 0.9,
      totalDurationMs: 8400,
    });
    expect(byExpression[1]).toMatchObject({ expression: 'neutral', count: 1, totalDurationMs: 0 });
  });

  it('respects the date range', async () => {
    await request(app)
      .post(BASE)
      .send(detectionPayload({ detectedAt: '2024-06-01T00:00:00.000Z' }));
    const response = await request(app)
      .get(`${BASE}/stats?from=2025-01-01T00:00:00.000Z`)
      .expect(200);
    expect(response.body.data.total).toBe(0);
  });
});

describe('GET/DELETE /api/v1/expressions/:id', () => {
  it('reads and deletes a detection', async () => {
    const created = await request(app).post(BASE).send(detectionPayload()).expect(201);
    const id: string = created.body.data.id;

    await request(app).get(`${BASE}/${id}`).expect(200);
    const deleted = await request(app).delete(`${BASE}/${id}`).expect(200);
    expect(deleted.body.data).toEqual({ id });
    await request(app).get(`${BASE}/${id}`).expect(404);
    await request(app).delete(`${BASE}/${id}`).expect(404);
  });

  it('rejects malformed ids before touching the database', async () => {
    const response = await request(app).get(`${BASE}/not-an-id`).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('authorization (ownership scoping)', () => {
  it('keeps each user’s history private', async () => {
    const alice = await signedInAgent(app, 'alice@example.com');
    const bob = await signedInAgent(app, 'bob@example.com');

    const created = await alice.post(BASE).send(detectionPayload()).expect(201);
    const id: string = created.body.data.id;

    // Bob and anonymous visitors cannot see, read or delete Alice's detection.
    expect((await bob.get(BASE).expect(200)).body.pagination.total).toBe(0);
    expect((await request(app).get(BASE).expect(200)).body.pagination.total).toBe(0);
    await bob.get(`${BASE}/${id}`).expect(404);
    await bob.delete(`${BASE}/${id}`).expect(404);
    await request(app).delete(`${BASE}/${id}`).expect(404);

    expect((await alice.get(BASE).expect(200)).body.pagination.total).toBe(1);
    expect((await alice.get(`${BASE}/stats`).expect(200)).body.data.total).toBe(1);
  });

  it('keeps anonymous detections out of signed-in histories', async () => {
    await request(app).post(BASE).send(detectionPayload()).expect(201);
    const alice = await signedInAgent(app, 'alice@example.com');
    expect((await alice.get(BASE).expect(200)).body.pagination.total).toBe(0);
  });

  it('answers 401 INVALID_TOKEN for a tampered access token', async () => {
    const response = await request(app)
      .get(BASE)
      .set('Cookie', 'access_token=not.a.valid.jwt')
      .expect(401);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
  });
});
