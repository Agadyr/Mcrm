import "server-only"
import { prisma } from "@/lib/db"
import { addDays, todayDate } from "@/lib/dates"
import { formatMoney } from "@/lib/format"
import { ACTIVE_VERIFICATION_STATUSES } from "@/lib/labels"
import { appUrl, sendTelegram, type TelegramLink } from "@/lib/telegram"
import { overdueWhere } from "@/server/sale-filters"

// Утреннее напоминание компании в Telegram: просроченные долги покупателей и телефоны, которые слишком долго
// на верификации. Запускается по расписанию (/api/reminders/morning). Если напоминать не о чем — не пишем.
// Не чаще раза в день (по Алматы): время отправки запоминаем в User.lastReminderAt.

/** «Долго на верификации» — с этого количества дней */
export const LONG_VERIFICATION_DAYS = 14

/** Начало сегодняшнего дня в Алматы как момент времени. Алматы — UTC+5 круглый год (без перехода на летнее время). */
function almatyDayStart(): Date {
  return new Date(todayDate().getTime() - 5 * 3_600_000)
}

export type MorningReport = {
  overdueCount: number
  overdueSum: number
  longVerifications: number
}

/** Что сегодня требует внимания компании */
export async function morningReport(ownerId: string): Promise<MorningReport> {
  const [overdue, longVerifications] = await Promise.all([
    prisma.sale.aggregate({ where: overdueWhere(ownerId), _sum: { salePrice: true, paidAmount: true }, _count: true }),
    prisma.verification.count({
      where: {
        ownerId,
        status: { in: ACTIVE_VERIFICATION_STATUSES },
        handedAt: { lte: addDays(todayDate(), -LONG_VERIFICATION_DAYS) },
      },
    }),
  ])
  return {
    overdueCount: overdue._count,
    overdueSum: (overdue._sum.salePrice ?? 0) - (overdue._sum.paidAmount ?? 0),
    longVerifications,
  }
}

/** Текст и кнопки напоминания; null — напоминать не о чем */
export function morningMessage(r: MorningReport): { html: string; links: TelegramLink[] } | null {
  const lines: string[] = []
  const links: TelegramLink[] = []
  if (r.overdueCount > 0) {
    lines.push(`💸 Просроченные долги: <b>${r.overdueCount}</b> на <b>${formatMoney(r.overdueSum)}</b>`)
    links.push({ url: appUrl("/sales?state=overdue"), text: "Просроченные долги" })
  }
  if (r.longVerifications > 0) {
    lines.push(`🛡 На верификации дольше ${LONG_VERIFICATION_DAYS} дней: <b>${r.longVerifications}</b>`)
    links.push({ url: appUrl("/verifications?status=active"), text: "Верификации в работе" })
  }
  if (!lines.length) return null
  return { html: `☀️ <b>Доброе утро! Что требует внимания</b>\n\n${lines.join("\n")}`, links }
}

export type ReminderResult = { userId: string; sent: boolean; reason?: "nothing" | "already" | "failed" }

/** Напоминание одному пользователю. Сначала «занимаем» сегодняшний день — два одновременных запуска не отправят дважды. */
export async function sendMorningReminder(user: { id: string; telegramChatId: string | null; lastReminderAt: Date | null }): Promise<ReminderResult> {
  const message = morningMessage(await morningReport(user.id))
  if (!message) return { userId: user.id, sent: false, reason: "nothing" }

  const claimed = await prisma.user.updateMany({
    where: { id: user.id, OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: almatyDayStart() } }] },
    data: { lastReminderAt: new Date() },
  })
  if (!claimed.count) return { userId: user.id, sent: false, reason: "already" }

  const ok = await sendTelegram(user.telegramChatId, message.html, message.links)
  if (!ok) {
    // не дошло — вернём прежнее время, чтобы следующий запуск попробовал снова
    await prisma.user.update({ where: { id: user.id }, data: { lastReminderAt: user.lastReminderAt } })
    return { userId: user.id, sent: false, reason: "failed" }
  }
  return { userId: user.id, sent: true }
}

/** Утренние напоминания всем компаниям с подключённым Telegram, у которых они не выключены */
export async function sendMorningReminders(): Promise<ReminderResult[]> {
  const users = await prisma.user.findMany({
    where: {
      role: { in: ["USER", "ADMIN"] },
      isActive: true,
      morningReminder: true,
      telegramChatId: { not: null },
      OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: almatyDayStart() } }],
    },
    select: { id: true, telegramChatId: true, lastReminderAt: true },
  })
  const results: ReminderResult[] = []
  for (const u of users) {
    try {
      results.push(await sendMorningReminder(u))
    } catch (e) {
      console.error("[reminders]", e)
      results.push({ userId: u.id, sent: false, reason: "failed" })
    }
  }
  return results
}
