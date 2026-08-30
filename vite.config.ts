import { defineConfig } from "vitest/config";

// GitHub Pages project site: https://privlin-lgtm.github.io/HebCal_Companion/
const base = process.env.VITE_BASE ?? "/HebCal_Companion/";

export default defineConfig({
  base,
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
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
