import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExpressionDetector } from '../services/expressionDetector';
import type { DetectedFace, FrameAnalysis } from '../types/expression';
import { ModelLoadError } from '../utils/errors';
import { useExpressionDetection, type DetectionSettings } from './useExpressionDetection';

const loadDetector = vi.fn<(options: { preferWorker: boolean }) => Promise<ExpressionDetector>>();
vi.mock('../services/detectorFactory', () => ({
  loadDetector: (options: { preferWorker: boolean }) => loadDetector(options),
}));

const SETTINGS: DetectionSettings = {
  inputSize: 224,
  inferencesPerSecond: 15,
  multiFace: false,
  useWorker: false,
};

function readyVideo(): { current: HTMLVideoElement } {
  const video = document.createElement('video');
  Object.defineProperty(video, 'readyState', { value: 4 });
  Object.defineProperty(video, 'videoWidth', { value: 640 });
  Object.defineProperty(video, 'videoHeight', { value: 480 });
  return { current: video };
}

function detectorReturning(makeAnalysis: () => FrameAnalysis): ExpressionDetector {
  return {
    kind: 'main-thread',
    tfBackend: 'cpu',
    analyze: vi.fn(() => Promise.resolve(makeAnalysis())),
    dispose: vi.fn(),
  };
}

const face = (x: number, expression: DetectedFace['prediction']['expression']): DetectedFace => ({
  box: { x, y: 10, width: 100, height: 100 },
  score: 0.9,
  prediction: { expression, confidence: 0.9, timestamp: performance.now() },
});

const frame = (faces: DetectedFace[]): FrameAnalysis => ({
  faces,
  sourceWidth: 640,
  sourceHeight: 480,
  inferenceMs: 25,
});

describe('useExpressionDetection', () => {
  beforeEach(() => {
    loadDetector.mockReset();
  });

  it('does not load the model until asked', () => {
    const videoRef = readyVideo();
    const { result } = renderHook(() =>
      useExpressionDetection({ videoRef, loadModel: false, running: false, settings: SETTINGS }),
    );
    expect(result.current.modelStatus).toBe('idle');
    expect(loadDetector).not.toHaveBeenCalled();
  });

  it('loads the model and produces a smoothed expression for the primary face', async () => {
    loadDetector.mockResolvedValue(detectorReturning(() => frame([face(10, 'happy')])));
    const videoRef = readyVideo();
    const { result } = renderHook(() =>
      useExpressionDetection({ videoRef, loadModel: true, running: true, settings: SETTINGS }),
    );

    expect(result.current.modelStatus).toBe('loading');
    await waitFor(() => expect(result.current.modelStatus).toBe('ready'));
    await waitFor(() => expect(result.current.expression?.expression).toBe('happy'));
    expect(result.current.faceDetected).toBe(true);
    expect(result.current.faces).toHaveLength(1);
    expect(result.current.backend).toBe('main-thread');
  });

  it('tracks several faces, each with its own expression', async () => {
    loadDetector.mockResolvedValue(
      detectorReturning(() => frame([face(10, 'happy'), face(400, 'surprised')])),
    );
    const videoRef = readyVideo();
    const { result } = renderHook(() =>
      useExpressionDetection({
        videoRef,
        loadModel: true,
        running: true,
        settings: { ...SETTINGS, multiFace: true },
      }),
    );

    await waitFor(() => {
      const expressions = result.current.faces.map((f) => f.expression?.expression).sort();
      expect(expressions).toEqual(['happy', 'surprised']);
    });
  });

  it('passes the tuning settings to the detector and reports performance', async () => {
    const detector = detectorReturning(() => frame([face(10, 'neutral')]));
    loadDetector.mockResolvedValue(detector);
    const videoRef = readyVideo();
    const { result } = renderHook(() =>
      useExpressionDetection({
        videoRef,
        loadModel: true,
        running: true,
        settings: { ...SETTINGS, inputSize: 320, useWorker: true },
      }),
    );

    await waitFor(() => expect(result.current.performance).not.toBeNull(), { timeout: 2000 });
    expect(loadDetector).toHaveBeenCalledWith({ preferWorker: true });
    expect(detector.analyze).toHaveBeenCalledWith(videoRef.current, {
      inputSize: 320,
      multiFace: false,
    });
    expect(result.current.performance?.averageInferenceMs).toBe(25);
  });

  it('reports "no face" after the grace period', async () => {
    loadDetector.mockResolvedValue(detectorReturning(() => frame([])));
    const videoRef = readyVideo();
    const { result } = renderHook(() =>
      useExpressionDetection({ videoRef, loadModel: true, running: true, settings: SETTINGS }),
    );

    await waitFor(() => expect(result.current.faceDetected).toBe(false), { timeout: 2000 });
    expect(result.current.expression).toBeNull();
  });

  it('does not run inference while the camera is not running', async () => {
    const detector = detectorReturning(() => frame([face(10, 'happy')]));
    loadDetector.mockResolvedValue(detector);
    const videoRef = readyVideo();
    const { result } = renderHook(() =>
      useExpressionDetection({ videoRef, loadModel: true, running: false, settings: SETTINGS }),
    );

    await waitFor(() => expect(result.current.modelStatus).toBe('ready'));
    expect(detector.analyze).not.toHaveBeenCalled();
  });

  it('exposes model load failures', async () => {
    loadDetector.mockImplementation(() => Promise.reject(new ModelLoadError()));
    const videoRef = readyVideo();
    const { result } = renderHook(() =>
      useExpressionDetection({ videoRef, loadModel: true, running: true, settings: SETTINGS }),
    );

    await waitFor(() => expect(result.current.modelStatus).toBe('error'));
    expect(result.current.modelError?.code).toBe('MODEL_LOAD_FAILED');
  });
});
