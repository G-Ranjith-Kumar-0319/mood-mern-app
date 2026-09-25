import type { AnalyzeOptions, FrameAnalysis } from '../types/expression';

/** Messages between the page and the detection Web Worker (structured-cloned). */
export type WorkerRequest =
  | { type: 'load'; modelUrl: string }
  | { type: 'analyze'; id: number; frame: ImageBitmap; options: AnalyzeOptions };

export type WorkerResponse =
  | { type: 'loaded'; tfBackend: string | null }
  | { type: 'load-error'; message: string }
  | { type: 'result'; id: number; analysis: FrameAnalysis }
  | { type: 'analyze-error'; id: number; message: string };
