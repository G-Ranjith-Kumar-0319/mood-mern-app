import { describe, expect, it } from 'vitest';
import {
  bucketRange,
  isValidTimeZone,
  nextBucketStart,
  truncateToBucket,
} from '../../src/utils/timeBuckets.js';

const iso = (dates: Date[] | null) => dates?.map((date) => date.toISOString());

describe('isValidTimeZone', () => {
  it('accepts IANA zones and rejects garbage', () => {
    expect(isValidTimeZone('Europe/London')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});

describe('nextBucketStart', () => {
  it('steps days in UTC', () => {
    expect(nextBucketStart(new Date('2025-01-31T00:00:00Z'), 'day', 'UTC').toISOString()).toBe(
      '2025-02-01T00:00:00.000Z',
    );
  });

  it('keeps local midnight across a DST change (Europe/London, 30 Mar 2025)', () => {
    // 29 Mar local midnight = 00:00Z (GMT); 30 Mar = 00:00Z; 31 Mar = 23:00Z on the 30th (BST).
    const day29 = new Date('2025-03-29T00:00:00Z');
    const day30 = nextBucketStart(day29, 'day', 'Europe/London');
    const day31 = nextBucketStart(day30, 'day', 'Europe/London');
    expect(day30.toISOString()).toBe('2025-03-30T00:00:00.000Z');
    expect(day31.toISOString()).toBe('2025-03-30T23:00:00.000Z');
  });

  it('steps local weeks and calendar months in a non-UTC zone', () => {
    // Monday 6 Jan 2025 00:00 in Asia/Kolkata (UTC+5:30) = 5 Jan 18:30Z
    const week = new Date('2025-01-05T18:30:00Z');
    expect(nextBucketStart(week, 'week', 'Asia/Kolkata').toISOString()).toBe(
      '2025-01-12T18:30:00.000Z',
    );
    const january = new Date('2024-12-31T18:30:00Z'); // 1 Jan 2025 local
    expect(nextBucketStart(january, 'month', 'Asia/Kolkata').toISOString()).toBe(
      '2025-01-31T18:30:00.000Z',
    );
  });

  it('steps hours as fixed intervals', () => {
    expect(nextBucketStart(new Date('2025-01-01T10:00:00Z'), 'hour', 'UTC').toISOString()).toBe(
      '2025-01-01T11:00:00.000Z',
    );
  });
});

describe('bucketRange', () => {
  it('lists every bucket inclusively', () => {
    expect(
      iso(bucketRange(new Date('2025-01-01Z'), new Date('2025-01-03Z'), 'day', 'UTC', 10)),
    ).toEqual(['2025-01-01T00:00:00.000Z', '2025-01-02T00:00:00.000Z', '2025-01-03T00:00:00.000Z']);
  });

  it('returns null when the range needs too many buckets', () => {
    expect(
      bucketRange(new Date('2025-01-01Z'), new Date('2025-12-31Z'), 'day', 'UTC', 100),
    ).toBeNull();
  });
});

describe('truncateToBucket', () => {
  it('truncates to local day, Monday-based week, month and hour', () => {
    // Wednesday 15 Jan 2025, 20:10 UTC = 01:40 on Thursday 16 Jan in Asia/Kolkata
    const date = new Date('2025-01-15T20:10:00Z');
    expect(truncateToBucket(date, 'day', 'Asia/Kolkata').toISOString()).toBe(
      '2025-01-15T18:30:00.000Z',
    );
    expect(truncateToBucket(date, 'week', 'Asia/Kolkata').toISOString()).toBe(
      '2025-01-12T18:30:00.000Z',
    );
    expect(truncateToBucket(date, 'month', 'Asia/Kolkata').toISOString()).toBe(
      '2024-12-31T18:30:00.000Z',
    );
    expect(truncateToBucket(date, 'hour', 'Asia/Kolkata').toISOString()).toBe(
      '2025-01-15T19:30:00.000Z',
    );
    expect(truncateToBucket(date, 'week', 'UTC').toISOString()).toBe('2025-01-13T00:00:00.000Z');
  });
});
