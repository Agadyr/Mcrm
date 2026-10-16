import "server-only"
import { timingSafeEqual } from "node:crypto"
import type { NextRequest } from "next/server"

/** Запрос по расписанию подписан секретом CRON_SECRET: `Authorization: Bearer <секрет>`. Без CRON_SECRET — закрыто. */
export function isCronAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const got = Buffer.from(req.headers.get("authorization") ?? "")
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && timingSafeEqual(got, want)
}
