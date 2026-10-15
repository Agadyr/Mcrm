// Адрес тестовой базы: TEST_DATABASE_URL или DATABASE_URL из .env с именем базы «<имя>_test».
// Тесты очищают таблицы, поэтому с базой без «_test» в имени не работаем.

function loadDotEnv() {
  try {
    process.loadEnvFile(".env")
  } catch {
    // .env нет (CI) — берём переменные окружения
  }
}

export function testDatabaseUrl(suffix = "test"): string | null {
  loadDotEnv()
  const explicit = suffix === "test" ? process.env.TEST_DATABASE_URL : process.env.E2E_DATABASE_URL
  const raw = explicit ?? process.env.DATABASE_URL
  if (!raw) return null
  const url = new URL(raw)
  if (!explicit) url.pathname = `${url.pathname.replace(/^\//, "").replace(/_(test|e2e)$/, "")}_${suffix}`
  assertTestDatabase(url.toString())
  return url.toString()
}

export function assertTestDatabase(raw: string) {
  const name = new URL(raw).pathname.slice(1)
  if (!/_(test|e2e)$/.test(name)) {
    throw new Error(`Отказ: база «${name}» не похожа на тестовую (имя должно кончаться на _test или _e2e)`)
  }
}
