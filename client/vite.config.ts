import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const API_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:5000';

/**
 * `vite --mode phone` (npm run dev:phone): serve on the LAN over HTTPS with a
 * self-signed certificate. Phones only allow camera access in a secure context,
 * and http://192.168.x.x is not one (only http://localhost is).
 */
export default defineConfig(({ mode }) => ({
  plugins: mode === 'phone' ? [react(), basicSsl()] : [react()],
  // Share the single root `.env` with the API server.
  envDir: '..',
  optimizeDeps: {
    // face-api is imported lazily; pre-bundle it at startup so Vite does not discover it
    // mid-session and force a full page reload (which would switch the camera off).
    include: ['@vladmandic/face-api'],
  },
  server: {
    port: 5173,
    // Reachable from a phone on the same Wi-Fi in phone mode; localhost-only otherwise.
    host: mode === 'phone' ? true : undefined,
    // The browser calls same-origin `/api/...`; Vite forwards it to Express in development.
    // In Docker/production Nginx plays this role, so the client code never changes.
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      // WebRTC signaling (Socket.IO); `ws` upgrades the connection to a WebSocket.
      '/socket.io': { target: API_TARGET, changeOrigin: true, ws: true },
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
}));
