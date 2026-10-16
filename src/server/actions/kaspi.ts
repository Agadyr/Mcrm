"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/auth"
import { encryptSecret } from "@/lib/secret-box"
import { fieldErrorsOf, optText, type ActionResult } from "@/lib/validators/common"
import { todayYmd } from "@/lib/dates"
import { formatDate, formatMoney } from "@/lib/format"
import { PAYMENT_METHOD_LABEL } from "@/lib/labels"
import { KASPI_CANCEL_REASONS, type KaspiCancelReason } from "@/lib/kaspi-labels"
import { MAX_ENTRY_QUANTITY, entryQuantity, entryTotal, phoneEntries, unitPrices } from "@/lib/kaspi-order"
import { saleSchema } from "@/lib/validators/phone"
import { KaspiError, acceptOrder, assembleOrder, cancelOrder, checkKaspiToken, completeOrder, sendImei, tokenHint, type KaspiEntry } from "@/server/kaspi"
import { TOKEN_UNREADABLE, openShopToken, syncKaspiOrders } from "@/server/kaspi-sync"
import { findOrCreateCustomer } from "@/server/customers"
import { logEvent } from "@/server/history"
import { saleCreateData } from "@/server/sale-data"

// Подключение магазина Kaspi. Токен проверяется у Kaspi до сохранения и хранится зашифрованным.

const connectSchema = z.object({
  token: z
    .string()
    .transform((v) => v.replace(/\s+/g, ""))
    .pipe(z.string().min(16, "Токен слишком короткий — скопируйте его целиком").max(512, "Это не похоже на токен")),
  shopName: optText(100),
})

const NO_SHOP: ActionResult<never> = { ok: false, error: "Kaspi магазин подключают компании" }

function refresh() {
  revalidatePath("/", "layout")
}

export async function connectKaspiAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser()
  if (user.role === "VERIFIER") return NO_SHOP
  const parsed = connectSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Проверьте поля", fieldErrors: fieldErrorsOf(parsed.error) }
  const { token, shopName } = parsed.data

  const check = await checkKaspiToken(token)
  if (!check.ok) return { ok: false, error: check.message, fieldErrors: check.reason === "invalid" ? { token: check.message } : undefined }

  const data = { tokenEnc: encryptSecret(token), tokenHint: tokenHint(token), shopName, status: "ACTIVE", lastError: null, lastSyncError: null, lastCheckedAt: new Date() }
  await prisma.kaspiShop.upsert({ where: { ownerId: user.id }, create: { ownerId: user.id, ...data }, update: { ...data, connectedAt: new Date() } })
  refresh()
  return { ok: true, data: undefined }
}

/** Проверить, что сохранённый токен всё ещё работает */
export async function recheckKaspiAction(): Promise<ActionResult<{ ok: boolean; message?: string }>> {
  const user = await requireUser()
  const shop = await prisma.kaspiShop.findUnique({ where: { ownerId: user.id } })
  if (!shop) return { ok: false, error: "Магазин не подключён" }
  const token = await openShopToken(shop)
  if (token === null) {
    refresh()
    return { ok: true, data: { ok: false, message: TOKEN_UNREADABLE } }
  }
  const check = await checkKaspiToken(token)
  // «Kaspi недоступен» — не повод считать токен плохим
  const status = check.ok ? "ACTIVE" : check.reason === "invalid" ? "INVALID" : shop.status
  await prisma.kaspiShop.update({
    where: { id: shop.id },
    data: { status, lastCheckedAt: new Date(), lastError: check.ok ? null : check.message },
  })
  refresh()
  return { ok: true, data: check.ok ? { ok: true } : { ok: false, message: check.message } }
}

export async function disconnectKaspiAction(): Promise<ActionResult> {
  const user = await requireUser()
  await prisma.kaspiShop.deleteMany({ where: { ownerId: user.id } })
  refresh()
  return { ok: true, data: undefined }
}

// ─── Заказы ──────────────────────────────────────────────────────

