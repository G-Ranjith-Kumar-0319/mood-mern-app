import { DETECTION_CONFIG } from '../constants/detection';
import type { AnalyzeOptions, FrameAnalysis } from '../types/expression';
import { InferenceError, ModelLoadError } from '../utils/errors';
import { activeBackend, analyzeInput, loadModels } from './faceApiAnalysis';

/**
 * Main-thread detector built on @vladmandic/face-api (a maintained fork of face-api.js).
 *
 * - TinyFaceDetector finds faces (~190 KB weights, fast on CPU/WebGL).
 * - FaceExpressionNet classifies each face crop into 7 expressions (~330 KB).
 *
 * Everything runs in the browser via TensorFlow.js; frames never leave the device.
 * The library (which bundles TF.js, ~1.3 MB) is imported lazily so it is only
 * downloaded once the user starts the camera. A Web Worker variant lives in
 * `workerExpressionDetector.ts`; both implement this interface.
 */
export interface ExpressionDetector {
  readonly kind: 'main-thread' | 'worker';
  /** TensorFlow.js backend actually used, e.g. "webgl" or "cpu". */
  readonly tfBackend: string | null;
  analyze(video: HTMLVideoElement, options: AnalyzeOptions): Promise<FrameAnalysis>;
  dispose(): void;
}

let detectorPromise: Promise<ExpressionDetector> | null = null;

async function load(): Promise<ExpressionDetector> {
  try {
    const faceapi = await import('@vladmandic/face-api');
    await loadModels(faceapi, DETECTION_CONFIG.modelUrl);
    return {
      kind: 'main-thread',
      tfBackend: activeBackend(faceapi),
      async analyze(video, options) {
        try {
          return await analyzeInput(
            faceapi,
            video,
            { width: video.videoWidth, height: video.videoHeight },
            options,
          );
        } catch (cause) {
          throw new InferenceError({ cause });
        }
      },
      // Models stay cached for the page lifetime so restarting the camera is instant.
      dispose() {},
    };
  } catch (cause) {
    throw new ModelLoadError({ cause });
  }
}

/** Loads the models once per page; later calls reuse the same promise. A failure can be retried. */
export function loadExpressionDetector(): Promise<ExpressionDetector> {
  detectorPromise ??= load().catch((error: unknown) => {
    detectorPromise = null;
    throw error;
  });
  return detectorPromise;
}
