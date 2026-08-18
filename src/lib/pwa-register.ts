// Register the production PWA service worker.
const SW_PATH = '/sw.js';

export function registerPwa() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SW_PATH, { scope: '/' }).catch((error) => {
      console.error('[PWA] No se pudo registrar el service worker', error);
    });
  }, { once: true });
}
