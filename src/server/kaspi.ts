import "server-only"

// Kaspi Магазин: API для продавцов (https://kaspi.kz/shop/api/v2, формат JSON:API).
// Авторизация — заголовок X-Auth-Token с токеном из кабинета продавца.
// Разбор ответов намеренно мягкий: берём известные поля, лишние игнорируем, ссылки на связанные
// ресурсы (товары заказа) берём из links.related, если Kaspi их прислал.

import type { KaspiCancelReason } from "@/lib/kaspi-labels"

const API = process.env.KASPI_API_URL || "https://kaspi.kz/shop/api/v2"
const DAY = 24 * 60 * 60 * 1000
/** Kaspi отдаёт заказы окнами не больше 14 дней по дате создания */
export const KASPI_WINDOW_DAYS = 14

/** Этапы заказа в Kaspi — по ним разложены вкладки */
export const KASPI_STATES = ["NEW", "SIGN_REQUIRED", "PICKUP", "DELIVERY", "KASPI_DELIVERY", "ARCHIVE"] as const
export type KaspiState = (typeof KASPI_STATES)[number]

export class KaspiError extends Error {
  constructor(
    message: string,
    public kind: "invalid" | "unavailable" | "rejected"
  ) {
    super(message)
  }
}

function headers(token: string) {
  return { "X-Auth-Token": token, "Content-Type": "application/vnd.api+json", Accept: "application/vnd.api+json" }
}

async function request<T>(token: string, url: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }): Promise<T> {
  let res: Response
  try {
    res = await fetch(url.startsWith("http") ? url : `${API}${url}`, {
      method: init?.method ?? "GET",
      headers: { ...headers(token), ...init?.headers },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    })
  } catch {
    throw new KaspiError("Kaspi не отвечает. Проверьте интернет и попробуйте через минуту.", "unavailable")
  }
  if (res.status === 401 || res.status === 403) {
    throw new KaspiError("Kaspi не принял токен. Скопируйте его из кабинета продавца ещё раз — целиком, без пробелов.", "invalid")
  }
  const text = await res.text()
  const json = text ? safeJson(text) : null
  if (!res.ok) {
    const detail = (json as { errors?: { title?: string; detail?: string }[] } | null)?.errors?.[0]
    const reason = detail?.detail || detail?.title
    throw new KaspiError(reason ? `Kaspi: ${reason}` : `Kaspi ответил ошибкой (${res.status}). Попробуйте позже.`, res.status >= 500 ? "unavailable" : "rejected")
  }
  return json as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export type KaspiCheck = { ok: true } | { ok: false; reason: "invalid" | "unavailable"; message: string }

/** Проверка токена: лёгкий запрос новых заказов за сутки */
export async function checkKaspiToken(token: string): Promise<KaspiCheck> {
  try {
    const now = Date.now()
    await request(token, `/orders?${ordersQuery("NEW", now - DAY, now, 0, 1)}`)
    return { ok: true }
  } catch (e) {
    if (e instanceof KaspiError) return { ok: false, reason: e.kind === "invalid" ? "invalid" : "unavailable", message: e.message }
    throw e
  }
}

/** Показать, какой токен сохранён, не раскрывая его: «••••a1b2» */
export const tokenHint = (token: string) => token.slice(-4)

// ─── Заказы ──────────────────────────────────────────────────────

function ordersQuery(state: string, from: number, to: number, page: number, size: number) {
  return new URLSearchParams({
    "page[number]": String(page),
    "page[size]": String(size),
    "filter[orders][state]": state,
    "filter[orders][creationDate][$ge]": String(from),
    "filter[orders][creationDate][$le]": String(to),
  }).toString()
}

type JsonApiItem = {
  id: string
  type?: string
  attributes?: Record<string, unknown>
  relationships?: Record<string, { links?: { related?: string } }>
}
type JsonApiList = { data?: JsonApiItem[]; meta?: { pageCount?: number; totalCount?: number } }

/** Товар в заказе. id — код позиции в Kaspi (нужен для отправки IMEI) */
export type KaspiEntry = { id?: string; name: string; code: string | null; quantity: number; price: number; total: number; imeiRequired?: boolean }

export type KaspiOrderData = {
  kaspiId: string
  code: string
  state: string
  status: string
  totalPrice: number
  paymentMode: string | null
  deliveryMode: string | null
  isKaspiDelivery: boolean
  orderedAt: Date
  plannedDeliveryAt: Date | null
  customerName: string | null
  customerPhone: string | null
  address: string | null
  imeiRequired: boolean
  waybill: string | null
  waybillNumber: string | null
  /** ссылка на товары заказа, если Kaspi её прислал */
  entriesUrl: string
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && !Number.isNaN(Number(v)) ? Number(v) : 0)
const date = (v: unknown) => (typeof v === "number" || (typeof v === "string" && /^\d+$/.test(v)) ? new Date(Number(v)) : typeof v === "string" ? new Date(v) : null)

/** Телефон покупателя: 10 цифр без кода страны → +7…; скрытый Kaspi номер (одни нули) — не показываем */
function cleanPhone(phone: string | null) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, "")
  if (!digits || /^0+$/.test(digits.replace(/^[78]/, ""))) return null
  return /^\d{10}$/.test(digits) ? `+7${digits}` : phone
}

