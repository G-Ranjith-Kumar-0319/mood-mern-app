import { describe, expect, it } from 'vitest';
import { SessionRecorder } from './sessionRecorder';

describe('SessionRecorder', () => {
  it('attributes time to the expression that was on screen', () => {
    const recorder = new SessionRecorder(0);
    recorder.update('happy', 1000); // 0–1 s: nothing detected yet
    recorder.update('happy', 2000);
    recorder.update('neutral', 4000); // happy 1–4 s = 3 s
    recorder.update(null, 5000); // neutral 4–5 s = 1 s
    const summary = recorder.finish(6000); // 5–6 s: no face

    expect(summary.durationMs).toBe(6000);
    expect(summary.detectedMs).toBe(4000);
    expect(summary.dominant).toBe('happy');
    expect(summary.byExpression).toEqual([
      { expression: 'happy', ms: 3000, share: 0.75 },
      { expression: 'neutral', ms: 1000, share: 0.25 },
    ]);
  });

  it('handles a session without any detection', () => {
    const summary = new SessionRecorder(0).finish(2000);
    expect(summary).toEqual({ durationMs: 2000, detectedMs: 0, byExpression: [], dominant: null });
  });
});
