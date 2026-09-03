import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.VITE_BASE ?? "/HebCal_Companion/";

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Or Zarua — Hebrew Calendar Companion",
        short_name: "Or Zarua",
        description:
          "A private, local-first planner for Hebrew dates, Shabbat times, and remembrances.",
        theme_color: "#263b43",
        background_color: "#faf8f3",
        display: "standalone",
        orientation: "portrait",
        scope: base,
        start_url: base,
        lang: "en",
        dir: "ltr",
        icons: [
          { src: `${base}pwa-192.png`, sizes: "192x192", type: "image/png" },
          { src: `${base}pwa-512.png`, sizes: "512x512", type: "image/png" },
          { src: `${base}pwa-512-maskable.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/www\.hebcal\.com\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "hebcal-api",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/geocoding-api\.open-meteo\.com\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "geocoding-api",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    globals: true,
  },
});
