import { NextResponse, type NextRequest } from "next/server"
import { isCronAuthorized } from "@/server/cron-auth"
import { sendMorningReminders } from "@/server/reminders"

// Утренние напоминания в Telegram (просроченные долги, долгие верификации). Запускать раз в день утром,
// например в 9:00 по Алматы (04:00 UTC). Повторный запуск в тот же день ничего не отправит.
// Запрос подписывается секретом CRON_SECRET: `Authorization: Bearer <секрет>`, как /api/kaspi/sync.

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 })
  const results = await sendMorningReminders()
  return NextResponse.json({
    ok: true,
    users: results.length,
    sent: results.filter((r) => r.sent).length,
    failed: results.filter((r) => r.reason === "failed").length,
  })
}
