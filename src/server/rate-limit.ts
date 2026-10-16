import "server-only"
import { headers } from "next/headers"
import { prisma } from "@/lib/db"

// Ограничение частоты попыток (подбор пароля, спам заявками). Счётчики в таблице RateLimit,
// поэтому работают и при нескольких экземплярах сервера.

export type Limit = {
  max: number // сколько попыток допускается в окне
  windowMs: number // окно подсчёта
  blockMs: number // на сколько закрыть после max попыток
}

/** IP клиента из заголовков прокси. x-real-ip и последний адрес x-forwarded-for ставит сам прокси —
 *  первый адрес x-forwarded-for клиент может подделать. */
export async function getClientIp(): Promise<string> {
  const h = await headers()
  const real = h.get("x-real-ip")?.trim()
  if (real) return real
  const forwarded = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean)
  return forwarded?.at(-1) || "unknown"
}

/** Сколько минут ещё закрыто (0 — можно) */
export async function blockedMinutes(key: string): Promise<number> {
  const row = await prisma.rateLimit.findUnique({ where: { key }, select: { blockedUntil: true } })
  const left = row?.blockedUntil ? row.blockedUntil.getTime() - Date.now() : 0
  return left > 0 ? Math.ceil(left / 60_000) : 0
}

/** Засчитать попытку. true — лимит исчерпан, ключ закрыт на blockMs. */
export async function hitLimit(key: string, limit: Limit): Promise<boolean> {
  const now = new Date()
  const windowFrom = new Date(now.getTime() - limit.windowMs)
  // атомарно: параллельные запросы не потеряют попытки
  const [row] = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart") VALUES (${key}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" < ${windowFrom} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" < ${windowFrom} THEN ${now} ELSE "RateLimit"."windowStart" END
    RETURNING "count"`
  if (row.count < limit.max) return false
  await prisma.rateLimit.update({
    where: { key },
    data: { count: 0, windowStart: now, blockedUntil: new Date(now.getTime() + limit.blockMs) },
  })
  return true
}

/** Сбросить счётчик (успешный вход) и заодно убрать давно устаревшие записи */
export async function resetLimit(key: string) {
  const dayAgo = new Date(Date.now() - 86_400_000)
  await prisma.rateLimit.deleteMany({
    where: {
      OR: [{ key }, { windowStart: { lt: dayAgo }, OR: [{ blockedUntil: null }, { blockedUntil: { lt: new Date() } }] }],
    },
  })
}
