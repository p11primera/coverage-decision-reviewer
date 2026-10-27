import { defineConfig } from "@playwright/test";

// SPEC-M3B: no webServer — backend (:8100) and web (:3000) are already running detached
// and MUST be reused. Single worker: inference runs on a local (slow) vLLM; parallel
// runs would just starve each other. Long timeouts: the model itself needs minutes.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "../out/playwright-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "../out/playwright-report", open: "never" }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        launchOptions: {
          // This container cannot download @playwright/test's own browser build, so
          // drive the system Chromium (sanctioned executablePath fallback).
          executablePath: "/opt/hermes/tools/chromium-1208/chrome-linux/chrome",
        },
      },
    },
  ],
});
