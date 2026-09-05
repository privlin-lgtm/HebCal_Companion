import { defineConfig, devices } from "@playwright/test";

const basePath = "/HebCal_Companion/";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:4173${basePath}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run build && npx vite preview --host 127.0.0.1 --port 4173",
    url: `http://127.0.0.1:4173${basePath}`,
    // Never reuse a stale preview: E2E must run against a build made with the
    // env below, otherwise the fake-relay hook would be compiled out.
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      // E2E must never contact a real Supabase account. Clearing these at
      // build time overrides any .env.local credentials so the build is fully
      // accountless ("Supabase unset") and the sync panel stays hidden unless
      // the test installs the fake relay hook below.
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_ANON_KEY: "",
      // Compile the test-only composition seam (src/composition.ts) so the
      // two-context sync scenario can inject a fake in-memory relay.
      VITE_E2E_TEST_HOOK: "1",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
