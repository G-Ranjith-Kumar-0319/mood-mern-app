import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { detectionPayload } from '../helpers/factories.js';
import { useTestDatabase } from '../helpers/testDatabase.js';

useTestDatabase();
const app = createApp();
const BASE = '/api/v1/expressions';

async function save(expression: string, detectedAt: string) {
  await request(app).post(BASE).send(detectionPayload({ expression, detectedAt })).expect(201);
}

describe('GET /api/v1/expressions/trends', () => {
  it('buckets by day in UTC and fills empty days with zeros', async () => {
    await save('happy', '2025-01-01T10:00:00.000Z');
    await save('happy', '2025-01-01T23:30:00.000Z');
    await save('sad', '2025-01-03T08:00:00.000Z');

    const response = await request(app)
      .get(`${BASE}/trends?groupBy=day&from=2025-01-01T00:00:00Z&to=2025-01-03T23:59:59Z`)
      .expect(200);
    const { series, groupBy, timezone } = response.body.data;

    expect(groupBy).toBe('day');
    expect(timezone).toBe('UTC');
    expect(series.map((p: { period: string }) => p.period)).toEqual([
      '2025-01-01T00:00:00.000Z',
      '2025-01-02T00:00:00.000Z',
      '2025-01-03T00:00:00.000Z',
    ]);
    expect(series[0]).toMatchObject({ total: 2, counts: { happy: 2, sad: 0 } });
    expect(series[1].total).toBe(0);
    expect(series[2].counts.sad).toBe(1);
  });

  it('uses the viewer’s local day (Asia/Kolkata, UTC+5:30)', async () => {
    // 23:30Z on 1 Jan is 05:00 on 2 Jan in Kolkata → belongs to the 2 Jan local bucket.
    await save('surprised', '2025-01-01T23:30:00.000Z');

    const response = await request(app)
      .get(
        `${BASE}/trends?groupBy=day&timezone=Asia/Kolkata&from=2025-01-01T00:00:00Z&to=2025-01-02T12:00:00Z`,
      )
      .expect(200);
    const nonEmpty = response.body.data.series.filter((p: { total: number }) => p.total > 0);

    expect(nonEmpty).toHaveLength(1);
    // Local midnight of 2 Jan in Kolkata = 18:30Z on 1 Jan — MongoDB and the gap filler agree.
    expect(nonEmpty[0].period).toBe('2025-01-01T18:30:00.000Z');
  });

  it('groups by month and week', async () => {
    await save('neutral', '2025-01-15T12:00:00.000Z');
    await save('neutral', '2025-03-02T12:00:00.000Z');

    const months = await request(app)
      .get(`${BASE}/trends?groupBy=month&from=2025-01-01T00:00:00Z&to=2025-03-31T00:00:00Z`)
      .expect(200);
    expect(months.body.data.series.map((p: { total: number }) => p.total)).toEqual([1, 0, 1]);

    const weeks = await request(app)
      .get(`${BASE}/trends?groupBy=week&from=2025-01-13T00:00:00Z&to=2025-01-26T00:00:00Z`)
      .expect(200);
    expect(weeks.body.data.series[0].period).toBe('2025-01-13T00:00:00.000Z'); // a Monday
  });

  it('returns an empty series when there is no data and no range', async () => {
    const response = await request(app).get(`${BASE}/trends`).expect(200);
    expect(response.body.data.series).toEqual([]);
  });

  it.each([
    ['an unknown time zone', '?timezone=Mars/Olympus'],
    ['an unsupported unit', '?groupBy=year'],
    ['too many buckets', '?groupBy=hour&from=2020-01-01T00:00:00Z&to=2025-01-01T00:00:00Z'],
  ])('rejects %s', async (_label, query) => {
    const response = await request(app).get(`${BASE}/trends${query}`).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
