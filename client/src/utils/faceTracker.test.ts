import { describe, expect, it } from 'vitest';
import type { Expression } from '../constants/expressions';
import type { DetectedFace, FaceBox } from '../types/expression';
import { FaceTracker, iou } from './faceTracker';

const OPTIONS = {
  smoothing: { windowMs: 1000, minSamples: 1, minVoteShare: 0.6, maxSampleAgeMs: 5000 },
  minIou: 0.3,
  maxMissingMs: 700,
};

function face(box: FaceBox, expression: Expression, timestamp = 0): DetectedFace {
  return { box, score: 0.9, prediction: { expression, confidence: 0.9, timestamp } };
}

const LEFT: FaceBox = { x: 0, y: 0, width: 100, height: 100 };
const RIGHT: FaceBox = { x: 300, y: 0, width: 80, height: 80 };
const shift = (box: FaceBox, dx: number): FaceBox => ({ ...box, x: box.x + dx });

describe('iou', () => {
  it('is 1 for identical boxes, 0 for disjoint ones', () => {
    expect(iou(LEFT, LEFT)).toBe(1);
    expect(iou(LEFT, RIGHT)).toBe(0);
    expect(iou(LEFT, shift(LEFT, 50))).toBeCloseTo(1 / 3);
  });
});

describe('FaceTracker', () => {
  it('keeps the same id for a face that moves a little', () => {
    const tracker = new FaceTracker(OPTIONS);
    const [first] = tracker.update([face(LEFT, 'happy')], 0);
    const [second] = tracker.update([face(shift(LEFT, 10), 'happy', 100)], 100);
    expect(second?.id).toBe(first?.id);
  });

  it('smooths each face independently', () => {
    const tracker = new FaceTracker(OPTIONS);
    const faces = tracker.update([face(LEFT, 'happy'), face(RIGHT, 'sad')], 0);
    const byExpression = Object.fromEntries(faces.map((f) => [f.expression?.expression, f.id]));
    expect(Object.keys(byExpression).sort()).toEqual(['happy', 'sad']);
  });

  it('puts the largest face first and keeps it primary while it stays visible', () => {
    const tracker = new FaceTracker(OPTIONS);
    const [primary] = tracker.update([face(RIGHT, 'sad'), face(LEFT, 'happy')], 0);
    expect(primary?.box).toEqual(LEFT);

    // The other face grows larger, but the primary does not switch.
    const bigRight = { ...RIGHT, width: 200, height: 200 };
    const [stillPrimary] = tracker.update(
      [face(bigRight, 'sad', 100), face(LEFT, 'happy', 100)],
      100,
    );
    expect(stillPrimary?.id).toBe(primary?.id);
  });

  it('remembers faces across the long gaps of a slow device', () => {
    const tracker = new FaceTracker(OPTIONS);
    tracker.adaptToFrameInterval(3000);
    const [first] = tracker.update([face(LEFT, 'happy')], 0);
    const [second] = tracker.update([face(LEFT, 'happy', 3000)], 3000);
    expect(second?.id).toBe(first?.id);
  });

  it('remembers a briefly missing face, then forgets it', () => {
    const tracker = new FaceTracker(OPTIONS);
    tracker.update([face(LEFT, 'happy')], 0);
    expect(tracker.update([], 300)).toEqual([]);
    expect(tracker.hasRecentFace()).toBe(true);
    expect(tracker.primaryExpression()?.expression).toBe('happy');

    tracker.update([], 800);
    expect(tracker.hasRecentFace()).toBe(false);
    expect(tracker.primaryExpression()).toBeNull();
  });
});