/** Заказ из ответа Kaspi → наши поля */
export function parseOrder(item: JsonApiItem, fallbackState: string): KaspiOrderData {
  const a = item.attributes ?? {}
  const customer = (a.customer ?? {}) as Record<string, unknown>
  const address = (a.deliveryAddress ?? {}) as Record<string, unknown>
  const name = str(customer.name) ?? ([str(customer.firstName), str(customer.lastName)].filter(Boolean).join(" ") || null)
  const phone = str(customer.cellPhone)
  const ordered = date(a.creationDate)
  return {
    kaspiId: item.id,
    code: str(a.code) ?? item.id,
    state: str(a.state) ?? fallbackState,
    status: str(a.status) ?? "UNKNOWN",
    totalPrice: Math.round(num(a.totalPrice)),
    paymentMode: str(a.paymentMode),
    deliveryMode: str(a.deliveryMode),
    isKaspiDelivery: a.isKaspiDelivery === true,
    orderedAt: ordered && !Number.isNaN(+ordered) ? ordered : new Date(),
    plannedDeliveryAt: date(a.plannedDeliveryDate),
    customerName: name,
    // Kaspi присылает 10 цифр без кода страны
    customerPhone: cleanPhone(phone),
    address: str(address.formattedAddress) ?? ([str(address.town), str(address.streetName), str(address.streetNumber)].filter(Boolean).join(", ") || null),
    imeiRequired: a.isImeiRequired === true,
    waybill: str(a.waybill),
    waybillNumber: str(a.waybillNumber),
    entriesUrl: item.relationships?.entries?.links?.related ?? `/orders/${item.id}/entries`,
  }
}

/** Все заказы этапа за последние 14 дней (постранично) */
export async function listOrders(token: string, state: KaspiState, now = Date.now()): Promise<KaspiOrderData[]> {
  const from = now - KASPI_WINDOW_DAYS * DAY
  const out: KaspiOrderData[] = []
  for (let page = 0; page < 20; page++) {
    const res = await request<JsonApiList>(token, `/orders?${ordersQuery(state, from, now, page, 100)}`)
    const data = res?.data ?? []
    out.push(...data.map((d) => parseOrder(d, state)))
    const pages = res?.meta?.pageCount
    if (data.length < 100 || (pages != null && page + 1 >= pages)) break
  }
  return out
}

/** Товары заказа: название берём из offer/названия позиции, иначе — из карточки товара по ссылке */
export async function getOrderEntries(token: string, entriesUrl: string): Promise<KaspiEntry[]> {
  const res = await request<JsonApiList>(token, entriesUrl)
  const entries: KaspiEntry[] = []
  for (const item of res?.data ?? []) {
    const a = item.attributes ?? {}
    const offer = (a.offer ?? {}) as Record<string, unknown>
    let name = str(offer.name) ?? str(a.name)
    let code = str(offer.code) ?? str(a.code)
    const productUrl = item.relationships?.product?.links?.related
    if (!name && productUrl) {
      const product = await request<{ data?: JsonApiItem }>(token, productUrl).catch(() => null)
      name = str(product?.data?.attributes?.name)
      code = code ?? str(product?.data?.attributes?.code)
    }
    const quantity = Math.max(1, Math.round(num(a.quantity)) || 1)
    const total = Math.round(num(a.totalPrice))
    entries.push({
      id: item.id,
      name: name ?? "Товар",
      code,
      quantity,
      price: Math.round(num(a.basePrice)) || Math.round(total / quantity),
      total,
      imeiRequired: a.isImeiRequired === true,
    })
  }
  return entries
}

/** Принять новый заказ (продавец подтверждает, что товар есть) */
export async function acceptOrder(token: string, order: { kaspiId: string; code: string }) {
  await request(token, "/orders", {
    method: "POST",
    body: { data: { type: "orders", id: order.kaspiId, attributes: { code: order.code, status: "ACCEPTED_BY_MERCHANT" } } },
  })
}

/** Отменить заказ с причиной */
export async function cancelOrder(token: string, order: { kaspiId: string; code: string }, reason: KaspiCancelReason, comment?: string) {
  await request(token, "/orders", {
    method: "POST",
    body: {
      data: {
        type: "orders",
        id: order.kaspiId,
        attributes: { code: order.code, status: "CANCELLED", cancellationReason: reason, ...(comment ? { cancellationComment: comment } : {}) },
      },
    },
  })
}

/**
 * IMEI проданных телефонов в позицию заказа (обязательно с 25.05.2025, после получения заказа).
 * devices — по массиву на каждый телефон: все его IMEI (по числу SIM-слотов).
 */
export async function sendImei(token: string, entryId: string, devices: string[][]) {
  await request(token, "/orderEntryImeiOperation", {
    method: "POST",
    body: {
      data: {
        type: "orderEntryImeiOperation",
        attributes: { items: devices.map((imei) => ({ imei })) },
        relationships: { entry: { data: { type: "orderentries", id: entryId } } },
      },
    },
  })
}

/**
 * «Выдан»: в два шага. Без кода Kaspi отправляет покупателю код в приложение; с кодом — заказ выдан.
 */
export async function completeOrder(token: string, order: { kaspiId: string; code: string }, securityCode?: string) {
  await request(token, "/orders", {
    method: "POST",
    headers: { "X-Security-Code": securityCode ?? "", "X-Send-Code": "true" },
    body: { data: { type: "orders", id: order.kaspiId, attributes: { code: order.code, status: "COMPLETED" } } },
  })
}

/** Передать в Kaspi Доставку: заказ собран, Kaspi формирует накладную на указанное число мест */
export async function assembleOrder(token: string, order: { kaspiId: string }, places: number) {
  await request(token, "/orders", {
    method: "POST",
    body: { data: { type: "orders", id: order.kaspiId, attributes: { status: "ASSEMBLE", numberOfSpace: String(places) } } },
  })
}
