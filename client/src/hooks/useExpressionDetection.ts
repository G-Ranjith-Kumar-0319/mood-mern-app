import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { DETECTION_CONFIG, SMOOTHING_CONFIG } from '../constants/detection';
import { loadDetector } from '../services/detectorFactory';
import type { ExpressionDetector } from '../services/expressionDetector';
import type { FrameAnalysis, SmoothedExpression, TrackedFace } from '../types/expression';
import { AppError, InferenceError, ModelLoadError } from '../utils/errors';
import { FaceTracker } from '../utils/faceTracker';
import { PerformanceMeter, type PerformanceStats } from '../utils/performanceMeter';
import type { DetectorSettings } from './useDetectorSettings';

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface FaceState {
  /** null until the first inference has run. */
  faceDetected: boolean | null;
  /** Faces visible in the latest frame; the primary face first. */
  faces: TrackedFace[];
  /** The primary face's smoothed expression (drives the main panel and saving). */
  expression: SmoothedExpression | null;
  sourceWidth: number;
  sourceHeight: number;
}

export type DetectionSettings = Pick<
  DetectorSettings,
  'inputSize' | 'inferencesPerSecond' | 'multiFace' | 'useWorker'
>;

export interface UseExpressionDetectionOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Start downloading the model (e.g. as soon as the user asks for the camera). */
  loadModel: boolean;
  /** Run inference (camera is streaming). */
  running: boolean;
  settings: DetectionSettings;
}

export interface UseExpressionDetectionResult extends FaceState {
  modelStatus: ModelStatus;
  modelError: AppError | null;
  inferenceError: AppError | null;
  /** Where inference actually runs (the worker may be unavailable in this browser). */
  backend: ExpressionDetector['kind'] | null;
  /** TensorFlow.js backend ("webgl" = GPU, "cpu" = slow fallback). */
  tfBackend: string | null;
  performance: PerformanceStats | null;
  retryModel: () => void;
}

interface LoadResult {
  key: string;
  status: 'ready' | 'error';
  backend: ExpressionDetector['kind'] | null;
  tfBackend: string | null;
  error: AppError | null;
}

/** 'loading' = a load was requested that has not finished; a finished load stays usable. */
function deriveModelStatus(requestKey: string | null, result: LoadResult | null): ModelStatus {
  if (result && result.key === requestKey) return result.status;
  if (requestKey !== null) return 'loading';
  return result?.status === 'ready' ? 'ready' : 'idle';
}

const INITIAL_FACE_STATE: FaceState = {
  faceDetected: null,
  faces: [],
  expression: null,
  sourceWidth: 0,
  sourceHeight: 0,
};

/** HTMLMediaElement.HAVE_CURRENT_DATA — a frame is available to read. */
const HAVE_CURRENT_DATA = 2;
const MS_PER_SECOND = 1000;
/** Performance readout refresh rate: a steadier number and fewer re-renders. */
const PERFORMANCE_UPDATE_MS = 500;
/** Minimum box overlap to treat detections in consecutive frames as the same face. */
const TRACKING_MIN_IOU = 0.3;

function canAnalyze(video: HTMLVideoElement | null): video is HTMLVideoElement {
  return (
    video !== null &&
    video.readyState >= HAVE_CURRENT_DATA &&
    video.videoWidth > 0 &&
    // No point spending CPU/battery on a tab nobody is looking at.
    document.visibilityState !== 'hidden'
  );
}

/**
 * Owns the AI side of the pipeline:
 * model loading → frame scheduling → face detection → expression classification →
 * per-face tracking + smoothing → performance measurement.
 */
