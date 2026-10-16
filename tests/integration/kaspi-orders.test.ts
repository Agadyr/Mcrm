import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db"
import { sendTelegram } from "@/lib/telegram"
import {
  acceptKaspiOrderAction,
  assembleKaspiOrderAction,
  cancelKaspiOrderAction,
  completeKaspiOrderAction,
  connectKaspiAction,
  createSaleFromKaspiOrderAction,
  recheckKaspiAction,
  sendKaspiImeiAction,
  setKaspiAutoAcceptAction,
  syncKaspiAction,
} from "@/server/actions/kaspi"
import { cancelSaleAction } from "@/server/actions/phones"
import { encryptSecret } from "@/lib/secret-box"
import { TOKEN_UNREADABLE, purgeOldKaspiPii, syncAllKaspiShops, syncKaspiOrders } from "@/server/kaspi-sync"
import { createPhone, createUser, loginAs } from "../support/factories"

// Поддельный Kaspi: список заказов по этапам, товары заказа, принятие/отмена. Формат — JSON:API, как у настоящего API.
const GOOD = "kaspi-good-token-0123456789abcdef"
const NOW = Date.now()

// old — заказ старше окна в 14 дней: в списках по этапам его нет, найти можно только по номеру
type FakeOrder = { id: string; state: string; status: string; total: number; code: string; old?: boolean }
let orders: FakeOrder[] = []
let posts: { url: string; headers: Record<string, string>; body: { data: { id?: string; type: string; attributes: Record<string, unknown>; relationships?: { entry: { data: { id: string } } } } } }[] = []
let down = false
let codeLookups: string[] = []
let imeiDown = false // Kaspi не принимает IMEI
// свой состав заказа: id заказа → позиции (по умолчанию — один телефон на всю сумму)
const customEntries = new Map<string, { id: string; quantity: number; totalPrice: number; name: string; imei?: boolean }[]>()

const attrs = (o: FakeOrder) => ({
  code: o.code,
  state: o.state,
  status: o.status,
  totalPrice: o.total,
  paymentMode: "PREPAID",
  deliveryMode: "DELIVERY_PICKUP",
  isKaspiDelivery: false,
  creationDate: o.old ? NOW - 20 * 86_400_000 : NOW - 3_600_000,
  customer: { firstName: "Ержан", lastName: "Ахметов", cellPhone: "7011234567" },
  deliveryAddress: { formattedAddress: "Алматы, Абая 1" },
  isImeiRequired: !noImei.has(o.id),
  ...(noImei.has(o.id) ? { customer: { firstName: "Азат", cellPhone: "+0(000)-000-00-00" } } : {}),
  ...(o.state === "KASPI_DELIVERY" && o.status === "ACCEPTED_BY_MERCHANT" && assembled.has(o.id) ? { waybill: "https://kaspi.kz/waybill/1.pdf", waybillNumber: "W1" } : {}),
})
const assembled = new Set<string>()
const noImei = new Set<string>()

