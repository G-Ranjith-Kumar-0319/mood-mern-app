import { loadExpressionDetector, type ExpressionDetector } from './expressionDetector';
import {
  isWorkerDetectionSupported,
  loadWorkerExpressionDetector,
} from './workerExpressionDetector';

let workerPromise: Promise<ExpressionDetector> | null = null;

/**
 * Chooses where inference runs. The Web Worker is preferred (keeps the page
 * responsive); if the browser lacks the required APIs or the worker fails to
 * start, it transparently falls back to the main thread.
 * Both backends are cached for the page lifetime, so toggling is instant after the first load.
 */
export async function loadDetector({
  preferWorker,
}: {
  preferWorker: boolean;
}): Promise<ExpressionDetector> {
  if (preferWorker && isWorkerDetectionSupported()) {
    workerPromise ??= loadWorkerExpressionDetector().catch((error: unknown) => {
      workerPromise = null;
      throw error;
    });
    try {
      return await workerPromise;
    } catch (error) {
      console.warn('Web Worker detection unavailable, using the main thread instead.', error);
    }
  }
  return loadExpressionDetector();
}
