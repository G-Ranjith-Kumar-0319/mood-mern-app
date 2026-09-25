import { describe, expect, it } from 'vitest';
import { DetectionSegmentTracker } from './detectionSegments';

const OPTIONS = { minSegmentMs: 2000, maxSegmentMs: 10_000 };
const happy = { expression: 'happy' as const, confidence: 0.8 };
const sad = { expression: 'sad' as const, confidence: 0.6 };

describe('DetectionSegmentTracker', () => {
  it('saves nothing while the same expression continues', () => {
    const tracker = new DetectionSegmentTracker(OPTIONS);
    const results = [0, 1000, 2000, 5000].map((t) => tracker.update(happy, t));
    expect(results.every((r) => r === null)).toBe(true);
  });

  it('completes a segment when the expression changes', () => {
    const tracker = new DetectionSegmentTracker(OPTIONS);
    tracker.update(happy, 0);
    tracker.update({ ...happy, confidence: 1 }, 1500);
    const completed = tracker.update(sad, 3000);

    expect(completed).toEqual({
      expression: 'happy',
      confidence: 0.9,
      detectedAt: new Date(0),
      durationMs: 3000,
    });
  });

  it('ignores segments shorter than the minimum', () => {
    const tracker = new DetectionSegmentTracker(OPTIONS);
    tracker.update(happy, 0);
    expect(tracker.update(sad, 500)).toBeNull();
  });

  it('splits long segments at the maximum duration', () => {
    const tracker = new DetectionSegmentTracker(OPTIONS);
    tracker.update(happy, 0);
    const completed = tracker.update(happy, 10_000);
    expect(completed?.durationMs).toBe(10_000);
    // A new segment started at 10 s.
    expect(tracker.flush(13_000)?.detectedAt).toEqual(new Date(10_000));
  });

  it('ends the segment when the face is lost (null sample)', () => {
    const tracker = new DetectionSegmentTracker(OPTIONS);
    tracker.update(sad, 0);
    expect(tracker.update(null, 4000)?.expression).toBe('sad');
    expect(tracker.flush(5000)).toBeNull();
  });
});
