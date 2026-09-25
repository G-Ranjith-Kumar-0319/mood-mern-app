# 0003 — Sliding-window weighted vote with hysteresis

**Status:** accepted

## Context

Per-frame predictions are noisy. Showing each one makes the emoji flicker.

Options considered: majority of the last N frames, an exponential moving average of the 7-class
probability vector, or a time-windowed confidence-weighted vote with hysteresis.

## Decision

`ExpressionSmoother` (in `client/src/utils/expressionSmoothing.ts`):

- Window: predictions from the last **1000 ms**. A _time_ window, not a frame count, so behaviour is
  the same on fast and slow devices.
- Each prediction votes for its top expression, weighted by its confidence.
- Show nothing until **3** votes exist. The first result is the plurality winner.
- Switch to a different expression only when it reaches **60 %** of the weighted vote (hysteresis).
- Reported confidence = mean confidence of the winner's votes.
- The confidence threshold (0.5) is applied to the **smoothed** value to decide "low confidence".

## Amendment: adaptive window for slow devices

A real-browser test on a machine without a GPU produced one inference every ~3 s. A pure 1 s
window then never held 3 votes, so **no expression was ever shown**. The window now adapts: when
fewer than `minSamples` predictions fall inside `windowMs`, the latest `minSamples` are used, as
long as they are at most `maxSampleAgeMs` (5 s) old. For the same reason, `FaceTracker` remembers
a face for 2.5× the observed frame gap (not just 700 ms). Otherwise every frame would look like a
new face with an empty smoother. Both behaviours have unit tests.

Each tracked face (multi-face mode) has its own smoother.

## Consequences

- Stable UI: a single outlier frame cannot change the display (see the unit tests).
- About 0.3–0.6 s of latency on changes on normal devices; slower devices trade latency for
  still producing a result.
- All parameters live in `constants/detection.ts` and are covered by unit tests.
