import { execSync } from "node:child_process"
import { testDatabaseUrl } from "./test-db"

/** Перед интеграционными тестами: тестовая база со всеми миграциями (создаётся, если её нет). Таблицы чистит каждый тест. */
export default function setup() {
  const url = testDatabaseUrl()
  if (!url) throw new Error("Для интеграционных тестов задайте TEST_DATABASE_URL или DATABASE_URL")
  execSync("npx prisma migrate deploy", {
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  })
}
