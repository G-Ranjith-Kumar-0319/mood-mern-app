import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../../src/utils/cursor.js';

describe('cursor encoding', () => {
  it('round-trips a position and is URL-safe', () => {
    const position = { detectedAt: new Date('2025-01-31T10:35:00.000Z'), id: new Types.ObjectId() };
    const cursor = encodeCursor(position);
    expect(cursor).toMatch(/^[\w-]+$/);
    expect(decodeCursor(cursor)).toEqual(position);
  });

  it.each([
    ['garbage', 'not-a-cursor'],
    ['wrong JSON shape', Buffer.from('{"x":1}').toString('base64url')],
    ['invalid id', Buffer.from('{"d":"2025-01-01T00:00:00Z","i":"nope"}').toString('base64url')],
    [
      'invalid date',
      Buffer.from(`{"d":"yesterday","i":"${new Types.ObjectId()}"}`).toString('base64url'),
    ],
  ])('rejects %s', (_label, cursor) => {
    expect(decodeCursor(cursor)).toBeNull();
  });
});
