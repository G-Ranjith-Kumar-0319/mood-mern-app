/**
 * Registers the offline service worker (public/sw.js) in production builds only.
 * In development it would cache Vite's modules and fight hot reloading.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      // Offline support is an enhancement; the app works without it.
      console.warn('Service worker registration failed', error);
    });
  });
}
