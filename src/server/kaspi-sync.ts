import "server-only"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { decryptSecret } from "@/lib/secret-box"
import { formatMoney } from "@/lib/format"
import { KASPI_DELIVERY, KASPI_PAYMENT } from "@/lib/kaspi-labels"
import { appUrl, escapeHtml, sendTelegram } from "@/lib/telegram"
import { KASPI_STATES, KASPI_WINDOW_DAYS, KaspiError, acceptOrder, getOrderByCode, getOrderEntries, listOrders, type KaspiEntry, type KaspiOrderData } from "@/server/kaspi"
import { offerStock } from "@/server/kaspi-feed"

// Синхронизация заказов Kaspi: забираем заказы всех этапов за 14 дней, сохраняем копию в CRM,
// о новых заказах пишем в Telegram, при включённом автопринятии — принимаем их в Kaspi (если телефоны есть на складе).

export type SyncResult = { total: number; created: number; accepted: number; error?: string; skipped?: boolean }

const DAY = 24 * 60 * 60 * 1000
/** Не чаще раза в минуту (открытие страницы, кнопка, расписание — без лишних запросов к Kaspi) */
const MIN_INTERVAL_MS = 60_000
/** Захват синхронизации считаем брошенным (процесс упал) через 5 минут */
const CLAIM_TTL_MS = 5 * 60_000
/** Старых незавершённых заказов (за пределами окна в 14 дней) обновляем за раз не больше */
const STALE_PER_RUN = 50
/** Заказ завершён — обновлять его больше не нужно */
const FINISHED_STATUSES = ["COMPLETED", "CANCELLED", "RETURNED"]
/** Сколько хранить телефон и адрес покупателя в архивных заказах */
const PII_RETENTION_DAYS = 90

export const TOKEN_UNREADABLE = "Токен не расшифровывается — вставьте токен заново"

/**
 * Расшифровать токен магазина. Если не вышло (например, сменили AUTH_SECRET) — помечаем магазин
 * «токен не работает», чтобы в разделе Kaspi появилась кнопка «Вставить новый токен», и возвращаем null.
 */
export async function openShopToken(shop: { id: string; tokenEnc: string }): Promise<string | null> {
  try {
    return decryptSecret(shop.tokenEnc)
  } catch (e) {
    console.error("[kaspi] токен не расшифровывается", shop.id, e)
    await prisma.kaspiShop.updateMany({ where: { id: shop.id }, data: { status: "INVALID", lastError: TOKEN_UNREADABLE, lastSyncError: TOKEN_UNREADABLE } })
    return null
  }
}

const EMPTY: SyncResult = { total: 0, created: 0, accepted: 0 }

