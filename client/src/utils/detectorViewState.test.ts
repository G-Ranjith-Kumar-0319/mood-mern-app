import { describe, expect, it } from 'vitest';
import { getDetectorViewState, type DetectorViewInput } from './detectorViewState';
import { CameraPermissionError, InferenceError, ModelLoadError } from './errors';

const ACTIVE: DetectorViewInput = {
  cameraStatus: 'active',
  cameraError: null,
  modelStatus: 'ready',
  modelError: null,
  inferenceError: null,
  faceDetected: true,
  expression: { expression: 'happy', confidence: 0.9, updatedAt: 0 },
};

describe('getDetectorViewState', () => {
  it('is idle before the camera starts', () => {
    expect(getDetectorViewState({ ...ACTIVE, cameraStatus: 'off' }).kind).toBe('idle');
  });

  it('shows the permission prompt state', () => {
    expect(getDetectorViewState({ ...ACTIVE, cameraStatus: 'requesting' }).kind).toBe(
      'requesting-camera',
    );
  });

  it('shows the model loading state once the camera is on', () => {
    expect(getDetectorViewState({ ...ACTIVE, modelStatus: 'loading' }).kind).toBe('loading-model');
  });

  it('prioritises camera errors', () => {
    const state = getDetectorViewState({
      ...ACTIVE,
      cameraStatus: 'error',
      cameraError: new CameraPermissionError(),
      modelStatus: 'error',
      modelError: new ModelLoadError(),
    });
    expect(state.kind).toBe('camera-error');
  });

  it('reports model and inference errors', () => {
    expect(
      getDetectorViewState({ ...ACTIVE, modelStatus: 'error', modelError: new ModelLoadError() })
        .kind,
    ).toBe('model-error');
    expect(getDetectorViewState({ ...ACTIVE, inferenceError: new InferenceError() }).kind).toBe(
      'inference-error',
    );
  });

  it('distinguishes detecting, no face, low confidence and detected', () => {
    expect(getDetectorViewState({ ...ACTIVE, faceDetected: null, expression: null }).kind).toBe(
      'detecting',
    );
    expect(getDetectorViewState({ ...ACTIVE, faceDetected: false, expression: null }).kind).toBe(
      'no-face',
    );
    expect(
      getDetectorViewState({
        ...ACTIVE,
        expression: { expression: 'sad', confidence: 0.3, updatedAt: 0 },
      }).kind,
    ).toBe('low-confidence');
    expect(getDetectorViewState(ACTIVE).kind).toBe('detected');
  });
});
