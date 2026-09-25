/**
 * The seven classes produced by face-api's FaceExpressionNet
 * (`FACE_EXPRESSION_LABELS` in @vladmandic/face-api). The API server keeps an
 * identical list in `server/src/constants/expressions.ts` — keep them in sync.
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

/** Presentation only — an emoji is not a diagnosis of how someone feels. */
export const EXPRESSION_EMOJI: Record<Expression, string> = {
  happy: '😊',
  sad: '😢',
  angry: '😡',
  surprised: '😮',
  fearful: '😨',
  disgusted: '🤢',
  neutral: '😐',
};

export const EXPRESSION_LABEL: Record<Expression, string> = {
  happy: 'Happy',
  sad: 'Sad',
  angry: 'Angry',
  surprised: 'Surprised',
  fearful: 'Fearful',
  disgusted: 'Disgusted',
  neutral: 'Neutral',
};
