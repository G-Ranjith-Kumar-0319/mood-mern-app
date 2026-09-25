import type { ExpressionStats } from '../types/api';

export interface SummaryFigures {
  total: number;
  topExpression: string | null;
  averageConfidence: number | null;
  totalDurationMs: number;
}

/** Headline numbers derived from the stats response (pure, unit-tested). */
export function summarize(stats: ExpressionStats): SummaryFigures {
  const withData = stats.byExpression.filter((item) => item.count > 0);
  const top = withData[0] ?? null; // API sorts by count desc
  const weightedConfidence = withData.reduce((sum, i) => sum + i.averageConfidence * i.count, 0);
  return {
    total: stats.total,
    topExpression: top?.expression ?? null,
    averageConfidence: stats.total > 0 ? weightedConfidence / stats.total : null,
    totalDurationMs: withData.reduce((sum, item) => sum + item.totalDurationMs, 0),
  };
}
