import type { CameraStatus } from '../types/camera';
import type { ModelStatus } from '../hooks/useExpressionDetection';
import type { SmoothedExpression } from '../types/expression';
import type { AppError } from './errors';
import { isConfident } from './expressionDisplay';

/** Every state the home page can be in (CLAUDE.md §17). */
export type DetectorViewState =
  | { kind: 'idle' }
  | { kind: 'loading-model' }
  | { kind: 'requesting-camera' }
  | { kind: 'switching-camera' }
  | { kind: 'waiting-for-phone' }
  | { kind: 'camera-error'; error: AppError }
  | { kind: 'model-error'; error: AppError }
  | { kind: 'inference-error'; error: AppError }
  | { kind: 'detecting' }
  | { kind: 'no-face' }
  | { kind: 'low-confidence'; expression: SmoothedExpression }
  | { kind: 'detected'; expression: SmoothedExpression };

export interface DetectorViewInput {
  /** Where frames come from; a phone that is not streaming yet is "waiting", not "off". */
  source?: 'local' | 'phone';
  cameraStatus: CameraStatus;
  cameraError: AppError | null;
  modelStatus: ModelStatus;
  modelError: AppError | null;
  inferenceError: AppError | null;
  faceDetected: boolean | null;
  expression: SmoothedExpression | null;
}

/**
 * Collapses camera + model + detection state into one UI state.
 * Errors win first, then "not ready yet" states, then detection results.
 */
export function getDetectorViewState(input: DetectorViewInput): DetectorViewState {
  const { cameraStatus, cameraError, modelStatus, modelError, inferenceError } = input;

  if (cameraStatus === 'error' && cameraError) return { kind: 'camera-error', error: cameraError };
  if (modelStatus === 'error' && modelError) return { kind: 'model-error', error: modelError };
  if (inferenceError) return { kind: 'inference-error', error: inferenceError };
  if (cameraStatus === 'requesting-permission') return { kind: 'requesting-camera' };
  // Never show the previous camera's expression/confidence while the next one starts.
  if (cameraStatus === 'switching') return { kind: 'switching-camera' };
  if (cameraStatus !== 'active') {
    return input.source === 'phone' ? { kind: 'waiting-for-phone' } : { kind: 'idle' };
  }
  if (modelStatus !== 'ready') return { kind: 'loading-model' };

  const { faceDetected, expression } = input;
  if (faceDetected === false) return { kind: 'no-face' };
  if (!expression) return { kind: 'detecting' };
  if (!isConfident(expression.confidence)) return { kind: 'low-confidence', expression };
  return { kind: 'detected', expression };
}
