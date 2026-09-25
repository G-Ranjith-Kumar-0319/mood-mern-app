export interface PerformanceStats {
  /** Completed inferences per second over the recent window. */
  inferencesPerSecond: number;
  /** Mean model time per frame (ms) over the recent window. */
  averageInferenceMs: number;
}

const WINDOW_MS = 2000;

/** Rolling measurement of inference throughput and latency (last 2 s). */
export class PerformanceMeter {
  private samples: Array<{ at: number; inferenceMs: number }> = [];

  record(at: number, inferenceMs: number): void {
    this.samples.push({ at, inferenceMs });
    this.samples = this.samples.filter((sample) => at - sample.at <= WINDOW_MS);
  }

  stats(now: number): PerformanceStats {
    const recent = this.samples.filter((sample) => now - sample.at <= WINDOW_MS);
    if (recent.length === 0) return { inferencesPerSecond: 0, averageInferenceMs: 0 };
    const spanMs = Math.max(now - recent[0]!.at, 1);
    const total = recent.reduce((sum, sample) => sum + sample.inferenceMs, 0);
    return {
      // n samples over the span cover n−1 intervals; guard the single-sample case.
      inferencesPerSecond: recent.length > 1 ? ((recent.length - 1) * 1000) / spanMs : 0,
      averageInferenceMs: total / recent.length,
    };
  }
}