export function useExpressionDetection({
  videoRef,
  loadModel,
  running,
  settings,
}: UseExpressionDetectionOptions): UseExpressionDetectionResult {
  // Results are stored with the request they belong to; 'loading' and stale errors are
  // derived during render instead of being set synchronously inside effects.
  const [loadResult, setLoadResult] = useState<LoadResult | null>(null);
  const [inferenceFailure, setInferenceFailure] = useState<{
    runKey: string;
    error: AppError;
  } | null>(null);
  const [faceState, setFaceState] = useState<FaceState>(INITIAL_FACE_STATE);
  const [performanceStats, setPerformanceStats] = useState<PerformanceStats | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const detectorRef = useRef<ExpressionDetector | null>(null);
  // Settings are read through a ref so changing them never restarts the loop.
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // 1. Model loading. Switching worker ↔ main thread loads the other backend.
  const { useWorker } = settings;
  const requestKey = loadModel ? `${useWorker ? 'worker' : 'main'}#${loadAttempt}` : null;
  useEffect(() => {
    if (requestKey === null) return;
    let cancelled = false;

    loadDetector({ preferWorker: useWorker })
      .then((detector) => {
        if (cancelled) return;
        detectorRef.current = detector;
        setLoadResult({
          key: requestKey,
          status: 'ready',
          backend: detector.kind,
          tfBackend: detector.tfBackend,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const appError = error instanceof AppError ? error : new ModelLoadError({ cause: error });
        setLoadResult({
          key: requestKey,
          status: 'error',
          backend: null,
          tfBackend: null,
          error: appError,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [requestKey, useWorker]);

  const modelStatus = deriveModelStatus(requestKey, loadResult);
  const modelError = modelStatus === 'error' ? (loadResult?.error ?? null) : null;
  const backend = modelStatus === 'ready' ? (loadResult?.backend ?? null) : null;
  const tfBackend = modelStatus === 'ready' ? (loadResult?.tfBackend ?? null) : null;
  const runKey = `${running}|${modelStatus}|${backend}`;

  // 2. Inference loop — only while the camera runs and the model is ready.
  useEffect(() => {
    const detector = detectorRef.current;
    if (!running || modelStatus !== 'ready' || !detector) return;

    const tracker = new FaceTracker({
      smoothing: SMOOTHING_CONFIG,
      minIou: TRACKING_MIN_IOU,
      maxMissingMs: DETECTION_CONFIG.noFaceGraceMs,
    });
    const meter = new PerformanceMeter();
    let lastPerformanceUpdate = 0;
    let lastAnalysisAt: number | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const handleAnalysis = (analysis: FrameAnalysis) => {
      const now = performance.now();
      const { sourceWidth, sourceHeight } = analysis;
      meter.record(now, analysis.inferenceMs);
      if (lastAnalysisAt !== null) tracker.adaptToFrameInterval(now - lastAnalysisAt);
      lastAnalysisAt = now;
      if (now - lastPerformanceUpdate >= PERFORMANCE_UPDATE_MS) {
        lastPerformanceUpdate = now;
        setPerformanceStats(meter.stats(now));
      }

      const faces = tracker.update(analysis.faces, now);
      if (faces.length > 0) {
        setFaceState({
          faceDetected: true,
          faces,
          expression: tracker.primaryExpression(),
          sourceWidth,
          sourceHeight,
        });
      } else if (tracker.hasRecentFace()) {
        // Brief misses (a blink, a turned head) keep the last expression on screen.
        setFaceState((previous) => ({ ...previous, faces: [] }));
      } else {
        setFaceState({ ...INITIAL_FACE_STATE, faceDetected: false, sourceWidth, sourceHeight });
      }
    };

    const tick = async () => {
      const startedAt = performance.now();
      const video = videoRef.current;
      const { inputSize, multiFace, inferencesPerSecond } = settingsRef.current;

      if (canAnalyze(video)) {
        try {
          const analysis = await detector.analyze(video, { inputSize, multiFace });
          if (cancelled) return;
          handleAnalysis(analysis);
        } catch (error) {
          if (cancelled) return;
          setInferenceFailure({
            runKey,
            error: error instanceof AppError ? error : new InferenceError({ cause: error }),
          });
          return; // stop the loop; the user can restart the camera to try again
        }
      }

      if (cancelled) return;
      // Schedule the *next* run only after this one finished, so inference never piles up.
      const elapsed = performance.now() - startedAt;
      const interval = MS_PER_SECOND / inferencesPerSecond;
      timer = setTimeout(tick, Math.max(0, interval - elapsed));
    };

    void tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setFaceState(INITIAL_FACE_STATE);
      setPerformanceStats(null);
    };
  }, [running, modelStatus, backend, runKey, videoRef]);

  const retryModel = useCallback(() => setLoadAttempt((attempt) => attempt + 1), []);

  return {
    ...faceState,
    modelStatus,
    modelError,
    // An error from a previous run (before the camera restarted) is no longer relevant.
    inferenceError: inferenceFailure?.runKey === runKey ? inferenceFailure.error : null,
    backend,
    tfBackend,
    performance: performanceStats,
    retryModel,
  };
}
