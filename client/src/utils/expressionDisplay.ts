import { DETECTION_CONFIG } from '../constants/detection';
import {
  EXPRESSION_EMOJI,
  EXPRESSION_LABEL,
  SUPPORTED_EXPRESSIONS,
  type Expression,
} from '../constants/expressions';

const UNKNOWN_EMOJI = '❔';

export function isSupportedExpression(value: string): value is Expression {
  return (SUPPORTED_EXPRESSIONS as readonly string[]).includes(value);
}

export function getExpressionEmoji(expression: string): string {
  return isSupportedExpression(expression) ? EXPRESSION_EMOJI[expression] : UNKNOWN_EMOJI;
}

export function getExpressionLabel(expression: string): string {
  return isSupportedExpression(expression) ? EXPRESSION_LABEL[expression] : 'Unknown';
}

/** 0.923 → "92%". Values are clamped to 0–100%. */
export function formatConfidence(confidence: number): string {
  const clamped = Math.min(1, Math.max(0, confidence));
  return `${Math.round(clamped * 100)}%`;
}

export function isConfident(
  confidence: number,
  threshold: number = DETECTION_CONFIG.confidenceThreshold,
): boolean {
  return confidence >= threshold;
}
