# 0002 — Browser-side inference with `@vladmandic/face-api`

**Status:** accepted

## Context

The app must classify visible facial expressions from a webcam, keep camera frames on the device,
and not invent a model.

Options considered:

| Option                                                                     | Expression output                                       | Notes                                                                                                       |
| -------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **@vladmandic/face-api** (maintained fork of face-api.js on TensorFlow.js) | Yes: 7 classes with probabilities (`FaceExpressionNet`) | Ships pre-trained weights in the npm package. Small models.                                                 |
| MediaPipe Face Landmarker                                                  | No: 52 _blendshapes_ (e.g. `mouthSmileLeft`)            | Would need hand-written rules to turn blendshapes into expressions, which amounts to inventing a classifier |
| Server-side inference (Python)                                             | Any                                                     | Frames would leave the device. Contradicts the privacy requirement.                                         |

## Decision

Use `@vladmandic/face-api` in the browser:

- `TinyFaceDetector` (~190 KB) for the face box, input size 224
- `FaceExpressionNet` (~330 KB) for `neutral, happy, sad, angry, fearful, disgusted, surprised`.
  These are the **only** categories the UI and API accept.
- Weights are copied from `node_modules` into `public/models` by `client/scripts/copy-models.mjs`
  and served first-party.
- The library (bundled TF.js, ~1.3 MB) is loaded with a dynamic `import()` when the camera starts.
- All face-api usage is isolated in `services/expressionDetector.ts`.

## Consequences

- Privacy by construction. Works offline once loaded.
- The model is small and old-style. It is less accurate with poor lighting, head pose, occlusion, and
  for some demographics, so the UI shows confidence and a "low confidence" state and makes no
  claims about feelings.
- The package was last published in early 2025. If it becomes unmaintained, swapping the model means
  replacing one service file that returns `{ face, prediction }`.
