import { describe, expect, it } from 'vitest';
import { buildStats } from '../../src/services/expression.service.js';

describe('buildStats (statistics transformation)', () => {
  it('computes percentages, rounds values and zero-fills missing expressions', () => {
    const stats = buildStats(
      [
        { _id: 'happy', count: 2, averageConfidence: 0.91234, totalDurationMs: 5000 },
        { _id: 'sad', count: 1, averageConfidence: 0.7, totalDurationMs: 0 },
      ],
      { from: new Date('2025-01-01T00:00:00.000Z') },
    );

    expect(stats.total).toBe(3);
    expect(stats.from).toBe('2025-01-01T00:00:00.000Z');
    expect(stats.to).toBeNull();
    expect(stats.byExpression).toHaveLength(7);
    expect(stats.byExpression[0]).toEqual({
      expression: 'happy',
      count: 2,
      percentage: 66.7,
      averageConfidence: 0.912,
      totalDurationMs: 5000,
    });
    expect(stats.byExpression[1]?.percentage).toBe(33.3);
    expect(stats.byExpression.slice(2).every((item) => item.count === 0)).toBe(true);
  });

  it('handles an empty range without dividing by zero', () => {
    const stats = buildStats([], {});
    expect(stats.total).toBe(0);
    expect(stats.byExpression.every((item) => item.percentage === 0)).toBe(true);
  });

  it('orders ties alphabetically for stable charts', () => {
    const stats = buildStats(
      [
        { _id: 'sad', count: 1, averageConfidence: 0.5, totalDurationMs: 0 },
        { _id: 'angry', count: 1, averageConfidence: 0.5, totalDurationMs: 0 },
      ],
      {},
    );
    expect(stats.byExpression.slice(0, 2).map((item) => item.expression)).toEqual(['angry', 'sad']);
  });
});
