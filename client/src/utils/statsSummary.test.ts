import { describe, expect, it } from 'vitest';
import type { ExpressionStats } from '../types/api';
import { summarize } from './statsSummary';

const item = (
  expression: 'happy' | 'sad' | 'neutral',
  count: number,
  averageConfidence: number,
) => ({
  expression,
  count,
  percentage: 0,
  averageConfidence,
  totalDurationMs: count * 1000,
});

describe('summarize', () => {
  it('derives headline figures with a count-weighted confidence', () => {
    const stats: ExpressionStats = {
      total: 4,
      from: null,
      to: null,
      byExpression: [item('happy', 3, 0.9), item('sad', 1, 0.5), item('neutral', 0, 0)],
    };
    expect(summarize(stats)).toEqual({
      total: 4,
      topExpression: 'happy',
      averageConfidence: 0.8,
      totalDurationMs: 4000,
    });
  });

  it('handles an empty period', () => {
    const stats: ExpressionStats = {
      total: 0,
      from: null,
      to: null,
      byExpression: [item('happy', 0, 0)],
    };
    expect(summarize(stats)).toEqual({
      total: 0,
      topExpression: null,
      averageConfidence: null,
      totalDurationMs: 0,
    });
  });
});
