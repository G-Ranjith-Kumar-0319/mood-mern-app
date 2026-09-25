import { describe, expect, it } from 'vitest';
import type { Expression } from '../constants/expressions';
import type { ExpressionPrediction } from '../types/expression';
import { aggregatePredictions, ExpressionSmoother } from './expressionSmoothing';

const OPTIONS = { windowMs: 1000, minSamples: 3, minVoteShare: 0.6, maxSampleAgeMs: 5000 };

function prediction(expression: Expression, confidence: number, timestamp: number) {
  return { expression, confidence, timestamp } satisfies ExpressionPrediction;
}

function feed(smoother: ExpressionSmoother, items: Array<[Expression, number]>, stepMs = 100) {
  return items.map(([expression, confidence], index) =>
    smoother.add(prediction(expression, confidence, index * stepMs)),
  );
}

describe('aggregatePredictions', () => {
  it('returns null until enough samples exist', () => {
    const predictions = [prediction('happy', 0.9, 0), prediction('happy', 0.9, 100)];
    expect(aggregatePredictions(predictions, 100, OPTIONS)).toBeNull();
  });

  it('weights votes by confidence', () => {
    const predictions = [
      prediction('happy', 0.9, 0),
      prediction('neutral', 0.3, 100),
      prediction('neutral', 0.3, 200),
    ];
    const result = aggregatePredictions(predictions, 200, OPTIONS);
    expect(result?.expression).toBe('happy');
    expect(result?.voteShare).toBeCloseTo(0.6);
    expect(result?.sampleCount).toBe(3);
  });

  it('adapts to slow devices: uses the latest samples when the window has too few', () => {
    // One prediction every 1.5 s — never 3 inside a 1 s window.
    const predictions = [
      prediction('happy', 0.9, 0),
      prediction('happy', 0.9, 1500),
      prediction('happy', 0.9, 3000),
    ];
    expect(aggregatePredictions(predictions, 3000, OPTIONS)?.expression).toBe('happy');
    // …but never with predictions older than maxSampleAgeMs.
    expect(aggregatePredictions(predictions, 6000, OPTIONS)).toBeNull();
  });

  it('ignores predictions older than the window', () => {
    const predictions = [
      prediction('sad', 0.99, 0),
      prediction('happy', 0.8, 1500),
      prediction('happy', 0.8, 1600),
      prediction('happy', 0.8, 1700),
    ];
    const result = aggregatePredictions(predictions, 1700, OPTIONS);
    expect(result?.expression).toBe('happy');
    expect(result?.voteShare).toBe(1);
  });

  it('reports the mean confidence of the winning expression', () => {
    const predictions = [
      prediction('happy', 0.8, 0),
      prediction('happy', 1, 100),
      prediction('sad', 0.2, 200),
    ];
    expect(aggregatePredictions(predictions, 200, OPTIONS)?.confidence).toBeCloseTo(0.9);
  });
});

describe('ExpressionSmoother', () => {
  it('shows nothing before the minimum number of samples', () => {
    const smoother = new ExpressionSmoother(OPTIONS);
    const results = feed(smoother, [
      ['happy', 0.9],
      ['happy', 0.9],
    ]);
    expect(results).toEqual([null, null]);
  });

  it('keeps the UI stable through a single noisy frame (CLAUDE.md example)', () => {
    const smoother = new ExpressionSmoother(OPTIONS);
    const results = feed(smoother, [
      ['happy', 0.92],
      ['happy', 0.89],
      ['neutral', 0.55],
      ['happy', 0.91],
      ['happy', 0.93],
    ]);
    expect(results.slice(2).map((r) => r?.expression)).toEqual(['happy', 'happy', 'happy']);
  });

  it('switches once a new expression clearly dominates the window', () => {
    const smoother = new ExpressionSmoother(OPTIONS);
    const results = feed(smoother, [
      ['happy', 0.9],
      ['happy', 0.9],
      ['happy', 0.9],
      ['surprised', 0.9],
      ['surprised', 0.9],
      ['surprised', 0.9],
      ['surprised', 0.9],
      ['surprised', 0.9],
    ]);
    expect(results[4]?.expression).toBe('happy');
    expect(results.at(-1)?.expression).toBe('surprised');
  });

  it('holds the current expression until a challenger has a clear majority (hysteresis)', () => {
    const smoother = new ExpressionSmoother(OPTIONS);
    const results = feed(smoother, [
      ['neutral', 0.8],
      ['neutral', 0.8],
      ['neutral', 0.8],
      ['sad', 0.8],
      ['sad', 0.8],
      ['sad', 0.8],
      ['sad', 0.8],
      ['sad', 0.8],
    ]);
    // After 4 `sad` votes it leads 4:3 (57%) — a plurality, but below the 60%
    // needed to switch, so `neutral` is held. The 5th vote (62.5%) switches it.
    expect(results[6]?.expression).toBe('neutral');
    expect(results[7]?.expression).toBe('sad');
  });

  it('forgets everything after reset', () => {
    const smoother = new ExpressionSmoother(OPTIONS);
    feed(smoother, [
      ['happy', 0.9],
      ['happy', 0.9],
      ['happy', 0.9],
    ]);
    smoother.reset();
    expect(smoother.add(prediction('sad', 0.9, 5000))).toBeNull();
  });
});