beforeEach(() => {
  orders = [
    { id: "o1", code: "100001", state: "NEW", status: "APPROVED_BY_BANK", total: 520_000 },
    { id: "o2", code: "100002", state: "PICKUP", status: "ACCEPTED_BY_MERCHANT", total: 180_000 },
    { id: "o3", code: "100003", state: "ARCHIVE", status: "COMPLETED", total: 90_000 },
  ]
  posts = []
  down = false
  codeLookups = []
  imeiDown = false
  customEntries.clear()
  assembled.clear()
  noImei.clear()
  vi.mocked(sendTelegram).mockClear()
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: { method?: string; headers: Record<string, string>; body?: string }) => {
      if (down) throw new Error("network")
      if (init.headers["X-Auth-Token"] !== GOOD) return new Response("{}", { status: 401 })
      const url = new URL(input)
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
      if (init.method === "POST") {
        const body = JSON.parse(init.body!)
        if (imeiDown && input.endsWith("/orderEntryImeiOperation")) return new Response("{}", { status: 400 })
        posts.push({ url: input, headers: init.headers, body })
        if (body.data.attributes.status === "ASSEMBLE") assembled.add(body.data.id)
        return json({})
      }
      const entries = url.pathname.match(/\/orders\/(.+)\/entries/)
      if (entries && customEntries.has(entries[1])) {
        return json({
          data: customEntries.get(entries[1])!.map((e) => ({
            id: e.id,
            attributes: { quantity: e.quantity, totalPrice: e.totalPrice, basePrice: e.totalPrice / e.quantity, isImeiRequired: e.imei ?? true, offer: { name: e.name, code: e.id } },
          })),
        })
      }
      if (entries) {
        return json({ data: [{ id: `entry-${entries[1]}`, attributes: { quantity: 1, totalPrice: orders.find((o) => o.id === entries[1])!.total, basePrice: 1, isImeiRequired: !noImei.has(entries[1]), offer: { name: "iPhone 15 Pro 256GB", code: "SKU1" } } }] })
      }
      const toItem = (o: FakeOrder) => ({ id: o.id, type: "orders", attributes: attrs(o), relationships: { entries: { links: { related: `https://kaspi.kz/shop/api/v2/orders/${o.id}/entries` } } } })
      const code = url.searchParams.get("filter[orders][code]")
      if (code) {
        codeLookups.push(code)
        return json({ data: orders.filter((o) => o.code === code).map(toItem), meta: { pageCount: 1 } })
      }
      const state = url.searchParams.get("filter[orders][state]")
      const data = orders.filter((o) => o.state === state && !o.old).map(toItem)
      return json({ data, meta: { pageCount: 1 } })
    })
  )
})
afterEach(() => vi.unstubAllGlobals())

/** Товар прайса с артикулом SKU1 (его присылает поддельный Kaspi в позициях заказа) */
async function offerSku1(ownerId: string) {
  await prisma.kaspiOffer.create({ data: { ownerId, sku: "SKU1", title: "Apple iPhone 15 Pro 256GB", model: "iPhone 15 Pro", memoryGb: 256, price: 520_000 } })
}

async function connected(opts: { autoAccept?: boolean } = {}) {
  const user = await createUser({ telegramChatId: "555" })
  await loginAs(user)
  expect((await connectKaspiAction({ token: GOOD })).ok).toBe(true)
  if (opts.autoAccept) await setKaspiAutoAcceptAction(true)
  return user
}

