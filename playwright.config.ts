import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  expect: {
    timeout: 15000
  },
  use: {
    baseURL: "http://localhost:5672",
    headless: true,
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream"
      ]
    }
  },
  webServer: {
    command: "npm run start",
    url: "http://localhost:5672/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      PORT: "5672",
      ALLOW_INSECURE_HTTP: "true"
    }
  }
});