export async function syncKaspiOrders(ownerId: string, opts: { force?: boolean } = {}): Promise<SyncResult> {
  // Захватываем синхронизацию одним запросом: из двух одновременных запусков (вкладка, кнопка, расписание)
  // заказы обрабатывает только один — без двойных сообщений в Telegram и двойного автопринятия.
  const now = new Date()
  const claimedAt = now
  const { count } = await prisma.kaspiShop.updateMany({
    where: {
      ownerId,
      OR: [{ syncStartedAt: null }, { syncStartedAt: { lt: new Date(+now - CLAIM_TTL_MS) } }],
      ...(opts.force ? {} : { AND: [{ OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(+now - MIN_INTERVAL_MS) } }] }] }),
    },
    data: { syncStartedAt: claimedAt },
  })
  if (!count) {
    const exists = await prisma.kaspiShop.count({ where: { ownerId } })
    return exists ? { ...EMPTY, skipped: true } : { ...EMPTY, error: "Магазин не подключён" }
  }

  const shop = await prisma.kaspiShop.findUniqueOrThrow({ where: { ownerId }, include: { owner: { select: { telegramChatId: true } } } })
  try {
    const token = await openShopToken(shop)
    if (token === null) throw new KaspiError(TOKEN_UNREADABLE, "invalid")

    const orders: KaspiOrderData[] = []
    for (const state of KASPI_STATES) orders.push(...(await listOrders(token, state, +now)))

    const known = new Map(
      (await prisma.kaspiOrder.findMany({ where: { ownerId, kaspiId: { in: orders.map((o) => o.kaspiId) } }, select: { kaspiId: true, entries: true } })).map((o) => [
        o.kaspiId,
        o.entries as KaspiEntry[],
      ])
    )

    // остатки по артикулам прайса — только если есть что принимать автоматически
    let stock: Map<string, number> | null = null

    let created = 0
    let accepted = 0
    const fresh: (KaspiOrderData & { entries: KaspiEntry[]; noStock?: boolean })[] = []
    for (const o of orders) {
      const old = known.get(o.kaspiId)
      // товары заказа не меняются — запрашиваем только для новых
      // (заказы, загруженные до появления IMEI, перезапрашиваем один раз — нужен код позиции)
      const entries = old && old.length && old.every((e) => e.id) ? old : await getOrderEntries(token, o.entriesUrl).catch(() => old ?? [])
      let status = o.status
      let noStock = false
      if (!old && shop.autoAccept && o.state === "NEW" && o.status === "APPROVED_BY_BANK") {
        stock ??= await stockBySku(ownerId)
        if (takeStock(stock, entries)) {
          try {
            await acceptOrder(token, o)
            status = "ACCEPTED_BY_MERCHANT"
            accepted++
          } catch (e) {
            console.error("[kaspi] автопринятие", o.code, e)
          }
        } else noStock = true
      }
      const { entriesUrl, ...data } = o
      void entriesUrl
      // «передан в доставку» не снимаем: сразу после передачи Kaspi может ещё отдавать assembled=false
      const row = { ...data, assembled: data.assembled || undefined, status, entries: entries as unknown as Prisma.InputJsonValue }
      await prisma.kaspiOrder.upsert({
        where: { ownerId_kaspiId: { ownerId, kaspiId: o.kaspiId } },
        create: { ownerId, ...row },
        update: row,
      })
      if (!old) {
        created++
        if (o.state === "NEW") fresh.push({ ...o, status, entries, noStock })
      }
    }

    await refreshStaleOrders(ownerId, token, orders, now)

    await prisma.kaspiShop.update({ where: { id: shop.id }, data: { lastSyncAt: new Date(), lastSyncError: null, status: "ACTIVE", lastCheckedAt: new Date() } })
    // при первой синхронизации не засыпаем чат старыми заказами
    if (shop.lastSyncAt) for (const o of fresh) await notifyNewOrder(shop.owner.telegramChatId, o)
    return { total: orders.length, created, accepted }
  } catch (e) {
    const message = e instanceof KaspiError ? e.message : "Не удалось загрузить заказы Kaspi"
    if (!(e instanceof KaspiError)) console.error("[kaspi] синхронизация", e)
    await prisma.kaspiShop.update({
      where: { id: shop.id },
      data: { lastSyncAt: new Date(), lastSyncError: message, ...(e instanceof KaspiError && e.kind === "invalid" ? { status: "INVALID", lastError: message } : {}) },
    })
    return { ...EMPTY, error: message }
  } finally {
    // отпускаем только свой захват
    await prisma.kaspiShop.updateMany({ where: { id: shop.id, syncStartedAt: claimedAt }, data: { syncStartedAt: null } })
  }
}

/** Сколько телефонов «В наличии» под каждый артикул прайса — тем же подсчётом, что и в прайс-листе для Kaspi */
async function stockBySku(ownerId: string) {
  const offers = await prisma.kaspiOffer.findMany({ where: { ownerId }, select: { id: true, sku: true, model: true, memoryGb: true, color: true } })
  const byId = await offerStock(ownerId, offers)
  return new Map(offers.map((o) => [o.sku, byId.get(o.id) ?? 0]))
}

/**
 * Хватает ли склада на все позиции заказа. Позиция без артикула или с артикулом, которого нет в прайсе, —
 * решение за продавцом. Если хватает — списываем из остатка, чтобы следующий заказ в этой же синхронизации не занял те же телефоны.
 */
function takeStock(stock: Map<string, number>, entries: KaspiEntry[]) {
  if (!entries.length) return false
  const need = new Map<string, number>()
  for (const e of entries) {
    const sku = e.code?.trim()
    if (!sku || !stock.has(sku)) return false
    need.set(sku, (need.get(sku) ?? 0) + e.quantity)
  }
  for (const [sku, n] of need) if ((stock.get(sku) ?? 0) < n) return false
  for (const [sku, n] of need) stock.set(sku, stock.get(sku)! - n)
  return true
}

/**
 * Заказы старше окна в 14 дней Kaspi в списках не отдаёт — незавершённые (долгая доставка, возврат)
 * перестали бы обновляться. Запрашиваем их по номеру, по очереди: давно не обновлявшиеся — первыми.
 */
