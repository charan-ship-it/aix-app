import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  reporter: "list",
  outputDir: "outputs/browser-results",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:4173",
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    ...(process.env.E2E_CHROME ? { channel: "chrome" } : {}),
  },
});
