import type * as FaceApiModule from '@vladmandic/face-api';
import { DETECTION_CONFIG } from '../constants/detection';
import type { AnalyzeOptions, DetectedFace, FrameAnalysis } from '../types/expression';

/**
 * face-api calls shared by the main-thread detector and the Web Worker, so the
 * detection logic exists exactly once. `input` is a video element (main thread)
 * or a tensor built from an ImageBitmap (worker).
 */
export type FaceApi = typeof FaceApiModule;
type NetInput = Parameters<FaceApi['detectAllFaces']>[0];

/**
 * The TensorFlow.js backend in use ("webgl", "cpu", …). face-api does not type
 * `getBackend`, but its bundled TF.js provides it at runtime.
 */
export function activeBackend(faceapi: FaceApi): string | null {
  const tf = faceapi.tf as unknown as { getBackend?: () => string };
  return tf.getBackend?.() ?? null;
}

export async function loadModels(faceapi: FaceApi, modelUrl: string): Promise<void> {
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl),
    faceapi.nets.faceExpressionNet.loadFromUri(modelUrl),
  ]);
}

export async function analyzeInput(
  faceapi: FaceApi,
  input: NetInput,
  size: { width: number; height: number },
  options: AnalyzeOptions,
): Promise<FrameAnalysis> {
  const detectorOptions = new faceapi.TinyFaceDetectorOptions({
    inputSize: options.inputSize,
    scoreThreshold: DETECTION_CONFIG.faceScoreThreshold,
  });

  const startedAt = performance.now();
  const results = options.multiFace
    ? await faceapi.detectAllFaces(input, detectorOptions).withFaceExpressions()
    : [await faceapi.detectSingleFace(input, detectorOptions).withFaceExpressions()].filter(
        (result) => result !== undefined,
      );
  const inferenceMs = performance.now() - startedAt;
  const timestamp = performance.now();

  const faces: DetectedFace[] = [];
  for (const { detection, expressions } of results) {
    const [top] = expressions.asSortedArray();
    if (!top) continue;
    const { x, y, width, height } = detection.box;
    faces.push({
      box: { x, y, width, height },
      score: detection.score,
      prediction: { expression: top.expression, confidence: top.probability, timestamp },
    });
  }
  faces.sort((a, b) => b.score - a.score);

  return { faces, sourceWidth: size.width, sourceHeight: size.height, inferenceMs };
}