async function refreshStaleOrders(ownerId: string, token: string, inWindow: KaspiOrderData[], now: Date) {
  const stale = await prisma.kaspiOrder.findMany({
    where: {
      ownerId,
      state: { not: "ARCHIVE" },
      status: { notIn: FINISHED_STATUSES },
      orderedAt: { lt: new Date(+now - KASPI_WINDOW_DAYS * DAY) },
      kaspiId: { notIn: inWindow.map((o) => o.kaspiId) },
    },
    orderBy: { updatedAt: "asc" },
    take: STALE_PER_RUN,
    select: { id: true, code: true, state: true },
  })
  for (const s of stale) {
    let o: KaspiOrderData | null
    try {
      o = await getOrderByCode(token, s.code, s.state)
    } catch (e) {
      // токен не принят — это ошибка всей синхронизации; прочие сбои по одному заказу не мешают остальным
      if (e instanceof KaspiError && e.kind === "invalid") throw e
      console.error("[kaspi] старый заказ", s.code, e)
      continue
    }
    if (!o) {
      // Kaspi заказ не нашёл — отодвигаем в конец очереди
      await prisma.kaspiOrder.update({ where: { id: s.id }, data: { updatedAt: new Date() } })
      continue
    }
    const { entriesUrl, kaspiId, ...data } = o
    void entriesUrl
    void kaspiId
    await prisma.kaspiOrder.update({ where: { id: s.id }, data: { ...data, assembled: data.assembled || undefined } })
  }
}

async function notifyNewOrder(chatId: string | null, o: KaspiOrderData & { entries: KaspiEntry[]; noStock?: boolean }) {
  const st = o.status
  const items = o.entries.map((e) => `• ${escapeHtml(e.name)}${e.quantity > 1 ? ` × ${e.quantity}` : ""}`).join("\n")
  await sendTelegram(
    chatId,
    [
      `🛒 <b>Новый заказ Kaspi №${escapeHtml(o.code)}</b>${st === "ACCEPTED_BY_MERCHANT" ? " · принят автоматически" : ""}`,
      items,
      `<b>${formatMoney(o.totalPrice)}</b> · ${escapeHtml(KASPI_PAYMENT[o.paymentMode ?? ""] ?? o.paymentMode ?? "")} · ${escapeHtml(KASPI_DELIVERY[o.deliveryMode ?? ""] ?? o.deliveryMode ?? "")}`,
      o.customerName ? `Покупатель: ${escapeHtml(o.customerName)}` : null,
      o.noStock ? "Не принят автоматически: товара нет на складе CRM или он не найден в прайс-листе — решите вручную." : null,
    ]
      .filter(Boolean)
      .join("\n"),
    { url: appUrl(`/kaspi?tab=NEW`), text: st === "ACCEPTED_BY_MERCHANT" ? "Открыть в CRM" : "Принять в CRM" }
  )
}

/**
 * Телефон и адрес покупателя в архивных заказах храним 90 дней: дальше они не нужны, а утечка была бы лишней.
 * Номер заказа, суммы и имя покупателя остаются.
 */
export async function purgeOldKaspiPii(now = new Date()) {
  const { count } = await prisma.kaspiOrder.updateMany({
    where: {
      state: "ARCHIVE",
      orderedAt: { lt: new Date(+now - PII_RETENTION_DAYS * DAY) },
      OR: [{ customerPhone: { not: null } }, { address: { not: null } }],
    },
    data: { customerPhone: null, address: null },
  })
  return count
}

/** Синхронизация всех работающих магазинов (по расписанию). Сбой одного магазина не мешает остальным */
export async function syncAllKaspiShops() {
  const shops = await prisma.kaspiShop.findMany({ where: { status: "ACTIVE" }, select: { ownerId: true } })
  const results: (SyncResult & { ownerId: string })[] = []
  for (const s of shops) {
    try {
      results.push({ ownerId: s.ownerId, ...(await syncKaspiOrders(s.ownerId, { force: true })) })
    } catch (e) {
      console.error("[kaspi] синхронизация магазина", s.ownerId, e)
      results.push({ ownerId: s.ownerId, ...EMPTY, error: "Не удалось синхронизировать магазин" })
    }
  }
  try {
    await purgeOldKaspiPii()
  } catch (e) {
    console.error("[kaspi] очистка данных покупателей", e)
  }
  return results
}
