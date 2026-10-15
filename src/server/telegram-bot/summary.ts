import "server-only"
import { prisma } from "@/lib/db"
import { resolvePeriod } from "@/lib/analytics-period"
import { todayYmd, ymdToDate } from "@/lib/dates"
import { formatDate, formatMoney, formatNumber } from "@/lib/format"
import { getAnalytics } from "@/server/analytics"
import { crmButton, send } from "./ui"
import type { Ctx } from "./types"

// «📊 Сводка»: сегодня, этот месяц и что происходит сейчас — те же цифры, что на странице «Аналитика»

export async function sendSummary(ctx: Ctx) {
  const id = ctx.user.id
  const today = todayYmd()
  const [day, month, stock] = await Promise.all([
    getAnalytics(id, resolvePeriod({ from: today, to: today })),
    getAnalytics(id, resolvePeriod({ range: "month" })),
    prisma.phone.aggregate({ where: { ownerId: id, status: { in: ["IN_STOCK", "RESERVED"] } }, _count: true, _sum: { purchasePrice: true } }),
  ])
  const d = day.current
  const m = month.current
  const now = month.now
  const lines = [
    `📊 <b>Сводка · ${formatDate(ymdToDate(today))}</b>`,
    "",
    "<b>Сегодня</b>",
    d.soldCount ? `Продано ${formatNumber(d.soldCount)} шт. на ${formatMoney(d.revenue)}\nПрибыль <b>${formatMoney(d.profit)}</b>` : "Продаж пока нет",
    "",
    "<b>Этот месяц</b>",
    `Продано ${formatNumber(m.soldCount)} шт. на ${formatMoney(m.revenue)}`,
    `Прибыль ${formatMoney(m.profit)} · чистая <b>${formatMoney(m.netProfit)}</b>`,
    `Закуплено ${formatNumber(m.purchasedCount)} шт. на ${formatMoney(m.purchasedSum)}`,
    "",
    "<b>Сейчас</b>",
    `📦 На складе: ${formatNumber(stock._count)} шт. на ${formatMoney(stock._sum.purchasePrice ?? 0)}`,
    `🛡 На верификации: ${formatNumber(now.onVerification)} шт.`,
    `💸 Покупатели должны: ${formatMoney(now.buyersDebt)}${now.buyersOverdue ? ` · ⚠️ просрочено ${now.buyersOverdue}` : ""}`,
    `Долг верификаторам: ${formatMoney(now.debtToAgents)} · людям: ${formatMoney(now.debtToPeople)}`,
  ]
  await send(ctx.chatId, lines.join("\n"), [crmButton("/analytics?range=month", "Открыть аналитику")])
}
