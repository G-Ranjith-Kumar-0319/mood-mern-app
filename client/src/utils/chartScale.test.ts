import { describe, expect, it } from 'vitest';
import { countScale, formatPeriod, labelStride } from './chartScale';

describe('countScale', () => {
  it.each([
    [0, 1, [0, 1]],
    [3, 3, [0, 1, 2, 3]],
    [21, 30, [0, 10, 20, 30]],
    [37, 40, [0, 10, 20, 30, 40]],
    [120, 150, [0, 50, 100, 150]],
  ])('max %d → axis end %d', (dataMax, max, ticks) => {
    expect(countScale(dataMax)).toEqual({ max, ticks });
  });
});

describe('labelStride', () => {
  it('thins labels so they fit', () => {
    expect(labelStride(7, 700)).toBe(1);
    expect(labelStride(30, 320)).toBe(6);
  });
});

describe('formatPeriod', () => {
  it('formats in the bucket time zone', () => {
    // 18:30Z on 1 Jan = local midnight of 2 Jan in Kolkata
    expect(
      formatPeriod('2025-01-01T18:30:00.000Z', 'day', 'Asia/Kolkata', { locale: 'en-US' }),
    ).toBe('Jan 2');
    expect(formatPeriod('2025-01-13T00:00:00.000Z', 'week', 'UTC', { locale: 'en-US' })).toBe(
      'Week of Jan 13',
    );
    expect(formatPeriod('2025-03-01T00:00:00.000Z', 'month', 'UTC', { locale: 'en-US' })).toBe(
      'Mar 2025',
    );
  });
});
