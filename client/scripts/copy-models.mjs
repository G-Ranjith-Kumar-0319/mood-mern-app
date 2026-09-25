// Copies the pre-trained face-api model weights from node_modules into `public/models`
// so Vite serves them from our own origin (no third-party CDN, works offline and in Docker).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Only the two models the app actually uses (~0.5 MB total).
const MODEL_FILES = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model.bin',
  'face_expression_model-weights_manifest.json',
  'face_expression_model.bin',
];

const require = createRequire(import.meta.url);
const packageDir = dirname(require.resolve('@vladmandic/face-api/package.json'));
const sourceDir = join(packageDir, 'model');
const targetDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models');

mkdirSync(targetDir, { recursive: true });
for (const file of MODEL_FILES) {
  const source = join(sourceDir, file);
  if (!existsSync(source)) {
    throw new Error(`Model file not found: ${source}. Is @vladmandic/face-api installed?`);
  }
  copyFileSync(source, join(targetDir, file));
}
console.log(`Copied ${MODEL_FILES.length} face-api model files to ${targetDir}`);
