import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { ExpressionDetectionModel } from '../../src/models/expressionDetection.model.js';
import { useTestDatabase } from '../helpers/testDatabase.js';

useTestDatabase();
const app = createApp();
const BASE = '/api/v1/expressions';

async function seed(count: number, sameTimestamp = false) {
  const now = Date.now();
  await ExpressionDetectionModel.insertMany(
    Array.from({ length: count }, (_, i) => ({
      userId: null,
      expression: 'happy',
      confidence: 0.9,
      // Many identical timestamps prove the _id tie-breaker keeps pages exact.
      detectedAt: new Date(sameTimestamp ? now - 1000 : now - i * 1000),
    })),
  );
}

describe('cursor pagination', () => {
  it('walks every document exactly once, even with identical timestamps', async () => {
    await seed(23, true);
    const seen: string[] = [];
    let cursor = '';
    let pages = 0;

    for (;;) {
      const response = await request(app)
        .get(`${BASE}?limit=5&cursor=${encodeURIComponent(cursor)}`)
        .expect(200);
      pages += 1;
      seen.push(...response.body.data.map((item: { id: string }) => item.id));
      const { hasMore, nextCursor, limit } = response.body.pagination;
      expect(limit).toBe(5);
      expect(response.body.pagination).not.toHaveProperty('total');
      if (!hasMore) {
        expect(nextCursor).toBeNull();
        break;
      }
      cursor = nextCursor;
    }

    expect(pages).toBe(5);
    expect(seen).toHaveLength(23);
    expect(new Set(seen).size).toBe(23);
  });

  it('returns the newest first and matches page mode', async () => {
    await seed(8);
    const cursorFirst = await request(app).get(`${BASE}?limit=3&cursor=`).expect(200);
    const pageFirst = await request(app).get(`${BASE}?limit=3&page=1`).expect(200);
    expect(cursorFirst.body.data).toEqual(pageFirst.body.data);
  });

  it.each([
    ['a malformed cursor', '?cursor=garbage'],
    ['page and cursor together', '?page=2&cursor='],
  ])('rejects %s', async (_label, query) => {
    const response = await request(app).get(`${BASE}${query}`).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('reads only one page of documents from the index for a deep cursor (explain)', async () => {
    await seed(200);
    const deep = await ExpressionDetectionModel.find({ userId: null })
      .sort({ detectedAt: -1, _id: -1 })
      .skip(150)
      .limit(1)
      .lean();
    const after = deep[0];
    if (!after) throw new Error('seed failed');

    const explain = (await ExpressionDetectionModel.find({
      userId: null,
      $or: [
        { detectedAt: { $lt: after.detectedAt } },
        { detectedAt: after.detectedAt, _id: { $lt: after._id } },
      ],
    })
      .sort({ detectedAt: -1, _id: -1 })
      .limit(11)
      .explain('executionStats')) as unknown as {
      executionStats: { totalDocsExamined: number; nReturned: number };
    };

    // Skip-based page 16 would examine ~160 documents; the cursor examines ~one page.
    expect(explain.executionStats.nReturned).toBe(11);
    expect(explain.executionStats.totalDocsExamined).toBeLessThanOrEqual(12);
    await mongoose.connection.db?.collection('expressiondetections').deleteMany({});
  });
});
