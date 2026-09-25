import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const API_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  // Share the single root `.env` with the API server.
  envDir: '..',
  optimizeDeps: {
    // face-api is imported lazily; pre-bundle it at startup so Vite does not discover it
    // mid-session and force a full page reload (which would switch the camera off).
    include: ['@vladmandic/face-api'],
  },
  server: {
    port: 5173,
    // The browser calls same-origin `/api/...`; Vite forwards it to Express in development.
    // In Docker/production Nginx plays this role, so the client code never changes.
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  // The detection worker imports face-api as an ES module (code-split like the main app).
  worker: { format: 'es' },
  build: {
    // face-api bundles TensorFlow.js (~1.3 MB). It is lazy-loaded, so only the
    // detector chunk is large; raise the warning limit instead of hiding real problems.
    chunkSizeWarningLimit: 1600,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
  },
});