async function shopOf(userId: string) {
  const shop = await prisma.kaspiShop.findUnique({ where: { ownerId: userId } })
  if (!shop) return null
  const token = await openShopToken(shop)
  return {
    shop,
    // токен не расшифровался — понятная ошибка всплывёт при обращении к Kaspi (внутри try у каждого действия)
    get token(): string {
      if (token === null) throw new KaspiError(TOKEN_UNREADABLE, "invalid")
      return token
    },
  }
}

/** Обновить заказы из Kaspi */
export async function syncKaspiAction(): Promise<ActionResult<{ created: number; total: number }>> {
  const user = await requireUser()
  if (user.role === "VERIFIER") return NO_SHOP
  const r = await syncKaspiOrders(user.id, { force: true })
  refresh()
  return r.error ? { ok: false, error: r.error } : { ok: true, data: { created: r.created, total: r.total } }
}

export async function setKaspiAutoAcceptAction(enabled: boolean): Promise<ActionResult> {
  const user = await requireUser()
  const { count } = await prisma.kaspiShop.updateMany({ where: { ownerId: user.id }, data: { autoAccept: !!enabled } })
  if (!count) return { ok: false, error: "Магазин не подключён" }
  refresh()
  return { ok: true, data: undefined }
}

/** Принять новый заказ: сообщаем Kaspi, что товар есть */
export async function acceptKaspiOrderAction(orderId: string): Promise<ActionResult> {
  const user = await requireUser()
  const ctx = await shopOf(user.id)
  const order = await prisma.kaspiOrder.findFirst({ where: { id: orderId, ownerId: user.id } })
  if (!ctx || !order) return { ok: false, error: "Заказ не найден" }
  if (order.state !== "NEW") return { ok: false, error: "Этот заказ уже нельзя принять" }
  try {
    await acceptOrder(ctx.token, { kaspiId: order.kaspiId, code: order.code })
  } catch (e) {
    return { ok: false, error: e instanceof KaspiError ? e.message : "Не удалось принять заказ" }
  }
  await prisma.kaspiOrder.update({ where: { id: order.id }, data: { status: "ACCEPTED_BY_MERCHANT" } })
  refresh()
  return { ok: true, data: undefined }
}

const cancelSchema = z.object({
  reason: z.enum(Object.keys(KASPI_CANCEL_REASONS) as [KaspiCancelReason, ...KaspiCancelReason[]], { message: "Выберите причину" }),
  comment: optText(200),
})

export async function cancelKaspiOrderAction(orderId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = cancelSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Выберите причину отмены", fieldErrors: fieldErrorsOf(parsed.error) }
  const ctx = await shopOf(user.id)
  const order = await prisma.kaspiOrder.findFirst({ where: { id: orderId, ownerId: user.id }, include: { _count: { select: { sales: { where: { cancelledAt: null } } } } } })
  if (!ctx || !order) return { ok: false, error: "Заказ не найден" }
  if (order._count.sales) return { ok: false, error: "По заказу уже оформлена продажа — сначала отмените её в «Продажах»" }
  if (order.status !== "APPROVED_BY_BANK" && order.status !== "ACCEPTED_BY_MERCHANT") return { ok: false, error: "Этот заказ уже нельзя отменить" }
  try {
    await cancelOrder(ctx.token, { kaspiId: order.kaspiId, code: order.code }, parsed.data.reason, parsed.data.comment ?? undefined)
  } catch (e) {
    return { ok: false, error: e instanceof KaspiError ? e.message : "Не удалось отменить заказ" }
  }
  await prisma.kaspiOrder.update({ where: { id: order.id }, data: { status: "CANCELLED", state: "ARCHIVE" } })
  refresh()
  return { ok: true, data: undefined }
}

const imeisOf = (p: { imei1: string; imei2: string | null }) => [p.imei1, p.imei2].filter((v): v is string => !!v)

/**
 * Отправить в Kaspi IMEI всех телефонов из продаж по заказу: по одному запросу на позицию,
 * в запросе — столько телефонов, сколько штук в позиции. Повторная отправка шлёт их все заново.
 */
