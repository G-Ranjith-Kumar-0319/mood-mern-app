# face-api & TensorFlow.js — learning guide for this project

[`@vladmandic/face-api`](https://github.com/vladmandic/face-api) is a maintained
fork of face-api.js. It ships pre-trained neural networks and bundles
**TensorFlow.js**, which runs them in the browser (WebGL on the GPU, or CPU).
Nothing is sent to a server.

Everything face-api-specific is isolated in three files:

- [services/faceApiAnalysis.ts](../../client/src/services/faceApiAnalysis.ts): the shared detection logic
- [services/expressionDetector.ts](../../client/src/services/expressionDetector.ts): main-thread backend
- [services/detector.worker.ts](../../client/src/services/detector.worker.ts): Web Worker backend

---

## The two models

| Network               | Size    | Input → output                                                                                         |
| --------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| **TinyFaceDetector**  | ~190 KB | image → face boxes + scores                                                                            |
| **FaceExpressionNet** | ~330 KB | face crop → probabilities for 7 expressions: neutral, happy, sad, angry, fearful, disgusted, surprised |

The weights ship inside the npm package. `client/scripts/copy-models.mjs` copies the
4 files we need into `public/models`, so they're served from our own origin.

## API used

| Call                                                                 | What it does                                                                                                    |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `faceapi.nets.tinyFaceDetector.loadFromUri('/models')`               | Downloads and loads the detector weights                                                                        |
| `faceapi.nets.faceExpressionNet.loadFromUri('/models')`              | Same for the expression network                                                                                 |
| `new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold })` | `inputSize` (multiple of 32: 160–416) trades speed for accuracy; the user can change it in Detection settings   |
| `faceapi.detectSingleFace(input, options).withFaceExpressions()`     | The most confident face plus its expressions                                                                    |
| `faceapi.detectAllFaces(input, options).withFaceExpressions()`       | Every face (multi-face mode)                                                                                    |
| `result.detection.box` / `.score` / `.imageWidth`                    | Bounding box in input pixels, confidence, input size                                                            |
| `result.expressions.asSortedArray()`                                 | `[{ expression, probability }]`, highest first                                                                  |
| `faceapi.env.setEnv({...})`                                          | Registers a custom environment (used in the worker)                                                             |
| `faceapi.tf.browser.fromPixels(imageBitmap)`                         | Turns a frame into a tensor                                                                                     |
| `tensor.dispose()`                                                   | Frees GPU memory. **Tensors are not garbage-collected.**                                                        |
| `faceapi.tf.getBackend()`                                            | Which backend runs (`webgl`, `cpu`). It isn't in face-api's types but exists at runtime, so it's typed by hand. |

## The pipeline

```text
video frame ──► TinyFaceDetector ──► face box(es) ──► crop ──► FaceExpressionNet ──► 7 probabilities
                                                                                       │
            top expression + confidence ◄──────────── asSortedArray()[0] ◄─────────────┘
```

After the model: [FaceTracker](../../client/src/utils/faceTracker.ts) follows each
face across frames, and [ExpressionSmoother](../../client/src/utils/expressionSmoothing.ts)
turns noisy per-frame guesses into a stable result. See
[architecture.md](../architecture.md).

## Running in a Web Worker (the tricky part)

face-api configures itself automatically only when it sees `window` (browser) or
Node.js. A worker has neither, so the worker registers an environment itself:

```ts
faceapi.env.setEnv({
  Canvas: OffscreenCanvas,                 // stands in for <canvas>
  createCanvasElement: () => new OffscreenCanvas(1, 1),
  fetch: (url, init) => scope.fetch(url, init),   // loads the weights
  …                                         // image/video elements: never needed
});
```

Frames arrive as tensors (`fromPixels`), which take face-api's tensor code path. It
never tries to create DOM elements.

## Performance lessons (measured in a real browser)

- The **first** inferences are slow (hundreds of ms) while WebGL compiles shaders.
  After warm-up, one inference took ~46–54 ms on both the worker and main thread.
- On a slow device, an inference can take seconds. The smoother and tracker adapt:
  they use the latest N predictions when the time window holds too few, and remember
  faces for 2.5× the observed frame gap. Without that, a slow device never produced
  a result. We found this by testing in a browser without a GPU.
- Loading is lazy: `await import('@vladmandic/face-api')` means the 1.3 MB library
  downloads only when the camera starts.

## Limits (be honest in the UI)

- 7 classes only. The UI and API accept exactly these (never invent categories).
- Trained on posed expressions; accuracy drops with lighting, head pose, occlusion,
  and it may be uneven across demographics. The app shows confidence and a
  "low confidence" state, and never claims to know how someone _feels_.

## Exercises

1. Change `inputSize` in Detection settings from 160 to 416 and watch the
   performance readout (turn it on in settings). How do speed and detection of
   small faces change?
2. Log `expressions.asSortedArray()` for a few frames. How often does the top
   expression change? That's why smoothing exists.
