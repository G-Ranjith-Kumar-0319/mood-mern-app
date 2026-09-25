/** Tuning knobs for the detection pipeline. See docs/architecture.md for the reasoning. */
export const DETECTION_CONFIG = {
  /** Served from `public/models` (copied from node_modules by scripts/copy-models.mjs). */
  modelUrl: '/models',
  /**
   * Target gap between inference runs. 100 ms ≈ 10 inferences/sec. The next run is
   * only scheduled after the previous one finishes, so slow devices self-throttle.
   */
  inferenceIntervalMs: 100,
  /** TinyFaceDetector input size (must be a multiple of 32). Smaller = faster, less accurate. */
  detectorInputSize: 224,
  /** Minimum face-detector score to accept a face. */
  faceScoreThreshold: 0.5,
  /** How long a face may be missing before the UI switches to "No face detected". */
  noFaceGraceMs: 700,
  /** Smoothed confidence below this is shown as "Low confidence" and never auto-saved. */
  confidenceThreshold: 0.5,
} as const;

export const SMOOTHING_CONFIG = {
  /** Only predictions from the last `windowMs` vote. */
  windowMs: 1000,
  /** Votes required before any expression is shown. */
  minSamples: 3,
  /** Share of the confidence-weighted vote a *new* expression needs to replace the current one. */
  minVoteShare: 0.6,
  /** Slow devices (< 3 analyses/s) vote with the latest 3 predictions up to this age. */
  maxSampleAgeMs: 5000,
} as const;