async function pushImei(userId: string, orderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const order = await prisma.kaspiOrder.findFirst({
    where: { id: orderId, ownerId: userId },
    include: { sales: { where: { cancelledAt: null }, orderBy: { createdAt: "asc" }, include: { phone: { select: { imei1: true, imei2: true } } } } },
  })
  const ctx = await shopOf(userId)
  if (!order || !ctx) return { ok: false, error: "Заказ не найден" }
  if (!order.sales.length) return { ok: false, error: "Сначала оформите продажу — IMEI берётся из проданных телефонов" }
  const entries = phoneEntries(order.entries as unknown as KaspiEntry[], order.imeiRequired)
  if (!entries.length) return { ok: false, error: "Kaspi не прислал позицию заказа — нажмите «Обновить» и попробуйте снова" }

  // продажи, оформленные до разбивки по позициям, относятся к единственной позиции заказа
  const devices = new Map<string, string[][]>()
  for (const s of order.sales) {
    const entryId = s.kaspiEntryId ?? (entries.length === 1 ? entries[0].id : null)
    if (entryId) devices.set(entryId, [...(devices.get(entryId) ?? []), imeisOf(s.phone)])
  }
  for (const e of entries) {
    const n = devices.get(e.id)?.length ?? 0
    if (n !== entryQuantity(e))
      return { ok: false, error: `«${e.name}»: в заказе ${entryQuantity(e)} шт., а продано ${n}. Отмените продажи по заказу в «Продажах» и оформите продажу заново` }
  }
  try {
    for (const e of entries) await sendImei(ctx.token, e.id, devices.get(e.id)!)
  } catch (e) {
    return { ok: false, error: e instanceof KaspiError ? e.message : "Не удалось отправить IMEI в Kaspi" }
  }
  await prisma.kaspiOrder.update({ where: { id: order.id }, data: { imeiSentAt: new Date() } })
  return { ok: true }
}

/** Выбор телефонов: { id позиции: [id телефонов] } — по телефону на каждую штуку. Строка — один телефон на заказ из одного телефона. */
const picksSchema = z.union([z.string().min(1), z.record(z.string(), z.array(z.string().min(1)).max(MAX_ENTRY_QUANTITY))])

class SaleConflict extends Error {}

/**
 * Оформить продажу по заказу: на каждую штуку позиции с IMEI выбираете свой телефон со склада. Создаётся продажа на каждый
 * телефон (Kaspi, цена позиции делится по штукам, покупатель из заказа) — все вместе или ни одной.
 * Затем IMEI всех телефонов уходят в Kaspi (обязательно для телефонов с 25.05.2025); если Kaspi не принял — продажи остаются,
 * отправить можно ещё раз кнопкой «Отправить IMEI».
 */
