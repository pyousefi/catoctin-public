import { defineConfig, devices } from "@playwright/test";
const secret = "playwright-only-secret-not-a-deployment-secret";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ignoreHTTPSErrors: true,
    baseURL: "https://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
    { name: "android", use: { ...devices["Pixel 7"] } },
    { name: "safari", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "node scripts/browser-test-server.mjs",
    url: "https://localhost:3100/login",
    reuseExistingServer: false,
    ignoreHTTPSErrors: true,
    env: {
      NODE_ENV: "production",
      SESSION_SECRET: secret,
      DATABASE_URL: "",
      FAMILY_PASSWORD_HASH: "",
      ADMIN_PASSWORD_HASH: "",
      BLOB_READ_WRITE_TOKEN: "",
      GOOGLE_ALBUM_2026_URL: "https://photos.app.goo.gl/test2026",
      GOOGLE_ALBUM_2025_URL: "https://photos.app.goo.gl/test2025",
      GOOGLE_ALBUM_2024_URL: "https://photos.app.goo.gl/test2024",
      GOOGLE_ALBUM_2010_URL: "https://photos.app.goo.gl/test2010",
    },
  },
});
