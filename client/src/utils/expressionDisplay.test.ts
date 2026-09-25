import { describe, expect, it } from 'vitest';
import { EXPRESSION_EMOJI, SUPPORTED_EXPRESSIONS } from '../constants/expressions';
import {
  formatConfidence,
  getExpressionEmoji,
  getExpressionLabel,
  isConfident,
  isSupportedExpression,
} from './expressionDisplay';

describe('emoji mapping', () => {
  it('has an emoji for every expression the model supports — and nothing else', () => {
    expect(Object.keys(EXPRESSION_EMOJI).sort()).toEqual([...SUPPORTED_EXPRESSIONS].sort());
  });

  it.each([
    ['happy', '😊', 'Happy'],
    ['sad', '😢', 'Sad'],
    ['angry', '😡', 'Angry'],
    ['surprised', '😮', 'Surprised'],
    ['fearful', '😨', 'Fearful'],
    ['disgusted', '🤢', 'Disgusted'],
    ['neutral', '😐', 'Neutral'],
  ])('maps %s to %s / %s', (expression, emoji, label) => {
    expect(getExpressionEmoji(expression)).toBe(emoji);
    expect(getExpressionLabel(expression)).toBe(label);
  });

  it('falls back safely for unknown values', () => {
    expect(isSupportedExpression('confused')).toBe(false);
    expect(getExpressionEmoji('confused')).toBe('❔');
    expect(getExpressionLabel('confused')).toBe('Unknown');
  });
});

describe('confidence', () => {
  it.each([
    [0.923, '92%'],
    [0, '0%'],
    [1, '100%'],
    [1.4, '100%'],
    [-0.2, '0%'],
  ])('formats %f as %s', (value, expected) => {
    expect(formatConfidence(value)).toBe(expected);
  });

  it('applies the confidence threshold inclusively', () => {
    expect(isConfident(0.5, 0.5)).toBe(true);
    expect(isConfident(0.49, 0.5)).toBe(false);
  });
});
