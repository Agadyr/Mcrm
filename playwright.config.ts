import { defineConfig, devices } from "@playwright/test"
import { testDatabaseUrl } from "./tests/support/test-db"

// E2E: production-сборка в отдельной папке (.next-e2e) на порту 3100 и отдельная база «<имя>_e2e».
// Основной `npm run dev` и его база не затрагиваются.
const PORT = 3100
const DATABASE_URL = testDatabaseUrl("e2e") ?? ""

export const e2eEnv = {
  DATABASE_URL,
  DIRECT_URL: DATABASE_URL,
  NEXT_DIST_DIR: ".next-e2e",
  AUTH_SECRET: process.env.AUTH_SECRET || "e2e-secret-e2e-secret-e2e-secret",
  TELEGRAM_BOT_TOKEN: "",
}

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ru-RU",
    timezoneId: "Asia/Almaty",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /smoke/ },
  ],
  webServer: {
    command: process.env.E2E_SKIP_BUILD
      ? `npx next start -p ${PORT}`
      : `npx prisma generate && npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    env: e2eEnv,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
})