export async function createSaleFromKaspiOrderAction(
  orderId: string,
  input: unknown
): Promise<ActionResult<{ saleIds: string[]; imei: { ok: boolean; error?: string } }>> {
  const user = await requireUser()
  if (user.role === "VERIFIER") return NO_SHOP
  const picksParsed = picksSchema.safeParse(input)
  if (!picksParsed.success) return { ok: false, error: "Выберите телефоны со склада" }
  const order = await prisma.kaspiOrder.findFirst({ where: { id: orderId, ownerId: user.id }, include: { _count: { select: { sales: { where: { cancelledAt: null } } } } } })
  if (!order) return { ok: false, error: "Заказ не найден" }
  if (order._count.sales) return { ok: false, error: "Продажа по этому заказу уже оформлена" }
  if (order.status === "CANCELLED") return { ok: false, error: "Заказ отменён" }
  const allEntries = order.entries as unknown as KaspiEntry[]
  if (!order.imeiRequired && !allEntries.some((e) => e.imeiRequired)) return { ok: false, error: "В заказе нет телефона — продажа со склада CRM не нужна" }
  const entries = phoneEntries(allEntries, order.imeiRequired)
  if (!entries.length || allEntries.some((e) => e.imeiRequired && !e.id)) return { ok: false, error: "Kaspi не прислал позицию заказа — нажмите «Обновить» и попробуйте снова" }

  let picks = picksParsed.data
  if (typeof picks === "string") {
    if (entries.length !== 1 || entryQuantity(entries[0]) !== 1) return { ok: false, error: "В заказе несколько телефонов — выберите телефон на каждую штуку" }
    picks = { [entries[0].id]: [picks] }
  }

  // телефоны по позициям: ровно столько, сколько штук, и все разные
  const plan: { entry: (typeof entries)[number]; phoneId: string; price: number; unit: number; units: number }[] = []
  for (const e of entries) {
    const qty = entryQuantity(e)
    const ids = picks[e.id] ?? []
    if (ids.length !== qty) return { ok: false, error: `«${e.name}»: выберите ${qty} шт. — по телефону на каждую` }
    // сумма позиции из Kaspi; если её нет, а позиция одна — сумма заказа
    const total = entryTotal(e) || (entries.length === 1 ? order.totalPrice : 0)
    unitPrices(total, qty).forEach((price, i) => plan.push({ entry: e, phoneId: ids[i], price, unit: i + 1, units: qty }))
  }
  const phoneIds = plan.map((p) => p.phoneId)
  if (new Set(phoneIds).size !== phoneIds.length) return { ok: false, error: "Один и тот же телефон выбран дважды — на каждую штуку нужен свой" }
  const phones = await prisma.phone.findMany({ where: { id: { in: phoneIds }, ownerId: user.id } })
  if (phones.length !== phoneIds.length) return { ok: false, error: "Телефон не найден" }
  const sold = phones.find((p) => p.status === "SOLD")
  if (sold) return { ok: false, error: `Телефон ${sold.model} (…${sold.imei1.slice(-4)}) уже продан` }
  const byId = new Map(phones.map((p) => [p.id, p]))

  const soldAt = todayYmd()
  let saleIds: string[]
  try {
    saleIds = await prisma.$transaction(async (tx) => {
      // двойной клик / вторая вкладка: продажу по заказу уже оформили
      if (await tx.sale.count({ where: { kaspiOrderId: order.id, cancelledAt: null } })) throw new SaleConflict("Продажа по этому заказу уже оформлена")
      const ids: string[] = []
      // покупатель Kaspi с номером попадает в базу клиентов (или находится там)
      const customerId = await findOrCreateCustomer(tx, user.id, order.customerName, order.customerPhone)
      for (const p of plan) {
        const phone = byId.get(p.phoneId)!
        const d = saleSchema.parse({
          salePrice: p.price,
          soldAt,
          buyerName: order.customerName,
          buyerPhone: order.customerPhone,
          paymentMethod: "KASPI",
          note: `Заказ Kaspi №${order.code}` + (plan.length > 1 ? ` · ${p.entry.name}${p.units > 1 ? `, ${p.unit} из ${p.units}` : ""}` : ""),
        })
        // телефон могли продать параллельно — тогда откатываем все продажи заказа
        const { count } = await tx.phone.updateMany({ where: { id: phone.id, status: { not: "SOLD" } }, data: { status: "SOLD" } })
        if (!count) throw new SaleConflict(`Телефон ${phone.model} (…${phone.imei1.slice(-4)}) уже продан`)
        const sale = await tx.sale.create({ data: { ...saleCreateData(d), phoneId: phone.id, kaspiOrderId: order.id, kaspiEntryId: p.entry.id, customerId }, select: { id: true } })
        await logEvent(
          tx,
          phone.id,
          "SOLD",
          `Продан ${formatDate(d.soldAt)} за ${formatMoney(d.salePrice)} (${PAYMENT_METHOD_LABEL.KASPI}) по заказу Kaspi №${order.code}` +
            (d.buyerName ? `, покупатель: ${d.buyerName}` : "") +
            `. Прибыль ${formatMoney(d.salePrice - phone.purchasePrice)}`,
          user.id
        )
        ids.push(sale.id)
      }
      return ids
    })
  } catch (e) {
    if (e instanceof SaleConflict) return { ok: false, error: e.message }
    throw e
  }
  // продажи уже сохранены; если Kaspi не принял IMEI — покажем, отправить можно ещё раз
  const imei = await pushImei(user.id, order.id)
  refresh()
  return { ok: true, data: { saleIds, imei: imei.ok ? { ok: true } : { ok: false, error: imei.error } } }
}

