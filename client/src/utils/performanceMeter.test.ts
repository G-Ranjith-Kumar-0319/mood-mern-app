import { describe, expect, it } from 'vitest';
import { PerformanceMeter } from './performanceMeter';

describe('PerformanceMeter', () => {
  it('reports throughput and mean latency over the recent window', () => {
    const meter = new PerformanceMeter();
    // 11 samples, 100 ms apart = 10 inferences/second, 40 ms each
    for (let i = 0; i <= 10; i++) meter.record(i * 100, 40);
    const stats = meter.stats(1000);
    expect(stats.inferencesPerSecond).toBeCloseTo(10);
    expect(stats.averageInferenceMs).toBe(40);
  });

  it('forgets samples older than the window', () => {
    const meter = new PerformanceMeter();
    meter.record(0, 500);
    meter.record(5000, 20);
    expect(meter.stats(5000).averageInferenceMs).toBe(20);
  });

  it('is zero before anything ran', () => {
    expect(new PerformanceMeter().stats(0)).toEqual({
      inferencesPerSecond: 0,
      averageInferenceMs: 0,
    });
  });
});
