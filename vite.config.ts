// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        devOptions: { enabled: false },
        filename: "sw.js",
        // IMPORTANT: this build uses TanStack Start + Nitro, whose real deployed
        // static output is .output/public (NOT the vite-plugin-pwa default "dist").
        // Without this, sw.js/manifest were written to an unused "dist" folder and
        // never actually shipped, so the app silently had zero offline support in
        // production (registration 404'd and was swallowed by a try/catch).
        outDir: ".output/public",
        manifest: {
          name: "Buena Vibra Finance",
          short_name: "Buena Vibra",
          description: "Caja de ahorros Buena Vibra Finance",
          theme_color: "#0f172a",
          background_color: "#0f172a",
          display: "standalone",
          start_url: "/",
          scope: "/",
          icons: [
            { src: "/logo.jpg", sizes: "192x192", type: "image/jpeg", purpose: "any" },
            { src: "/logo.jpg", sizes: "512x512", type: "image/jpeg", purpose: "any" },
          ],
        },
        workbox: {
          globDirectory: ".output/public",
          navigateFallback: "/",
          navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//, /^\/_serverFn\//],
          globPatterns: ["**/*.{js,css,html,ico,png,jpg,svg,woff2}"],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "html-nav",
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 7 },
              },
            },
            {
              urlPattern: ({ url }) => url.origin === self.location.origin && /\.(?:js|css|woff2|png|jpg|jpeg|svg|ico)$/.test(url.pathname),
              handler: "CacheFirst",
              options: {
                cacheName: "static-assets",
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              urlPattern: ({ url }) => url.hostname.endsWith(".supabase.co") && url.pathname.includes("/rest/v1/"),
              handler: "NetworkFirst",
              options: {
                cacheName: "supabase-data",
                networkTimeoutSeconds: 6,
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
  },
});
