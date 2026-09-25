/**
 * Expressions produced by the browser model (face-api FaceExpressionNet).
 * Mirrors `client/src/constants/expressions.ts` — keep them in sync.
 */
export const SUPPORTED_EXPRESSIONS = [
  'neutral',
  'happy',
  'sad',
  'angry',
  'fearful',
  'disgusted',
  'surprised',
] as const;

export type Expression = (typeof SUPPORTED_EXPRESSIONS)[number];

export const DETECTION_SOURCES = ['camera'] as const;
export type DetectionSource = (typeof DETECTION_SOURCES)[number];

/** A single saved segment can not plausibly be longer than this. */
export const MAX_DETECTION_DURATION_MS = 24 * 60 * 60 * 1000;

/** Clients may be slightly ahead of the server clock. */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export const PAGINATION = {
  defaultLimit: 20,
  maxLimit: 100,
} as const;