describe("заказы Kaspi", () => {
  it("синхронизация: заказы, покупатель, товары; повтор не плодит дубли; первый раз без Telegram", async () => {
    const user = await connected()
    const r = await syncKaspiOrders(user.id, { force: true })
    expect(r).toMatchObject({ total: 3, created: 3 })
    const o = await prisma.kaspiOrder.findFirstOrThrow({ where: { ownerId: user.id, kaspiId: "o1" } })
    expect(o).toMatchObject({ code: "100001", state: "NEW", status: "APPROVED_BY_BANK", totalPrice: 520_000, customerName: "Ержан Ахметов", customerPhone: "+77011234567", address: "Алматы, Абая 1" })
    expect(o.entries).toEqual([{ id: "entry-o1", name: "iPhone 15 Pro 256GB", code: "SKU1", quantity: 1, price: 1, total: 520_000, imeiRequired: true }])
    expect(o.imeiRequired).toBe(true)
    expect(sendTelegram).not.toHaveBeenCalled() // первая загрузка — не засыпаем чат старыми заказами

    orders.push({ id: "o4", code: "100004", state: "NEW", status: "APPROVED_BY_BANK", total: 300_000 })
    expect(await syncKaspiOrders(user.id, { force: true })).toMatchObject({ total: 4, created: 1 })
    expect(await prisma.kaspiOrder.count()).toBe(4)
    expect(sendTelegram).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendTelegram).mock.calls[0][1]).toContain("Новый заказ Kaspi №100004")
  })

  it("не чаще раза в минуту; ошибка Kaspi сохраняется, рабочий токен не портится", async () => {
    const user = await connected()
    await syncKaspiOrders(user.id, { force: true })
    expect(await syncKaspiOrders(user.id)).toMatchObject({ total: 0, created: 0 }) // слишком рано
    down = true
    const r = await syncKaspiOrders(user.id, { force: true })
    expect(r.error).toContain("не отвечает")
    const shop = await prisma.kaspiShop.findUniqueOrThrow({ where: { ownerId: user.id } })
    expect(shop).toMatchObject({ status: "ACTIVE", lastSyncError: expect.stringContaining("не отвечает") })
  })

  it("автопринятие: новый заказ принимается в Kaspi, в Telegram — «принят автоматически»", async () => {
    const user = await connected({ autoAccept: true })
    await offerSku1(user.id)
    await createPhone(user.id)
    await syncKaspiOrders(user.id, { force: true }) // первая загрузка принимает новые заказы тоже
    expect(posts).toHaveLength(1)
    expect(posts[0].body.data).toMatchObject({ id: "o1", attributes: { code: "100001", status: "ACCEPTED_BY_MERCHANT" } })
    expect((await prisma.kaspiOrder.findFirstOrThrow({ where: { kaspiId: "o1" } })).status).toBe("ACCEPTED_BY_MERCHANT")

    orders.push({ id: "o5", code: "100005", state: "NEW", status: "APPROVED_BY_BANK", total: 100_000 })
    await syncKaspiOrders(user.id, { force: true })
    expect(posts).toHaveLength(2)
    expect(vi.mocked(sendTelegram).mock.calls.at(-1)![1]).toContain("принят автоматически")
  })

  it("принять вручную и отменить с причиной", async () => {
    const user = await connected()
    await syncKaspiAction()
    const o1 = await prisma.kaspiOrder.findFirstOrThrow({ where: { ownerId: user.id, kaspiId: "o1" } })
    expect((await acceptKaspiOrderAction(o1.id)).ok).toBe(true)
    expect(posts.at(-1)!.body.data.attributes).toMatchObject({ status: "ACCEPTED_BY_MERCHANT" })

    expect(await cancelKaspiOrderAction(o1.id, { reason: "нет такой" })).toMatchObject({ ok: false })
    expect((await cancelKaspiOrderAction(o1.id, { reason: "MERCHANT_OUT_OF_STOCK", comment: "закончился" })).ok).toBe(true)
    expect(posts.at(-1)!.body.data.attributes).toMatchObject({ status: "CANCELLED", cancellationReason: "MERCHANT_OUT_OF_STOCK", cancellationComment: "закончился" })
    expect(await prisma.kaspiOrder.findUniqueOrThrow({ where: { id: o1.id } })).toMatchObject({ status: "CANCELLED", state: "ARCHIVE" })
  })

  it("оформить продажу по заказу: Kaspi, цена и покупатель из заказа, телефон продан, IMEI ушли в Kaspi; второй раз нельзя", async () => {
    const user = await connected()
    const phone = await createPhone(user.id, { purchasePrice: 400_000, imei2: "356789000099990" })
    await syncKaspiAction()
    const o1 = await prisma.kaspiOrder.findFirstOrThrow({ where: { ownerId: user.id, kaspiId: "o1" } })
    const r = await createSaleFromKaspiOrderAction(o1.id, phone.id)
    expect(r).toMatchObject({ ok: true, data: { imei: { ok: true } } })
    const imeiPost = posts.find((p) => p.url.endsWith("/orderEntryImeiOperation"))!
    expect(imeiPost.body.data).toMatchObject({
      type: "orderEntryImeiOperation",
      attributes: { items: [{ imei: [phone.imei1, "356789000099990"] }] },
      relationships: { entry: { data: { type: "orderentries", id: "entry-o1" } } },
    })
    expect((await prisma.kaspiOrder.findUniqueOrThrow({ where: { id: o1.id } })).imeiSentAt).not.toBeNull()
    const sale = await prisma.sale.findFirstOrThrow({ where: { phoneId: phone.id } })
    expect(sale).toMatchObject({ salePrice: 520_000, paymentMethod: "KASPI", paidAmount: 520_000, buyerName: "Ержан Ахметов", buyerPhone: "+77011234567" })
    expect(sale.note).toContain("100001")
    expect(sale).toMatchObject({ kaspiOrderId: o1.id, kaspiEntryId: "entry-o1" })
    // покупатель Kaspi попал в базу клиентов
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: sale.customerId! } })).toMatchObject({ ownerId: user.id, phone: "+77011234567", name: "Ержан Ахметов" })
    expect((await prisma.phone.findUniqueOrThrow({ where: { id: phone.id } })).status).toBe("SOLD")
    expect(await createSaleFromKaspiOrderAction(o1.id, phone.id)).toMatchObject({ ok: false })
    // по заказу с продажей отмену блокируем: сначала нужно отменить продажу
    expect(await cancelKaspiOrderAction(o1.id, { reason: "BUYER_NOT_REACHABLE" })).toMatchObject({ ok: false })
  })

  it("заказ на несколько телефонов: по телефону на штуку, продажа на каждый, цена делится, IMEI одним запросом на позицию", async () => {
    const user = await connected()
    orders[0].total = 1_100_001
    customEntries.set("o1", [
      { id: "e-pro", name: "iPhone 15 Pro 256GB", quantity: 2, totalPrice: 1_000_001 },
      { id: "e-case", name: "Чехол", quantity: 1, totalPrice: 100_000, imei: false },
    ])
    const [a, b, c] = [await createPhone(user.id, { imei2: "356789000011110" }), await createPhone(user.id), await createPhone(user.id)]
    await syncKaspiAction()
    const o1 = await prisma.kaspiOrder.findFirstOrThrow({ where: { ownerId: user.id, kaspiId: "o1" } })

    // один телефон на заказ из двух штук, меньше штук, один телефон дважды — нельзя
    expect(await createSaleFromKaspiOrderAction(o1.id, a.id)).toMatchObject({ ok: false })
    expect(await createSaleFromKaspiOrderAction(o1.id, { "e-pro": [a.id] })).toMatchObject({ ok: false, error: expect.stringContaining("2 шт.") })
    expect(await createSaleFromKaspiOrderAction(o1.id, { "e-pro": [a.id, a.id] })).toMatchObject({ ok: false, error: expect.stringContaining("дважды") })
    // один из телефонов уже продан — не создаётся ни одной продажи
    await prisma.phone.update({ where: { id: c.id }, data: { status: "SOLD" } })
    expect(await createSaleFromKaspiOrderAction(o1.id, { "e-pro": [a.id, c.id] })).toMatchObject({ ok: false, error: expect.stringContaining("уже продан") })
    expect(await prisma.sale.count()).toBe(0)
    expect((await prisma.phone.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("IN_STOCK")

    const r = await createSaleFromKaspiOrderAction(o1.id, { "e-pro": [a.id, b.id] })
    expect(r).toMatchObject({ ok: true, data: { imei: { ok: true } } })
    const sales = await prisma.sale.findMany({ where: { kaspiOrderId: o1.id }, orderBy: { salePrice: "desc" } })
    expect(sales.map((s) => [s.phoneId, s.salePrice, s.kaspiEntryId])).toEqual([
      [a.id, 500_001, "e-pro"],
      [b.id, 500_000, "e-pro"],
    ])
    expect(sales.every((s) => s.paymentMethod === "KASPI" && s.buyerName === "Ержан Ахметов")).toBe(true)
    expect(await prisma.phone.count({ where: { id: { in: [a.id, b.id] }, status: "SOLD" } })).toBe(2)

    const imeiPosts = posts.filter((p) => p.url.endsWith("/orderEntryImeiOperation"))
    expect(imeiPosts).toHaveLength(1)
    expect(imeiPosts[0].body.data).toMatchObject({
      attributes: { items: [{ imei: [a.imei1, "356789000011110"] }, { imei: [b.imei1] }] },
      relationships: { entry: { data: { id: "e-pro" } } },
    })
    expect((await prisma.kaspiOrder.findUniqueOrThrow({ where: { id: o1.id } })).imeiSentAt).not.toBeNull()
    expect(await createSaleFromKaspiOrderAction(o1.id, { "e-pro": [a.id, b.id] })).toMatchObject({ ok: false, error: expect.stringContaining("уже оформлена") })
  })

  it("Kaspi не принял IMEI: продажи остаются, «Отправить IMEI» шлёт все телефоны заново; после отмены продаж заказ можно отменить", async () => {
    const user = await connected()
    customEntries.set("o1", [{ id: "e1", name: "iPhone 15 Pro 256GB", quantity: 2, totalPrice: 520_000 }])
    const [a, b] = [await createPhone(user.id), await createPhone(user.id)]
    await syncKaspiAction()
    const o1 = await prisma.kaspiOrder.findFirstOrThrow({ where: { ownerId: user.id, kaspiId: "o1" } })

    imeiDown = true
    const r = await createSaleFromKaspiOrderAction(o1.id, { e1: [a.id, b.id] })
    expect(r).toMatchObject({ ok: true, data: { imei: { ok: false, error: expect.any(String) } } })
    expect(await prisma.sale.count({ where: { kaspiOrderId: o1.id, cancelledAt: null } })).toBe(2)
    expect((await prisma.kaspiOrder.findUniqueOrThrow({ where: { id: o1.id } })).imeiSentAt).toBeNull()
    expect(await sendKaspiImeiAction(o1.id)).toMatchObject({ ok: false })

    imeiDown = false
    expect((await sendKaspiImeiAction(o1.id)).ok).toBe(true)
    const sent = posts.filter((p) => p.url.endsWith("/orderEntryImeiOperation"))
    expect(sent).toHaveLength(1)
    expect(sent[0].body.data.attributes).toEqual({ items: [{ imei: [a.imei1] }, { imei: [b.imei1] }] })
    expect((await prisma.kaspiOrder.findUniqueOrThrow({ where: { id: o1.id } })).imeiSentAt).not.toBeNull()

    // отменили одну продажу — IMEI по позиции уже не сходится, заказ ещё нельзя отменить
    await cancelSaleAction(a.id)
    expect(await sendKaspiImeiAction(o1.id)).toMatchObject({ ok: false, error: expect.stringContaining("продано 1") })
    expect(await cancelKaspiOrderAction(o1.id, { reason: "BUYER_NOT_REACHABLE" })).toMatchObject({ ok: false })
    await cancelSaleAction(b.id)
    expect((await cancelKaspiOrderAction(o1.id, { reason: "BUYER_NOT_REACHABLE" })).ok).toBe(true)
  })

  it("выдача по коду: без IMEI нельзя; сначала код покупателю, потом подтверждение", async () => {
    const user = await connected()
    orders[1].status = "ACCEPTED_BY_MERCHANT" // самовывоз, принят
    await syncKaspiOrders(user.id, { force: true })
    const o2 = await prisma.kaspiOrder.findFirstOrThrow({ where: { ownerId: user.id, kaspiId: "o2" } })
    expect(await completeKaspiOrderAction(o2.id)).toMatchObject({ ok: false, error: expect.stringContaining("IMEI") })

    const phone = await createPhone(user.id)
    await createSaleFromKaspiOrderAction(o2.id, phone.id)
    expect(await completeKaspiOrderAction(o2.id)).toEqual({ ok: true, data: { codeSent: true } })
    expect(posts.at(-1)!.headers).toMatchObject({ "X-Security-Code": "", "X-Send-Code": "true" })
    expect(await completeKaspiOrderAction(o2.id, "12a")).toMatchObject({ ok: false })
    expect((await completeKaspiOrderAction(o2.id, "4821")).ok).toBe(true)
    expect(posts.at(-1)!.headers["X-Security-Code"]).toBe("4821")
    expect(posts.at(-1)!.body.data.attributes).toMatchObject({ status: "COMPLETED", code: "100002" })
    expect(await prisma.kaspiOrder.findUniqueOrThrow({ where: { id: o2.id } })).toMatchObject({ status: "COMPLETED", state: "ARCHIVE" })
  })

  it("Kaspi Доставка: накладная после передачи", async () => {
    const user = await connected()
    orders.push({ id: "o6", code: "100006", state: "KASPI_DELIVERY", status: "ACCEPTED_BY_MERCHANT", total: 250_000 })
    await syncKaspiOrders(user.id, { force: true })
    const o6 = await prisma.kaspiOrder.findFirstOrThrow({ where: { ownerId: user.id, kaspiId: "o6" } })
    await createSaleFromKaspiOrderAction(o6.id, (await createPhone(user.id)).id)
    expect(await assembleKaspiOrderAction(o6.id, 0)).toMatchObject({ ok: false })
    expect((await assembleKaspiOrderAction(o6.id, 2)).ok).toBe(true)
    expect(posts.at(-1)!.body.data.attributes).toEqual({ status: "ASSEMBLE", numberOfSpace: "2" })
    expect(await prisma.kaspiOrder.findUniqueOrThrow({ where: { id: o6.id } })).toMatchObject({ waybill: "https://kaspi.kz/waybill/1.pdf", waybillNumber: "W1" })
  })

  it("заказ без телефона (IMEI не нужен): продажу со склада не оформляем; скрытый номер покупателя не показываем", async () => {
    const user = await connected()
    orders.push({ id: "o7", code: "100007", state: "KASPI_DELIVERY", status: "ACCEPTED_BY_MERCHANT", total: 500 })
    noImei.add("o7")
    await syncKaspiOrders(user.id, { force: true })
    const o7 = await prisma.kaspiOrder.findFirstOrThrow({ where: { ownerId: user.id, kaspiId: "o7" } })
    expect(o7).toMatchObject({ imeiRequired: false, customerPhone: null })
    expect(await createSaleFromKaspiOrderAction(o7.id, (await createPhone(user.id)).id)).toMatchObject({ ok: false, error: expect.stringContaining("нет телефона") })
    // без IMEI передать в доставку можно
    expect((await assembleKaspiOrderAction(o7.id, 1)).ok).toBe(true)
  })

  it("чужой заказ недоступен; расписание обходит все работающие магазины", async () => {
    const a = await connected()
    await syncKaspiOrders(a.id, { force: true })
    const o1 = await prisma.kaspiOrder.findFirstOrThrow({ where: { ownerId: a.id, kaspiId: "o1" } })
    await loginAs(await createUser())
    expect(await acceptKaspiOrderAction(o1.id)).toMatchObject({ ok: false })
    const results = await syncAllKaspiShops()
    expect(results).toHaveLength(1)
    expect(results[0].ownerId).toBe(a.id)
  })

  it("автопринятие только при наличии: артикул из прайса и телефоны на складе, иначе — решение за продавцом", async () => {
    const user = await connected({ autoAccept: true })
    // артикула SKU1 нет в прайсе — не принимаем
    await syncKaspiOrders(user.id, { force: true })
    expect(posts).toHaveLength(0)
    expect((await prisma.kaspiOrder.findFirstOrThrow({ where: { kaspiId: "o1" } })).status).toBe("APPROVED_BY_BANK")

    // в прайсе есть, но телефонов «В наличии» нет (проданный не считается)
    await offerSku1(user.id)
    await createPhone(user.id, { status: "SOLD" })
    orders.push({ id: "o5", code: "100005", state: "NEW", status: "APPROVED_BY_BANK", total: 100_000 })
    await syncKaspiOrders(user.id, { force: true })
    expect(posts).toHaveLength(0)
    expect(vi.mocked(sendTelegram).mock.calls.at(-1)![1]).toContain("Не принят автоматически")

    // один телефон на складе — из двух новых заказов принимается один
    await createPhone(user.id)
    orders.push({ id: "o8", code: "100008", state: "NEW", status: "APPROVED_BY_BANK", total: 100_000 })
    orders.push({ id: "o9", code: "100009", state: "NEW", status: "APPROVED_BY_BANK", total: 100_000 })
    expect(await syncKaspiOrders(user.id, { force: true })).toMatchObject({ created: 2, accepted: 1 })
    expect(posts).toHaveLength(1)
    expect(posts[0].body.data.id).toBe("o8")
    expect((await prisma.kaspiOrder.findFirstOrThrow({ where: { kaspiId: "o9" } })).status).toBe("APPROVED_BY_BANK")
  })

  it("два одновременных запуска: заказы обрабатывает один — без двойного автопринятия и сообщений", async () => {
    const user = await connected({ autoAccept: true })
    await offerSku1(user.id)
    await createPhone(user.id)
    await createPhone(user.id)
    await syncKaspiOrders(user.id, { force: true })
    expect(posts).toHaveLength(1)

    orders.push({ id: "o5", code: "100005", state: "NEW", status: "APPROVED_BY_BANK", total: 100_000 })
    const [a, b] = await Promise.all([syncKaspiOrders(user.id, { force: true }), syncKaspiOrders(user.id, { force: true })])
    expect([a.skipped, b.skipped].filter(Boolean)).toHaveLength(1)
    expect(a.created + b.created).toBe(1)
    expect(posts).toHaveLength(2)
    expect(sendTelegram).toHaveBeenCalledTimes(1)
    expect((await prisma.kaspiShop.findUniqueOrThrow({ where: { ownerId: user.id } })).syncStartedAt).toBeNull() // захват отпущен

    // идёт другая синхронизация — ждём её; брошенный захват (процесс упал) через 5 минут не мешает
    await prisma.kaspiShop.update({ where: { ownerId: user.id }, data: { syncStartedAt: new Date() } })
    expect(await syncKaspiOrders(user.id, { force: true })).toMatchObject({ skipped: true })
    await prisma.kaspiShop.update({ where: { ownerId: user.id }, data: { syncStartedAt: new Date(Date.now() - 10 * 60_000) } })
    expect((await syncKaspiOrders(user.id, { force: true })).skipped).toBeUndefined()
  })

  it("токен не расшифровывается (сменили AUTH_SECRET): магазин «токен не работает», понятная ошибка, расписание идёт дальше", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {})
    const broken = await connected()
    await syncKaspiOrders(broken.id, { force: true })
    const o1 = await prisma.kaspiOrder.findFirstOrThrow({ where: { ownerId: broken.id, kaspiId: "o1" } })
    vi.stubEnv("AUTH_SECRET", "другой-секрет-другой-секрет-другой")
    const foreign = encryptSecret(GOOD)
    vi.unstubAllEnvs()
    await prisma.kaspiShop.update({ where: { ownerId: broken.id }, data: { tokenEnc: foreign } })

    expect(await acceptKaspiOrderAction(o1.id)).toEqual({ ok: false, error: TOKEN_UNREADABLE })
    expect(await prisma.kaspiShop.findUniqueOrThrow({ where: { ownerId: broken.id } })).toMatchObject({ status: "INVALID", lastError: TOKEN_UNREADABLE })
    expect(await recheckKaspiAction()).toEqual({ ok: true, data: { ok: false, message: TOKEN_UNREADABLE } })

    // в расписании сломанный магазин не мешает остальным
    await prisma.kaspiShop.update({ where: { ownerId: broken.id }, data: { status: "ACTIVE" } })
    const other = await connected()
    const results = await syncAllKaspiShops()
    expect(results.find((r) => r.ownerId === broken.id)).toMatchObject({ error: TOKEN_UNREADABLE })
    expect(results.find((r) => r.ownerId === other.id)).toMatchObject({ created: 3 })
    expect(await prisma.kaspiShop.findUniqueOrThrow({ where: { ownerId: broken.id } })).toMatchObject({ status: "INVALID", lastSyncError: TOKEN_UNREADABLE })

    // новый токен — снова работает
    await loginAs(broken)
    expect((await connectKaspiAction({ token: GOOD })).ok).toBe(true)
    expect(await prisma.kaspiShop.findUniqueOrThrow({ where: { ownerId: broken.id } })).toMatchObject({ status: "ACTIVE", lastError: null, lastSyncError: null })
    quiet.mockRestore()
  })

  it("незавершённые заказы старше 14 дней обновляются запросом по номеру", async () => {
    const user = await connected()
    const old = { totalPrice: 300_000, orderedAt: new Date(NOW - 20 * 86_400_000) }
    await prisma.kaspiOrder.createMany({
      data: [
        { ownerId: user.id, kaspiId: "old1", code: "900001", state: "KASPI_DELIVERY", status: "ACCEPTED_BY_MERCHANT", ...old },
        { ownerId: user.id, kaspiId: "old2", code: "900002", state: "DELIVERY", status: "ACCEPTED_BY_MERCHANT", ...old }, // Kaspi его не найдёт
        { ownerId: user.id, kaspiId: "old3", code: "900003", state: "ARCHIVE", status: "COMPLETED", ...old }, // завершён — не трогаем
      ],
    })
    orders.push({ id: "old1", code: "900001", state: "ARCHIVE", status: "COMPLETED", total: 300_000, old: true })

    await syncKaspiOrders(user.id, { force: true })
    expect(codeLookups.sort()).toEqual(["900001", "900002"])
    expect(await prisma.kaspiOrder.findFirstOrThrow({ where: { kaspiId: "old1" } })).toMatchObject({ state: "ARCHIVE", status: "COMPLETED", customerName: "Ержан Ахметов" })
    expect(await prisma.kaspiOrder.findFirstOrThrow({ where: { kaspiId: "old2" } })).toMatchObject({ state: "DELIVERY", status: "ACCEPTED_BY_MERCHANT" })

    codeLookups = []
    await syncKaspiOrders(user.id, { force: true })
    expect(codeLookups).toEqual(["900002"]) // завершённый больше не запрашиваем
  })

  it("телефон и адрес покупателя в архивных заказах старше 90 дней стираются (по расписанию)", async () => {
    const user = await createUser()
    const base = { ownerId: user.id, status: "COMPLETED", totalPrice: 100_000, customerName: "Ержан", customerPhone: "+77011234567", address: "Алматы, Абая 1" }
    await prisma.kaspiOrder.createMany({
      data: [
        { ...base, kaspiId: "a1", code: "1", state: "ARCHIVE", orderedAt: new Date(NOW - 100 * 86_400_000) },
        { ...base, kaspiId: "a2", code: "2", state: "ARCHIVE", orderedAt: new Date(NOW - 30 * 86_400_000) },
        { ...base, kaspiId: "a3", code: "3", state: "DELIVERY", status: "ACCEPTED_BY_MERCHANT", orderedAt: new Date(NOW - 100 * 86_400_000) },
      ],
    })
    await syncAllKaspiShops()
    expect(await prisma.kaspiOrder.findFirstOrThrow({ where: { kaspiId: "a1" } })).toMatchObject({ code: "1", totalPrice: 100_000, customerName: "Ержан", customerPhone: null, address: null })
    expect(await prisma.kaspiOrder.findFirstOrThrow({ where: { kaspiId: "a2" } })).toMatchObject({ customerPhone: "+77011234567", address: "Алматы, Абая 1" })
    expect(await prisma.kaspiOrder.findFirstOrThrow({ where: { kaspiId: "a3" } })).toMatchObject({ customerPhone: "+77011234567" })
    expect(await purgeOldKaspiPii()).toBe(0)
  })
})
