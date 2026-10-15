import { describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { buildPhoneOrderBy, buildPhoneWhere, parsePhoneFilters, phoneFiltersToParams } from "@/server/phone-filters"
import { createPhone, createUser } from "../support/factories"

async function search(userId: string, params: Record<string, string>) {
  const f = parsePhoneFilters(params)
  const phones = await prisma.phone.findMany({ where: buildPhoneWhere(f, userId), orderBy: buildPhoneOrderBy(f.sort) })
  return phones.map((p) => p.model)
}

describe("фильтры товаров", () => {
  it("мусор в адресной строке заменяется значениями по умолчанию", () => {
    const f = parsePhoneFilters({ status: "HACK", sort: "drop table", from: "вчера", page: "-3", brand: "nope", q: "  15 " })
    expect(f).toMatchObject({ status: "", sort: "received_desc", from: "", page: 1, brand: "", q: "15" })
    expect(phoneFiltersToParams(f)).toEqual({ q: "15", status: undefined, brand: undefined, model: undefined, period: undefined, from: undefined, to: undefined, sort: undefined })
  })

  it("поиск по модели, части IMEI, марке и периоду", async () => {
    const user = await createUser()
    await createPhone(user.id, { model: "iPhone 15 Pro", imei1: "350000000000017", receivedAt: new Date("2026-10-01T00:00:00Z"), purchasePrice: 500 })
    await createPhone(user.id, { model: "Samsung Galaxy S24", imei1: "350000000000025", receivedAt: new Date("2026-10-05T00:00:00Z"), purchasePrice: 300 })
    await createPhone(user.id, { model: "Nokia 3310", imei1: "350000000000033", receivedAt: new Date("2026-09-01T00:00:00Z"), purchasePrice: 100 })

    expect(await search(user.id, { q: "iphone" })).toEqual(["iPhone 15 Pro"])
    expect(await search(user.id, { q: "0000 25" })).toEqual(["Samsung Galaxy S24"])
    expect(await search(user.id, { brand: "other" })).toEqual(["Nokia 3310"])
    expect(await search(user.id, { from: "2026-10-01", to: "2026-10-04" })).toEqual(["iPhone 15 Pro"])
    expect(await search(user.id, { sort: "price_asc" })).toEqual(["Nokia 3310", "Samsung Galaxy S24", "iPhone 15 Pro"])
  })

  it("чужие телефоны не видны; верификатор видит переданные ему, но не ищет по покупателю", async () => {
    const company = await createUser()
    const agent = await createUser({ role: "VERIFIER" })
    const phone = await createPhone(company.id, { model: "iPhone 14", status: "SOLD" })
    await createPhone(company.id, { model: "iPhone 13" })
    await prisma.sale.create({ data: { phoneId: phone.id, salePrice: 1, soldAt: new Date(), paymentMethod: "CASH", buyerName: "Ержан" } })
    await prisma.verification.create({
      data: { ownerId: company.id, agentId: agent.id, phoneId: phone.id, phoneModel: phone.model, imei1: phone.imei1, handedAt: new Date() },
    })

    expect(await search((await createUser()).id, {})).toEqual([])
    expect(await search(agent.id, {})).toEqual(["iPhone 14"])
    expect(await search(company.id, { q: "ержан" })).toEqual(["iPhone 14"])
    expect(await search(agent.id, { q: "ержан" })).toEqual([])
  })

  it("«На верификации» — проданные телефоны у верификатора, а не только статус", async () => {
    const user = await createUser()
    const handed = await createPhone(user.id, { model: "Отдан", status: "SOLD" })
    const done = await createPhone(user.id, { model: "Верифицирован", status: "SOLD" })
    await createPhone(user.id, { model: "Продан", status: "SOLD" })
    await createPhone(user.id, { model: "Старый статус", status: "ON_VERIFICATION" })
    const v = (phoneId: string, status: "HANDED" | "VERIFIED") =>
      prisma.verification.create({ data: { ownerId: user.id, phoneId, phoneModel: "x", imei1: "1", handedAt: new Date(), status } })
    await v(handed.id, "HANDED")
    await v(done.id, "VERIFIED")

    expect((await search(user.id, { status: "ON_VERIFICATION" })).sort()).toEqual(["Отдан", "Старый статус"])
    expect(await search(user.id, { status: "SOLD" })).toHaveLength(3)
  })

  it("поиск по поставщику и дате (поступления и продажи)", async () => {
    const user = await createUser()
    const other = await createUser()
    const a = await createPhone(user.id, { model: "A", supplier: "Алмас (Дубай)", receivedAt: new Date("2026-10-07T00:00:00Z") })
    await createPhone(user.id, { model: "B", supplier: "Нурлан", receivedAt: new Date("2026-10-08T00:00:00Z") })
    await createPhone(other.id, { model: "Чужой", supplier: "Алмас", receivedAt: new Date("2026-10-07T00:00:00Z") })
    await prisma.sale.create({ data: { phoneId: a.id, salePrice: 1, soldAt: new Date("2026-10-12T00:00:00Z"), paymentMethod: "CASH" } })

    expect(await search(user.id, { q: "алмас" })).toEqual(["A"])
    expect(await search(user.id, { q: "07.10.2026" })).toEqual(["A"])
    expect(await search(user.id, { q: "7.10.26" })).toEqual(["A"])
    expect(await search(user.id, { q: "2026-10-08" })).toEqual(["B"])
    expect(await search(user.id, { q: "07.10" })).toEqual(["A"]) // год не указан
    expect(await search(user.id, { q: "12.10.2026" })).toEqual(["A"]) // дата продажи
    expect(await search(user.id, { q: "31.02.2026" })).toEqual([])
  })
})
