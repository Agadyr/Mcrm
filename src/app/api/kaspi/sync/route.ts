import { timingSafeEqual } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { syncAllKaspiShops } from "@/server/kaspi-sync"

// Синхронизация заказов Kaspi по расписанию (раз в несколько минут): без неё заказы подтягиваются, только когда
// кто-то открыл раздел. Запрос подписывается секретом CRON_SECRET: `Authorization: Bearer <секрет>`
// (Vercel Cron и обычный cron/curl). Без CRON_SECRET адрес закрыт.

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const got = Buffer.from(req.headers.get("authorization") ?? "")
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && timingSafeEqual(got, want)
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false }, { status: 401 })
  const results = await syncAllKaspiShops()
  return NextResponse.json({ ok: true, shops: results.length, created: results.reduce((a, r) => a + r.created, 0), errors: results.filter((r) => r.error).length })
}
