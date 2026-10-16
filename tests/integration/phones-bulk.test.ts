import { NextRequest } from "next/server"
import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { GET as exportPhones } from "@/app/api/export/phones/route"
import { bulkSetPhoneStatusAction } from "@/server/actions/phones"
import { createPhone, createUser, loginAs, makeImei } from "../support/factories"
import { RedirectError } from "../support/next-mocks"

async function shop() {
  const user = await createUser()
  await loginAs(user)
  return user
}

describe("bulkSetPhoneStatusAction", () => {
  it("без входа перенаправляет на /login", async () => {
    await expect(bulkSetPhoneStatusAction({ ids: ["x"], status: "RESERVED" })).rejects.toBeInstanceOf(RedirectError)
  })

  it("меняет статус нескольких телефонов и пишет историю", async () => {
    const user = await shop()
    const a = await createPhone(user.id)
    const b = await createPhone(user.id, { status: "RETURNED" })
    const r = await bulkSetPhoneStatusAction({ ids: [a.id, b.id, a.id], status: "RESERVED" })
    expect(r).toEqual({ ok: true, data: { changed: 2, skipped: 0 } })

    const phones = await prisma.phone.findMany({ where: { id: { in: [a.id, b.id] } }, include: { events: true } })
    for (const p of phones) {
      expect(p.status).toBe("RESERVED")
      expect(p.events).toHaveLength(1)
      expect(p.events[0]).toMatchObject({ type: "STATUS_CHANGED", userId: user.id })
    }
    expect(phones.find((p) => p.id === b.id)!.events[0].message).toBe("Статус: Возврат → Резерв")
  })

  it("проданные пропускает — их статус меняется только отменой продажи", async () => {
    const user = await shop()
    const sold = await createPhone(user.id, { status: "SOLD" })
    const stock = await createPhone(user.id, { status: "RESERVED" })
    const r = await bulkSetPhoneStatusAction({ ids: [sold.id, stock.id], status: "IN_STOCK" })
    expect(r).toEqual({ ok: true, data: { changed: 1, skipped: 1 } })
    expect((await prisma.phone.findUniqueOrThrow({ where: { id: sold.id } })).status).toBe("SOLD")
    expect((await prisma.phone.findUniqueOrThrow({ where: { id: stock.id } })).status).toBe("IN_STOCK")
  })

  it("«Продан» массово не ставится", async () => {
    const user = await shop()
    const p = await createPhone(user.id)
    const r = await bulkSetPhoneStatusAction({ ids: [p.id], status: "SOLD" })
    expect(r.ok).toBe(false)
    expect((await prisma.phone.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("IN_STOCK")
  })

  it("«На верификации» без активной верификации возвращается в «В наличии» — как в форме", async () => {
    const user = await shop()
    const p = await createPhone(user.id)
    expect((await bulkSetPhoneStatusAction({ ids: [p.id], status: "ON_VERIFICATION" })).ok).toBe(true)
    expect((await prisma.phone.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("IN_STOCK")
  })

  it("чужой телефон в списке — ничего не меняет", async () => {
    const other = await createUser()
    const foreign = await createPhone(other.id, { imei1: makeImei() })
    const user = await shop()
    const own = await createPhone(user.id)
    const r = await bulkSetPhoneStatusAction({ ids: [own.id, foreign.id], status: "RESERVED" })
    expect(r.ok).toBe(false)
    expect((await prisma.phone.findUniqueOrThrow({ where: { id: own.id } })).status).toBe("IN_STOCK")
    expect((await prisma.phone.findUniqueOrThrow({ where: { id: foreign.id } })).status).toBe("IN_STOCK")
  })

  it("верификатору недоступно, пустой выбор — ошибка", async () => {
    const verifier = await createUser({ role: "VERIFIER" })
    await loginAs(verifier)
    expect((await bulkSetPhoneStatusAction({ ids: ["x"], status: "RESERVED" })).ok).toBe(false)
    await shop()
    expect((await bulkSetPhoneStatusAction({ ids: [], status: "RESERVED" })).ok).toBe(false)
  })
})

describe("выгрузка отмеченных телефонов", () => {
  it("ids в адресе — только эти телефоны и только свои", async () => {
    const other = await createUser()
    const foreign = await createPhone(other.id)
    const user = await shop()
    const a = await createPhone(user.id, { model: "iPhone 11" })
    await createPhone(user.id, { model: "iPhone 12" })
    const res = await exportPhones(new NextRequest(`http://localhost/api/export/phones?ids=${a.id},${foreign.id}`))
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await res.arrayBuffer())
    const models = wb.worksheets[0].getColumn(1).values.slice(2).map(String)
    expect(models).toEqual(["iPhone 11", "Итого: 1 шт."])
  })
})
