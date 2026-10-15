import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"
import tsconfigPaths from "vite-tsconfig-paths"
import { testDatabaseUrl } from "./tests/support/test-db"

const stub = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// юнит-тестам база не нужна: без адреса упадёт только globalSetup интеграционных
const dbUrl = testDatabaseUrl() ?? ""

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    // «server-only» в тестах не нужен: код и так выполняется в Node
    alias: { "server-only": stub("./tests/support/empty.ts") },
  },
  test: {
    env: { TZ: "UTC", AUTH_SECRET: "test-secret-test-secret-test-secret" },
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/server/**"],
      exclude: ["src/lib/use-hydrated.ts", "src/lib/app-icon.tsx"],
      reporter: ["text-summary", "html", "lcov"],
    },
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          env: { DATABASE_URL: dbUrl, DIRECT_URL: dbUrl },
          globalSetup: ["tests/support/db-global-setup.ts"],
          setupFiles: ["tests/support/integration-setup.ts"],
          // одна тестовая база на всех — файлы идут по очереди в одном процессе
          pool: "forks",
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 20_000,
        },
      },
    ],
  },
})
