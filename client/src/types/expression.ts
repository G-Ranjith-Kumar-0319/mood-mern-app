import type { Expression } from '../constants/expressions';

export type { Expression };

/** One raw model output for one face in one video frame. */
export interface ExpressionPrediction {
  expression: Expression;
  confidence: number;
  timestamp: number;
}

/** The expression shown to the user after temporal smoothing. */
export interface SmoothedExpression {
  expression: Expression;
  /** Mean confidence of the winning expression's recent predictions (0–1). */
  confidence: number;
  /** Timestamp of the prediction that produced this result. */
  updatedAt: number;
}

/** Face bounding box in the video's intrinsic pixel coordinates. */
export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A face found in one frame, with its top expression. */
export interface DetectedFace {
  box: FaceBox;
  /** Face-detector score (0–1). */
  score: number;
  prediction: ExpressionPrediction;
}

/** Result of running the model on a single frame. */
export interface FrameAnalysis {
  /** Most confident first; at most one unless multi-face mode is on. */
  faces: DetectedFace[];
  sourceWidth: number;
  sourceHeight: number;
  /** Wall-clock time the model took for this frame (ms). */
  inferenceMs: number;
}

/** A face followed across frames, with its own smoothed expression. */
export interface TrackedFace {
  id: number;
  box: FaceBox;
  expression: SmoothedExpression | null;
}

/** Per-call options the user can tune in the detection settings. */
export interface AnalyzeOptions {
  /** TinyFaceDetector input size (multiple of 32). */
  inputSize: number;
  multiFace: boolean;
}
