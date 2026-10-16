import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db"
import { GET } from "@/app/api/kaspi/feed/[token]/route"
import { connectKaspiAction } from "@/server/actions/kaspi"
import { saveKaspiFeedSettingsAction, saveKaspiOfferAction, setKaspiOfferActiveAction } from "@/server/actions/kaspi-offers"
import { buildKaspiFeed } from "@/server/kaspi-feed"
import { createPhone, createUser, loginAs } from "../support/factories"

const GOOD = "kaspi-good-token-0123456789abcdef"

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })))
})
afterEach(() => vi.unstubAllGlobals())

async function shop() {
  const user = await createUser({ companyName: "Gold & Service" })
  await loginAs(user)
  await connectKaspiAction({ token: GOOD })
  expect((await saveKaspiFeedSettingsAction({ merchantId: "30123456", storeId: "PP1" })).ok).toBe(true)
  return user
}

const offer = (extra: Record<string, unknown> = {}) => ({ sku: "IP15P256", title: "Apple iPhone 15 Pro 256GB", model: "iPhone 15 Pro", memoryGb: "256", price: "589 000", ...extra })

describe("прайс-лист Kaspi", () => {
  it("цена из прайса, остаток — телефоны «В наличии» той же модели и памяти; проданные и другие не считаются", async () => {
    const user = await shop()
    await createPhone(user.id, { model: "iPhone 15 Pro", memoryGb: 256 })
    await createPhone(user.id, { model: "iphone 15 pro ", memoryGb: 256 }) // регистр и пробелы не важны
    await createPhone(user.id, { model: "iPhone 15 Pro", memoryGb: 128 }) // другая память
    await createPhone(user.id, { model: "iPhone 15 Pro", memoryGb: 256, status: "SOLD" })
    await createPhone(user.id, { model: "iPhone 15 Pro", memoryGb: 256, status: "RESERVED" })
    expect((await saveKaspiOfferAction(null, offer())).ok).toBe(true)

    const xml = await buildKaspiFeed(user.id, new Date("2026-10-16T09:05:00Z"))
    expect(xml).toContain('<kaspi_catalog date="16.10.2026 09:05" xmlns="kaspiShopping"')
    expect(xml).toContain("<company>Gold &amp; Service</company>")
    expect(xml).toContain("<merchantid>30123456</merchantid>")
    expect(xml).toContain('<offer sku="IP15P256">')
    expect(xml).toContain("<model>Apple iPhone 15 Pro 256GB</model>")
    expect(xml).toContain("<brand>Apple</brand>")
    expect(xml).toContain('<availability available="yes" storeId="PP1" stockCount="2"/>')
    expect(xml).toContain("<price>589000</price>")
  })

  it("марка в начале модели не важна (и в прайсе, и на складе); похожие модели в остаток не идут", async () => {
    const user = await shop()
    await createPhone(user.id, { model: "Apple iPhone 15 Pro", memoryGb: 256 })
    await createPhone(user.id, { model: "iPhone  15 PRO", memoryGb: 256 })
    await createPhone(user.id, { model: "iPhone 15 Pro Max", memoryGb: 256 }) // похожая, но другая модель
    await createPhone(user.id, { model: "Galaxy S24", memoryGb: 256 })
    await saveKaspiOfferAction(null, offer({ sku: "B1" }))
    await saveKaspiOfferAction(null, offer({ sku: "B2", title: "Samsung Galaxy S24", model: "Samsung Galaxy S24" }))

    const xml = await buildKaspiFeed(user.id)
    const block = (sku: string) => xml.slice(xml.indexOf(`sku="${sku}"`), xml.indexOf("</offer>", xml.indexOf(`sku="${sku}"`)))
    expect(block("B1")).toContain('stockCount="2"')
    expect(block("B2")).toContain('stockCount="1"')
  })

  it("закончились — available=no; с предзаказом — yes и preOrder; снятый с продажи — no", async () => {
    const user = await shop()
    await saveKaspiOfferAction(null, offer({ sku: "A1" }))
    await saveKaspiOfferAction(null, offer({ sku: "A2", preOrderDays: "5" }))
    await createPhone(user.id, { model: "Pixel 8" })
    await saveKaspiOfferAction(null, offer({ sku: "A3", model: "Pixel 8", memoryGb: "" }))
    const a3 = await prisma.kaspiOffer.findFirstOrThrow({ where: { sku: "A3" } })
    await setKaspiOfferActiveAction(a3.id, false)

    const xml = await buildKaspiFeed(user.id)
    const block = (sku: string) => xml.slice(xml.indexOf(`sku="${sku}"`), xml.indexOf("</offer>", xml.indexOf(`sku="${sku}"`)))
    expect(block("A1")).toContain('available="no" storeId="PP1" stockCount="0"')
    expect(block("A2")).toContain('available="yes" storeId="PP1" preOrder="5" stockCount="0"')
    expect(block("A3")).toContain('available="no" storeId="PP1" stockCount="0"')
  })

  it("проверки: артикул латиницей до 20 знаков и без повторов, предзаказ до 30 дней", async () => {
    await shop()
    expect(await saveKaspiOfferAction(null, offer({ sku: "артикул" }))).toMatchObject({ ok: false, fieldErrors: { sku: expect.any(String) } })
    expect(await saveKaspiOfferAction(null, offer({ preOrderDays: "45" }))).toMatchObject({ ok: false, fieldErrors: { preOrderDays: expect.any(String) } })
    expect((await saveKaspiOfferAction(null, offer())).ok).toBe(true)
    expect(await saveKaspiOfferAction(null, offer())).toMatchObject({ ok: false, fieldErrors: { sku: expect.stringContaining("уже") } })
  })

  it("ссылка: по секрету — XML, без него — 404", async () => {
    const user = await shop()
    await saveKaspiOfferAction(null, offer())
    const { feedToken } = await prisma.kaspiShop.findUniqueOrThrow({ where: { ownerId: user.id } })
    const ok = await GET(new Request("http://x"), { params: Promise.resolve({ token: feedToken! }) })
    expect(ok.status).toBe(200)
    expect(ok.headers.get("content-type")).toContain("application/xml")
    expect(await ok.text()).toContain('<offer sku="IP15P256">')
    const bad = await GET(new Request("http://x"), { params: Promise.resolve({ token: "x".repeat(32) }) })
    expect(bad.status).toBe(404)
  })
})
