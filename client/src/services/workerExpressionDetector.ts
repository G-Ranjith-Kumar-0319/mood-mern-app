import { DETECTION_CONFIG } from '../constants/detection';
import type { AnalyzeOptions, FrameAnalysis } from '../types/expression';
import { InferenceError, ModelLoadError } from '../utils/errors';
import type { WorkerRequest, WorkerResponse } from './detectorProtocol';
import type { ExpressionDetector } from './expressionDetector';

/** Loading the model in a worker should never hang the UI forever. */
const LOAD_TIMEOUT_MS = 60_000;

/** Everything the worker path needs from the browser. */
export function isWorkerDetectionSupported(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap === 'function'
  );
}

/**
 * Page-side client for `detector.worker.ts`. Each analyze() call snapshots the
 * current video frame as an ImageBitmap, transfers it (no copy) and resolves
 * when the worker answers with the same request id.
 */
export function loadWorkerExpressionDetector(): Promise<ExpressionDetector> {
  const worker = new Worker(new URL('./detector.worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<
    number,
    { resolve: (analysis: FrameAnalysis) => void; reject: (error: Error) => void }
  >();
  let nextId = 1;
  const send = (message: WorkerRequest, transfer: Transferable[] = []) =>
    worker.postMessage(message, transfer);

  const rejectAll = (error: Error) => {
    pending.forEach(({ reject }) => reject(error));
    pending.clear();
  };

  let tfBackend: string | null = null;
  const detector: ExpressionDetector = {
    kind: 'worker',
    get tfBackend() {
      return tfBackend;
    },
    async analyze(video: HTMLVideoElement, options: AnalyzeOptions) {
      const frame = await createImageBitmap(video);
      const id = nextId++;
      return new Promise<FrameAnalysis>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        send({ type: 'analyze', id, frame, options }, [frame]);
      });
    },
    dispose() {
      rejectAll(new InferenceError());
      worker.terminate();
    },
  };

  return new Promise<ExpressionDetector>((resolve, reject) => {
    const fail = (cause: unknown) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(new ModelLoadError({ cause }));
    };
    const timeout = setTimeout(
      () => fail(new Error('Worker model load timed out')),
      LOAD_TIMEOUT_MS,
    );

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      switch (message.type) {
        case 'loaded':
          clearTimeout(timeout);
          tfBackend = message.tfBackend;
          resolve(detector);
          break;
        case 'load-error':
          fail(new Error(message.message));
          break;
        case 'result':
          pending.get(message.id)?.resolve(message.analysis);
          pending.delete(message.id);
          break;
        case 'analyze-error':
          pending
            .get(message.id)
            ?.reject(new InferenceError({ cause: new Error(message.message) }));
          pending.delete(message.id);
          break;
      }
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || 'Worker crashed');
      rejectAll(new InferenceError({ cause: error }));
      fail(error);
    };

    // Workers resolve relative URLs against their own script URL, so send an absolute one.
    send({ type: 'load', modelUrl: new URL(DETECTION_CONFIG.modelUrl, location.origin).href });
  });
}