/** Повторно отправить IMEI (если в первый раз Kaspi не принял) — всех телефонов заказа */
export async function sendKaspiImeiAction(orderId: string): Promise<ActionResult> {
  const user = await requireUser()
  const r = await pushImei(user.id, orderId)
  refresh()
  return r.ok ? { ok: true, data: undefined } : { ok: false, error: r.error }
}

const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{3,8}$/, "Код — это цифры из приложения покупателя")
  .optional()

/**
 * «Выдан покупателю» в два шага: без кода Kaspi отправит код покупателю в приложение Kaspi.kz,
 * с кодом (покупатель называет его продавцу) — заказ закрывается как выданный.
 */
export async function completeKaspiOrderAction(orderId: string, securityCode?: string): Promise<ActionResult<{ codeSent?: boolean }>> {
  const user = await requireUser()
  const parsed = codeSchema.safeParse(securityCode || undefined)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const ctx = await shopOf(user.id)
  const order = await prisma.kaspiOrder.findFirst({ where: { id: orderId, ownerId: user.id } })
  if (!ctx || !order) return { ok: false, error: "Заказ не найден" }
  if (order.status !== "ACCEPTED_BY_MERCHANT") return { ok: false, error: "Выдать можно только принятый заказ" }
  if (order.assembled) return { ok: false, error: "Заказ уже передан в Kaspi Доставку" }
  if (order.imeiRequired && !order.imeiSentAt) return { ok: false, error: "Сначала укажите IMEI: оформите продажу — CRM отправит IMEI в Kaspi" }
  try {
    await completeOrder(ctx.token, { kaspiId: order.kaspiId, code: order.code }, parsed.data)
  } catch (e) {
    return { ok: false, error: e instanceof KaspiError ? e.message : "Kaspi не принял запрос" }
  }
  if (!parsed.data) return { ok: true, data: { codeSent: true } }
  await prisma.kaspiOrder.update({ where: { id: order.id }, data: { status: "COMPLETED", state: "ARCHIVE" } })
  refresh()
  return { ok: true, data: {} }
}

/** Передать в Kaspi Доставку: Kaspi сформирует накладную (ссылка появится после обновления) */
export async function assembleKaspiOrderAction(orderId: string, places: number): Promise<ActionResult<{ waybillNumber: string | null }>> {
  const user = await requireUser()
  if (!Number.isInteger(places) || places < 1 || places > 20) return { ok: false, error: "Число мест — от 1 до 20" }
  const ctx = await shopOf(user.id)
  const order = await prisma.kaspiOrder.findFirst({ where: { id: orderId, ownerId: user.id } })
  if (!ctx || !order) return { ok: false, error: "Заказ не найден" }
  if (order.state !== "KASPI_DELIVERY" || order.status !== "ACCEPTED_BY_MERCHANT") return { ok: false, error: "Передать в Kaspi Доставку можно принятый заказ с Kaspi Доставкой" }
  if (order.imeiRequired && !order.imeiSentAt) return { ok: false, error: "Сначала укажите IMEI: оформите продажу — CRM отправит IMEI в Kaspi" }
  try {
    await assembleOrder(ctx.token, { kaspiId: order.kaspiId }, places)
  } catch (e) {
    return { ok: false, error: e instanceof KaspiError ? e.message : "Kaspi не принял запрос" }
  }
  // Kaspi принял — отмечаем сразу; номер накладной Kaspi формирует сам, подтянем его синхронизацией
  await prisma.kaspiOrder.update({ where: { id: order.id }, data: { assembled: true } })
  await syncKaspiOrders(user.id, { force: true })
  const fresh = await prisma.kaspiOrder.findUnique({ where: { id: order.id }, select: { waybillNumber: true } })
  refresh()
  return { ok: true, data: { waybillNumber: fresh?.waybillNumber ?? null } }
}
