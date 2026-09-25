/**
 * Runs face detection + expression classification off the main thread, so the
 * page (video, buttons, charts) stays smooth while the model works.
 *
 * The page sends each frame as a transferred ImageBitmap (zero-copy); the
 * worker turns it into a tensor, runs the shared face-api pipeline and posts
 * back plain JSON. TensorFlow.js uses WebGL through OffscreenCanvas here.
 */
import * as faceapi from '@vladmandic/face-api';
import type { WorkerRequest, WorkerResponse } from './detectorProtocol';
import { activeBackend, analyzeInput, loadModels } from './faceApiAnalysis';

/** The parts of the worker global scope we use (the DOM lib types `self` as a Window). */
interface WorkerScope {
  postMessage(message: WorkerResponse): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  fetch: typeof fetch;
}
const scope = self as unknown as WorkerScope;

const unsupported = (what: string) => () => {
  throw new Error(`${what} is not available in a Web Worker`);
};

/**
 * face-api auto-configures itself only for `window` or Node.js. In a worker we
 * register an environment by hand: OffscreenCanvas stands in for <canvas> and
 * the worker's own fetch loads the weights. Image/video elements are never
 * needed because frames arrive as tensors.
 */
function registerWorkerEnvironment(): void {
  type Environment = Parameters<typeof faceapi.env.setEnv>[0];
  faceapi.env.setEnv({
    Canvas: OffscreenCanvas as unknown as Environment['Canvas'],
    CanvasRenderingContext2D:
      OffscreenCanvasRenderingContext2D as unknown as Environment['CanvasRenderingContext2D'],
    Image: class {} as unknown as Environment['Image'],
    ImageData,
    Video: class {} as unknown as Environment['Video'],
    createCanvasElement: () => new OffscreenCanvas(1, 1) as unknown as HTMLCanvasElement,
    createImageElement: unsupported('HTMLImageElement'),
    createVideoElement: unsupported('HTMLVideoElement'),
    fetch: (url, init) => scope.fetch(url, init),
    readFile: unsupported('readFile'),
  });
}

const post = (message: WorkerResponse) => scope.postMessage(message);
const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function handle(request: WorkerRequest): Promise<void> {
  if (request.type === 'load') {
    try {
      registerWorkerEnvironment();
      await loadModels(faceapi, request.modelUrl);
      post({ type: 'loaded', tfBackend: activeBackend(faceapi) });
    } catch (error) {
      post({ type: 'load-error', message: describe(error) });
    }
    return;
  }

  const { id, frame, options } = request;
  const tensor = faceapi.tf.browser.fromPixels(frame);
  try {
    const analysis = await analyzeInput(
      faceapi,
      tensor,
      { width: frame.width, height: frame.height },
      options,
    );
    post({ type: 'result', id, analysis });
  } catch (error) {
    post({ type: 'analyze-error', id, message: describe(error) });
  } finally {
    // GPU memory is not garbage-collected: release every frame explicitly.
    tensor.dispose();
    frame.close();
  }
}

scope.onmessage = (event) => {
  void handle(event.data);
};
