"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/auth"
import { decryptSecret, encryptSecret } from "@/lib/secret-box"
import { fieldErrorsOf, optText, type ActionResult } from "@/lib/validators/common"
import { todayYmd } from "@/lib/dates"
import { KASPI_CANCEL_REASONS, type KaspiCancelReason } from "@/lib/kaspi-labels"
import { KaspiError, acceptOrder, assembleOrder, cancelOrder, checkKaspiToken, completeOrder, sendImei, tokenHint, type KaspiEntry } from "@/server/kaspi"
import { syncKaspiOrders } from "@/server/kaspi-sync"
import { sellPhoneAction } from "@/server/actions/phones"

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

  const data = { tokenEnc: encryptSecret(token), tokenHint: tokenHint(token), shopName, status: "ACTIVE", lastError: null, lastCheckedAt: new Date() }
  await prisma.kaspiShop.upsert({ where: { ownerId: user.id }, create: { ownerId: user.id, ...data }, update: { ...data, connectedAt: new Date() } })
  refresh()
  return { ok: true, data: undefined }
}

/** Проверить, что сохранённый токен всё ещё работает */
export async function recheckKaspiAction(): Promise<ActionResult<{ ok: boolean; message?: string }>> {
  const user = await requireUser()
  const shop = await prisma.kaspiShop.findUnique({ where: { ownerId: user.id } })
  if (!shop) return { ok: false, error: "Магазин не подключён" }
  const check = await checkKaspiToken(decryptSecret(shop.tokenEnc))
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
  return shop ? { shop, token: decryptSecret(shop.tokenEnc) } : null
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
  const order = await prisma.kaspiOrder.findFirst({ where: { id: orderId, ownerId: user.id } })
  if (!ctx || !order) return { ok: false, error: "Заказ не найден" }
  if (order.saleId) return { ok: false, error: "По заказу уже оформлена продажа — сначала отмените её в «Продажах»" }
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

/** Позиция заказа, в которую отправляется IMEI (заказ на один телефон) */
function imeiEntry(entries: KaspiEntry[]) {
  const withId = entries.filter((e) => e.id)
  return withId.find((e) => e.imeiRequired) ?? (withId.length === 1 ? withId[0] : undefined)
}

const imeisOf = (p: { imei1: string; imei2: string | null }) => [p.imei1, p.imei2].filter((v): v is string => !!v)

/** Отправить IMEI телефона из продажи в позицию заказа Kaspi */
async function pushImei(userId: string, orderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const order = await prisma.kaspiOrder.findFirst({ where: { id: orderId, ownerId: userId }, include: { sale: { include: { phone: true } } } })
  const ctx = await shopOf(userId)
  if (!order || !ctx) return { ok: false, error: "Заказ не найден" }
  if (!order.sale) return { ok: false, error: "Сначала оформите продажу — IMEI берётся из проданного телефона" }
  const entry = imeiEntry(order.entries as unknown as KaspiEntry[])
  if (!entry?.id) return { ok: false, error: "Kaspi не прислал позицию заказа — нажмите «Обновить» и попробуйте снова" }
  try {
    await sendImei(ctx.token, entry.id, [imeisOf(order.sale.phone)])
  } catch (e) {
    return { ok: false, error: e instanceof KaspiError ? e.message : "Не удалось отправить IMEI в Kaspi" }
  }
  await prisma.kaspiOrder.update({ where: { id: order.id }, data: { imeiSentAt: new Date() } })
  return { ok: true }
}

/**
 * Оформить продажу по заказу: выбираете телефон со склада — продажа создаётся как обычно (Kaspi, цена и покупатель из заказа),
 * а IMEI этого телефона сразу уходят в Kaspi (обязательно для телефонов с 25.05.2025).
 */
export async function createSaleFromKaspiOrderAction(orderId: string, phoneId: string): Promise<ActionResult<{ saleId: string; imei: { ok: boolean; error?: string } }>> {
  const user = await requireUser()
  if (user.role === "VERIFIER") return NO_SHOP
  const order = await prisma.kaspiOrder.findFirst({ where: { id: orderId, ownerId: user.id } })
  if (!order) return { ok: false, error: "Заказ не найден" }
  if (order.saleId) return { ok: false, error: "Продажа по этому заказу уже оформлена" }
  if (order.status === "CANCELLED") return { ok: false, error: "Заказ отменён" }
  const entries = order.entries as unknown as KaspiEntry[]
  if (!order.imeiRequired && !entries.some((e) => e.imeiRequired)) return { ok: false, error: "В заказе нет телефона — продажа со склада CRM не нужна" }

  const sold = await sellPhoneAction(phoneId, {
    salePrice: order.totalPrice,
    soldAt: todayYmd(),
    buyerName: order.customerName,
    buyerPhone: order.customerPhone,
    paymentMethod: "KASPI",
    note: `Заказ Kaspi №${order.code}`,
  })
  if (!sold.ok) return { ok: false, error: sold.error }
  await prisma.kaspiOrder.update({ where: { id: order.id }, data: { saleId: sold.data.saleId } })
  // продажа уже сохранена; если Kaspi не принял IMEI — покажем, отправить можно ещё раз
  const imei = await pushImei(user.id, order.id)
  refresh()
  return { ok: true, data: { saleId: sold.data.saleId, imei: imei.ok ? { ok: true } : { ok: false, error: imei.error } } }
}

/** Повторно отправить IMEI (если в первый раз Kaspi не принял) */
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
export async function assembleKaspiOrderAction(orderId: string, places: number): Promise<ActionResult> {
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
  // накладную Kaspi формирует сам — подтянем её при обновлении
  await syncKaspiOrders(user.id, { force: true })
  refresh()
  return { ok: true, data: undefined }
}
