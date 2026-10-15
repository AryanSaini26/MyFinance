import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
          args: [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
          ],
        }
      : {},
  },
  webServer: [
    {
      command: "go run ./cmd/sync",
      cwd: "services/sync",
      env: {
        DATABASE_URL:
          process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
      },
      url: "http://127.0.0.1:8080/health",
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: "npm start",
      url: "http://localhost:3000",
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
