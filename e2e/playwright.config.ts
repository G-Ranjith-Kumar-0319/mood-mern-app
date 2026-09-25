import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests drive a real Chromium against the *production* client build
 * (served by `vite preview`, which proxies /api like Nginx does) and the real API
 * (with a throw-away in-memory MongoDB replica set).
 *
 * The camera is Chromium's fake capture device:
 * - "face" project: a photo of three people, looped as the webcam feed
 * - "no-face" project: Chromium's built-in synthetic test pattern
 * No real camera or credential form is ever used.
 */
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Chromium accepts an MJPEG file as a fake camera; a single JPEG frame works and loops.
const sampleImage = join(
  dirname(require.resolve('@vladmandic/face-api/package.json')),
  'demo',
  'sample1.jpg',
);
const fakeVideo = join(here, '.fixtures', 'face.mjpeg');
mkdirSync(dirname(fakeVideo), { recursive: true });
copyFileSync(sampleImage, fakeVideo);

const CLIENT_PORT = 4173;
const API_PORT = 5055;
const fakeCamera = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];

export default defineConfig({
  testDir: './tests',
  // One shared anonymous history: run tests one at a time for predictable data.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'face',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: [...fakeCamera, `--use-file-for-fake-video-capture=${fakeVideo}`] },
      },
      testIgnore: /no-face\.spec\.ts/,
    },
    {
      name: 'no-face',
      use: { ...devices['Desktop Chrome'], launchOptions: { args: fakeCamera } },
      testMatch: /no-face\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'npm run dev -w server',
      cwd: join(here, '..'),
      url: `http://localhost:${API_PORT}/api/v1/health`,
      // MONGO_URI empty → in-memory replica set; generous limits for test traffic.
      env: {
        MONGO_URI: '',
        PORT: String(API_PORT),
        CLIENT_URL: `http://localhost:${CLIENT_PORT}`,
        RATE_LIMIT_MAX: '10000',
        LOG_LEVEL: 'warn',
      },
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm run build -w client && npm run preview -w client -- --port ${CLIENT_PORT} --strictPort`,
      cwd: join(here, '..'),
      url: `http://localhost:${CLIENT_PORT}`,
      env: { VITE_API_PROXY_TARGET: `http://localhost:${API_PORT}` },
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
