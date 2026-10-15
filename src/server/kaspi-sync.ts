import "server-only"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { decryptSecret } from "@/lib/secret-box"
import { formatMoney } from "@/lib/format"
import { KASPI_DELIVERY, KASPI_PAYMENT } from "@/lib/kaspi-labels"
import { appUrl, escapeHtml, sendTelegram } from "@/lib/telegram"
import { KASPI_STATES, KaspiError, acceptOrder, getOrderEntries, listOrders, type KaspiEntry, type KaspiOrderData } from "@/server/kaspi"

// Синхронизация заказов Kaspi: забираем заказы всех этапов за 14 дней, сохраняем копию в CRM,
// о новых заказах пишем в Telegram, при включённом автопринятии — принимаем их в Kaspi.

export type SyncResult = { total: number; created: number; accepted: number; error?: string }

/** Не чаще раза в минуту (открытие страницы, кнопка, расписание — без лишних запросов к Kaspi) */
const MIN_INTERVAL_MS = 60_000

export async function syncKaspiOrders(ownerId: string, opts: { force?: boolean } = {}): Promise<SyncResult> {
  const shop = await prisma.kaspiShop.findUnique({ where: { ownerId }, include: { owner: { select: { telegramChatId: true } } } })
  if (!shop) return { total: 0, created: 0, accepted: 0, error: "Магазин не подключён" }
  if (!opts.force && shop.lastSyncAt && Date.now() - +shop.lastSyncAt < MIN_INTERVAL_MS) return { total: 0, created: 0, accepted: 0 }

  const token = decryptSecret(shop.tokenEnc)
  try {
    const orders: KaspiOrderData[] = []
    for (const state of KASPI_STATES) orders.push(...(await listOrders(token, state)))

    const known = new Map(
      (await prisma.kaspiOrder.findMany({ where: { ownerId, kaspiId: { in: orders.map((o) => o.kaspiId) } }, select: { kaspiId: true, entries: true } })).map((o) => [
        o.kaspiId,
        o.entries as KaspiEntry[],
      ])
    )

    let created = 0
    let accepted = 0
    const fresh: (KaspiOrderData & { entries: KaspiEntry[] })[] = []
    for (const o of orders) {
      const old = known.get(o.kaspiId)
      // товары заказа не меняются — запрашиваем только для новых
      // (заказы, загруженные до появления IMEI, перезапрашиваем один раз — нужен код позиции)
      const entries = old && old.length && old.every((e) => e.id) ? old : await getOrderEntries(token, o.entriesUrl).catch(() => old ?? [])
      let status = o.status
      if (!old && shop.autoAccept && o.state === "NEW" && o.status === "APPROVED_BY_BANK") {
        try {
          await acceptOrder(token, o)
          status = "ACCEPTED_BY_MERCHANT"
          accepted++
        } catch (e) {
          console.error("[kaspi] автопринятие", o.code, e)
        }
      }
      const { entriesUrl, ...data } = o
      void entriesUrl
      const row = { ...data, status, entries: entries as unknown as Prisma.InputJsonValue }
      await prisma.kaspiOrder.upsert({
        where: { ownerId_kaspiId: { ownerId, kaspiId: o.kaspiId } },
        create: { ownerId, ...row },
        update: row,
      })
      if (!old) {
        created++
        if (o.state === "NEW") fresh.push({ ...o, status, entries })
      }
    }

    await prisma.kaspiShop.update({ where: { id: shop.id }, data: { lastSyncAt: new Date(), lastSyncError: null, status: "ACTIVE", lastCheckedAt: new Date() } })
    // при первой синхронизации не засыпаем чат старыми заказами
    if (shop.lastSyncAt) for (const o of fresh) await notifyNewOrder(shop.owner.telegramChatId, o)
    return { total: orders.length, created, accepted }
  } catch (e) {
    const message = e instanceof KaspiError ? e.message : "Не удалось загрузить заказы Kaspi"
    if (!(e instanceof KaspiError)) console.error("[kaspi] синхронизация", e)
    await prisma.kaspiShop.update({
      where: { id: shop.id },
      data: { lastSyncAt: new Date(), lastSyncError: message, ...(e instanceof KaspiError && e.kind === "invalid" ? { status: "INVALID" } : {}) },
    })
    return { total: 0, created: 0, accepted: 0, error: message }
  }
}

async function notifyNewOrder(chatId: string | null, o: KaspiOrderData & { entries: KaspiEntry[] }) {
  const st = o.status
  const items = o.entries.map((e) => `• ${escapeHtml(e.name)}${e.quantity > 1 ? ` × ${e.quantity}` : ""}`).join("\n")
  await sendTelegram(
    chatId,
    [
      `🛒 <b>Новый заказ Kaspi №${escapeHtml(o.code)}</b>${st === "ACCEPTED_BY_MERCHANT" ? " · принят автоматически" : ""}`,
      items,
      `<b>${formatMoney(o.totalPrice)}</b> · ${escapeHtml(KASPI_PAYMENT[o.paymentMode ?? ""] ?? o.paymentMode ?? "")} · ${escapeHtml(KASPI_DELIVERY[o.deliveryMode ?? ""] ?? o.deliveryMode ?? "")}`,
      o.customerName ? `Покупатель: ${escapeHtml(o.customerName)}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    { url: appUrl(`/kaspi?tab=NEW`), text: st === "ACCEPTED_BY_MERCHANT" ? "Открыть в CRM" : "Принять в CRM" }
  )
}

/** Синхронизация всех работающих магазинов (по расписанию) */
export async function syncAllKaspiShops() {
  const shops = await prisma.kaspiShop.findMany({ where: { status: "ACTIVE" }, select: { ownerId: true } })
  const results: (SyncResult & { ownerId: string })[] = []
  for (const s of shops) results.push({ ownerId: s.ownerId, ...(await syncKaspiOrders(s.ownerId, { force: true })) })
  return results
}
