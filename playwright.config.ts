import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:3456",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "GOOGLE_CLIENT_ID= GOOGLE_CLIENT_SECRET= DATA_DIR=.data/e2e-pglite ADMIN_EMAILS=admin@test.dev BETTER_AUTH_SECRET=test-secret-test-secret-test-secret NEXT_DIST_DIR=.next-e2e npm run dev -- --port 3456",
    url: "http://localhost:3456/sign-in",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
