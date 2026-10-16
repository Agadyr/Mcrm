import { afterAll, beforeEach, vi } from "vitest"
import { prisma } from "@/lib/db"
import { cookieJar, headerJar } from "./next-mocks"

// Server actions вызываются напрямую, без Next.js: подменяем то, что работает только внутри запроса.
vi.mock("next/headers", async () => (await import("./next-mocks")).headersModule)
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock("next/navigation", async () => (await import("./next-mocks")).navigationModule)
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: vi.fn() }))
// уведомления в Telegram в тестах не отправляем
vi.mock("@/lib/telegram", async (orig) => ({ ...(await orig<object>()), sendTelegram: vi.fn() }))

beforeEach(async () => {
  cookieJar.clear()
  headerJar.clear()
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`)
})

afterAll(async () => {
  await prisma.$disconnect()
})
