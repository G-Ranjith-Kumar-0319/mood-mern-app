import type { Expression } from '../constants/expressions';
import type { ExpressionPrediction, SmoothedExpression } from '../types/expression';

export interface SmoothingOptions {
  windowMs: number;
  minSamples: number;
  minVoteShare: number;
  /**
   * Slow devices may produce fewer than `minSamples` predictions per window. Then the
   * latest `minSamples` predictions are used instead, as long as they are newer than this.
   */
  maxSampleAgeMs: number;
}

export interface WindowAggregate {
  expression: Expression;
  confidence: number;
  /** Winner's share (0–1) of the confidence-weighted vote. */
  voteShare: number;
  sampleCount: number;
}

/**
 * The predictions that vote: everything from the last `windowMs`, or — when a slow
 * device produced fewer than `minSamples` in that time — the latest `minSamples`
 * that are not older than `maxSampleAgeMs`.
 */
export function votingPredictions(
  predictions: readonly ExpressionPrediction[],
  now: number,
  { windowMs, minSamples, maxSampleAgeMs }: Omit<SmoothingOptions, 'minVoteShare'>,
): ExpressionPrediction[] {
  const inWindow = predictions.filter((p) => now - p.timestamp <= windowMs);
  if (inWindow.length >= minSamples) return inWindow;
  return predictions.filter((p) => now - p.timestamp <= maxSampleAgeMs).slice(-minSamples);
}

/**
 * Confidence-weighted vote over the voting predictions.
 * Returns null when there are too few samples to decide.
 */
export function aggregatePredictions(
  predictions: readonly ExpressionPrediction[],
  now: number,
  options: Omit<SmoothingOptions, 'minVoteShare'>,
): WindowAggregate | null {
  const recent = votingPredictions(predictions, now, options);
  if (recent.length < options.minSamples) return null;

  const tally = new Map<Expression, { weight: number; count: number }>();
  let totalWeight = 0;
  for (const { expression, confidence } of recent) {
    const entry = tally.get(expression) ?? { weight: 0, count: 0 };
    entry.weight += confidence;
    entry.count += 1;
    tally.set(expression, entry);
    totalWeight += confidence;
  }

  let winner: Expression | null = null;
  let best = { weight: -1, count: 0 };
  for (const [expression, entry] of tally) {
    if (entry.weight > best.weight) {
      winner = expression;
      best = entry;
    }
  }
  if (winner === null || totalWeight <= 0) return null;

  return {
    expression: winner,
    confidence: best.weight / best.count,
    voteShare: best.weight / totalWeight,
    sampleCount: recent.length,
  };
}

/**
 * Turns a noisy stream of per-frame predictions into a stable expression.
 *
 * Strategy (sliding window + hysteresis):
 * 1. Keep only predictions from the last `windowMs` (or the latest `minSamples` on slow devices).
 * 2. Each prediction votes for its expression, weighted by its confidence.
 * 3. The first result is the plurality winner once `minSamples` votes exist.
 * 4. After that, a *different* expression only replaces the shown one when it
 *    wins at least `minVoteShare` of the vote, so a single odd frame
 *    (happy, happy, neutral, happy) never flips the UI.
 */
export class ExpressionSmoother {
  private predictions: ExpressionPrediction[] = [];
  private current: SmoothedExpression | null = null;
  private readonly options: SmoothingOptions;

  constructor(options: SmoothingOptions) {
    this.options = options;
  }

  add(prediction: ExpressionPrediction): SmoothedExpression | null {
    const now = prediction.timestamp;
    this.predictions.push(prediction);
    // Keep only what could still vote (see votingPredictions).
    this.predictions = this.predictions.filter(
      (p) => now - p.timestamp <= this.options.maxSampleAgeMs,
    );

    const aggregate = aggregatePredictions(this.predictions, now, this.options);
    if (!aggregate) return this.current;

    const isSameExpression = this.current?.expression === aggregate.expression;
    const canSwitch = this.current === null || aggregate.voteShare >= this.options.minVoteShare;

    if (isSameExpression || canSwitch) {
      this.current = {
        expression: aggregate.expression,
        confidence: aggregate.confidence,
        updatedAt: now,
      };
    }
    return this.current;
  }

  reset(): void {
    this.predictions = [];
    this.current = null;
  }
}
