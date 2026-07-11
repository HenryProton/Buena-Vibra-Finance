// Registration wrapper for the app service worker.
// Guarded to NEVER register in dev, preview, or iframes — only in the published app.

const SW_PATH = "/sw.js";

function shouldRegister(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!import.meta.env.PROD) return false;
  try {
    if (window.self !== window.top) return false;
  } catch {
    return false;
  }
  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return false;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return false;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return false;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return false;
  if (new URL(window.location.href).searchParams.get("sw") === "off") return false;
  return true;
}

async function unregisterExisting() {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      const url = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || "";
      if (url.endsWith(SW_PATH) || url.endsWith("/service-worker.js")) {
        await reg.unregister();
      }
    }
  } catch { /* ignore */ }
}

export function registerPwa() {
  if (typeof window === "undefined") return;
  if (!shouldRegister()) {
    if ("serviceWorker" in navigator) void unregisterExisting();
    return;
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(SW_PATH).catch(() => { /* ignore */ });
  });
}
