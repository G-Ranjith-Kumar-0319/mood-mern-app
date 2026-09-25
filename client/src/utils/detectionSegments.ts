import type { Expression } from '../constants/expressions';

export interface SegmentOptions {
  minSegmentMs: number;
  maxSegmentMs: number;
}

export interface SegmentSample {
  expression: Expression;
  confidence: number;
}

/** A finished run of one stable expression, ready to persist. */
export interface CompletedSegment {
  expression: Expression;
  /** Mean confidence over the segment. */
  confidence: number;
  detectedAt: Date;
  durationMs: number;
}

interface OpenSegment {
  expression: Expression;
  startedAt: number;
  confidenceSum: number;
  samples: number;
}

/**
 * Converts the stream of stable expressions into a few meaningful events.
 * Feed it every smoothed result (or null when there is no confident face);
 * it returns a CompletedSegment only when something worth saving has ended.
 */
export class DetectionSegmentTracker {
  private current: OpenSegment | null = null;
  private readonly options: SegmentOptions;

  constructor(options: SegmentOptions) {
    this.options = options;
  }

  update(sample: SegmentSample | null, now: number): CompletedSegment | null {
    if (!sample) return this.flush(now);

    if (!this.current) {
      this.start(sample, now);
      return null;
    }

    if (sample.expression !== this.current.expression) {
      const completed = this.flush(now);
      this.start(sample, now);
      return completed;
    }

    this.current.confidenceSum += sample.confidence;
    this.current.samples += 1;
    if (now - this.current.startedAt >= this.options.maxSegmentMs) {
      const completed = this.flush(now);
      this.start(sample, now);
      return completed;
    }
    return null;
  }

  /** Ends the open segment (camera stopped, face lost, auto-save turned off). */
  flush(now: number): CompletedSegment | null {
    const segment = this.current;
    this.current = null;
    if (!segment) return null;

    const durationMs = now - segment.startedAt;
    if (durationMs < this.options.minSegmentMs) return null;

    return {
      expression: segment.expression,
      confidence: segment.confidenceSum / segment.samples,
      detectedAt: new Date(segment.startedAt),
      durationMs,
    };
  }

  private start(sample: SegmentSample, now: number): void {
    this.current = {
      expression: sample.expression,
      startedAt: now,
      confidenceSum: sample.confidence,
      samples: 1,
    };
  }
}
