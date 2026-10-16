import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { normalizeCustomerPhone } from "@/lib/customers"
import { sellPhoneAction } from "@/server/actions/phones"
import { updateSaleInfoAction } from "@/server/actions/sales"
import { searchCustomersAction, updateCustomerAction } from "@/server/actions/customers"
import { findOrCreateCustomer, getCustomer, listCustomers } from "@/server/customers"
import { createPhone, createUser, loginAs, saleForm } from "../support/factories"

async function shop() {
  const user = await createUser()
  await loginAs(user)
  return user
}

async function sell(ownerId: string, form: Record<string, unknown>) {
  const phone = await createPhone(ownerId)
  const r = await sellPhoneAction(phone.id, saleForm(form))
  expect(r.ok).toBe(true)
  return prisma.sale.findFirstOrThrow({ where: { phoneId: phone.id } })
}

describe("клиент при продаже", () => {
  it("один клиент на номер, в каком бы виде его ни ввели", async () => {
    const user = await shop()
    const a = await sell(user.id, { buyerName: "Ержан", buyerPhone: "8 (701) 123-45-67" })
    const b = await sell(user.id, { buyerName: "Ержан А.", buyerPhone: "+7 701 123 45 67" })
    const c = await sell(user.id, { buyerName: "", buyerPhone: "701 123 45 67" })
    const customers = await prisma.customer.findMany({ where: { ownerId: user.id } })
    expect(customers).toHaveLength(1)
    expect(customers[0]).toMatchObject({ phone: "+77011234567", name: "Ержан" })
    expect([a.customerId, b.customerId, c.customerId]).toEqual([customers[0].id, customers[0].id, customers[0].id])
    // в продаже остаётся то, что ввели
    expect(a.buyerPhone).toBe("8 (701) 123-45-67")
  })

  it("без номера или с непонятным номером — продажа без клиента", async () => {
    const user = await shop()
    expect((await sell(user.id, { buyerName: "Ержан", buyerPhone: "" })).customerId).toBeNull()
    expect((await sell(user.id, { buyerName: "Ержан", buyerPhone: "12345" })).customerId).toBeNull()
    expect(await prisma.customer.count()).toBe(0)
  })

  it("клиенты разных магазинов не смешиваются", async () => {
    const a = await shop()
    await sell(a.id, { buyerPhone: "87011234567" })
    const b = await shop()
    await sell(b.id, { buyerPhone: "87011234567" })
    expect(await prisma.customer.count()).toBe(2)
    expect(await searchCustomersAction("701")).toHaveLength(1)
  })

  it("клиент без имени получает имя со следующей продажи", async () => {
    const user = await shop()
    await sell(user.id, { buyerName: "", buyerPhone: "87011234567" })
    expect((await prisma.customer.findFirstOrThrow()).name).toBe("Без имени")
    await sell(user.id, { buyerName: "Айгуль", buyerPhone: "87011234567" })
    expect((await prisma.customer.findFirstOrThrow()).name).toBe("Айгуль")
  })

  it("одновременные продажи одному покупателю — один клиент", async () => {
    const user = await shop()
    const ids = await Promise.all(
      Array.from({ length: 5 }, () => prisma.$transaction((tx) => findOrCreateCustomer(tx, user.id, "Ержан", "+77011234567")))
    )
    expect(new Set(ids).size).toBe(1)
    expect(await prisma.customer.count()).toBe(1)
  })

  it("смена номера в продаже переносит её к другому клиенту", async () => {
    const user = await shop()
    const sale = await sell(user.id, { buyerName: "Ержан", buyerPhone: "87011234567" })
    const r = await updateSaleInfoAction(sale.id, { buyerName: "Ержан", buyerPhone: "87772223344", dueDate: "", note: "" })
    expect(r.ok).toBe(true)
    const updated = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { customer: true } })
    expect(updated.customer?.phone).toBe("+77772223344")
  })

  it("Telegram-бот и Kaspi продают через sellPhoneAction — клиент привязывается так же", async () => {
    // путь бота: flow-sell вызывает sellPhoneAction с null вместо пустых строк
    const user = await shop()
    const phone = await createPhone(user.id)
    const r = await sellPhoneAction(phone.id, {
      salePrice: 300_000,
      soldAt: "2026-10-10",
      buyerName: "Дана",
      buyerPhone: "87015556677",
      paymentMethod: "DEBT",
      paidNow: 0,
      prepayMethod: "CASH",
      dueDate: null,
      note: null,
    })
    expect(r.ok).toBe(true)
    const sale = await prisma.sale.findFirstOrThrow({ where: { phoneId: phone.id }, include: { customer: true } })
    expect(sale.customer).toMatchObject({ name: "Дана", phone: "+77015556677", ownerId: user.id })
  })
})

describe("список и карточка клиента", () => {
  it("сумма покупок и долг: отменённые продажи не считаются", async () => {
    const user = await shop()
    await sell(user.id, { buyerName: "Ержан", buyerPhone: "87011234567", salePrice: "500000" })
    await sell(user.id, { buyerName: "Ержан", buyerPhone: "87011234567", salePrice: "300000", paymentMethod: "DEBT", paidNow: "100000", soldAt: "2026-10-12" })
    const cancelled = await sell(user.id, { buyerName: "Ержан", buyerPhone: "87011234567", salePrice: "200000", paymentMethod: "DEBT", soldAt: "2026-10-14" })
    await prisma.sale.update({ where: { id: cancelled.id }, data: { cancelledAt: new Date() } })
    await sell(user.id, { buyerName: "Айгуль", buyerPhone: "87770000000", salePrice: "100000" })

    const { items, total } = await listCustomers(user.id)
    expect(total).toBe(2)
    const erzhan = items.find((c) => c.name === "Ержан")!
    expect(erzhan).toMatchObject({ purchaseCount: 2, purchaseSum: 800_000, debt: 200_000 })
    expect(erzhan.lastPurchaseAt?.toISOString().slice(0, 10)).toBe("2026-10-12")

    const card = await getCustomer(erzhan.id, user.id)
    expect(card?.sales).toHaveLength(3)
    expect(card?.totals).toMatchObject({ purchaseCount: 2, purchaseSum: 800_000, paidSum: 600_000, debt: 200_000 })
  })

  it("поиск по имени и номеру (с 8 в начале)", async () => {
    const user = await shop()
    await sell(user.id, { buyerName: "Ержан", buyerPhone: "87011234567" })
    await sell(user.id, { buyerName: "Айгуль", buyerPhone: "87770000000" })
    expect((await listCustomers(user.id, { q: "ерж" })).items.map((c) => c.name)).toEqual(["Ержан"])
    expect((await listCustomers(user.id, { q: "8701 123" })).items.map((c) => c.name)).toEqual(["Ержан"])
    expect((await listCustomers(user.id, { q: "0000" })).items.map((c) => c.name)).toEqual(["Айгуль"])
    expect((await searchCustomersAction("айг")).map((c) => c.name)).toEqual(["Айгуль"])
  })

  it("чужого клиента не видно и не изменить", async () => {
    const owner = await shop()
    await sell(owner.id, { buyerName: "Ержан", buyerPhone: "87011234567" })
    const customer = await prisma.customer.findFirstOrThrow()
    const other = await shop()
    expect(await getCustomer(customer.id, other.id)).toBeNull()
    expect(await updateCustomerAction(customer.id, { name: "Взлом", note: "" })).toEqual({ ok: false, error: "Клиент не найден" })
    expect(await searchCustomersAction("ерж")).toEqual([])

    await loginAs(owner)
    expect((await updateCustomerAction(customer.id, { name: "Ержан Ахметов", note: "постоянный" })).ok).toBe(true)
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).toMatchObject({ name: "Ержан Ахметов", note: "постоянный" })
  })
})

/** Перенос старых продаж — тот же SQL, что в миграции */
function backfillStatements() {
  const sql = readFileSync("prisma/migrations/20261017050000_customers/migration.sql", "utf8")
  const block = sql.split("-- backfill:start")[1].split("-- backfill:end")[0]
  return block
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

async function runBackfill() {
  for (const stmt of backfillStatements()) await prisma.$executeRawUnsafe(stmt)
}

describe("перенос старых продаж в клиентов (миграция)", () => {
  it("группирует продажи магазина по номеру, имя — из последней продажи", async () => {
    const a = await createUser()
    const b = await createUser()
    const raw = async (ownerId: string, buyerName: string | null, buyerPhone: string | null, soldAt: string, cancelled = false) => {
      const phone = await createPhone(ownerId)
      return prisma.sale.create({
        data: {
          phoneId: phone.id,
          salePrice: 100_000,
          soldAt: new Date(`${soldAt}T00:00:00Z`),
          paymentMethod: "CASH",
          buyerName,
          buyerPhone,
          cancelledAt: cancelled ? new Date() : null,
        },
      })
    }
    const s1 = await raw(a.id, "Ержан", "8 701 123 45 67", "2026-10-01")
    const s2 = await raw(a.id, "Ержан Ахметов", "+7(701)1234567", "2026-10-05")
    const s3 = await raw(a.id, null, "7011234567", "2026-10-07", true)
    const s4 = await raw(a.id, "  ", "87770000000", "2026-10-02")
    const s5 = await raw(a.id, "Без номера", null, "2026-10-02")
    const s6 = await raw(a.id, "Странный", "123", "2026-10-02")
    const s7 = await raw(b.id, "Другой магазин", "87011234567", "2026-10-03")

    await runBackfill()
    // повторный запуск ничего не дублирует
    await runBackfill()

    const customers = await prisma.customer.findMany({ orderBy: [{ ownerId: "asc" }, { phone: "asc" }] })
    expect(customers).toHaveLength(3)
    const byKey = new Map(customers.map((c) => [`${c.ownerId}|${c.phone}`, c]))
    const erzhan = byKey.get(`${a.id}|+77011234567`)!
    expect(erzhan.name).toBe("Ержан Ахметов")
    expect(byKey.get(`${a.id}|+77770000000`)!.name).toBe("Без имени")
    expect(byKey.get(`${b.id}|+77011234567`)!.name).toBe("Другой магазин")

    const link = async (id: string) => (await prisma.sale.findUniqueOrThrow({ where: { id } })).customerId
    expect(await link(s1.id)).toBe(erzhan.id)
    expect(await link(s2.id)).toBe(erzhan.id)
    expect(await link(s3.id)).toBe(erzhan.id) // отменённая тоже в истории клиента
    expect(await link(s4.id)).toBe(byKey.get(`${a.id}|+77770000000`)!.id)
    expect(await link(s5.id)).toBeNull()
    expect(await link(s6.id)).toBeNull()
    expect(await link(s7.id)).toBe(byKey.get(`${b.id}|+77011234567`)!.id)
  })

  it("SQL нормализует номер так же, как normalizeCustomerPhone", async () => {
    const samples = ["87011234567", "+7 701 123 45 67", "7011234567", "77011234567", "8-777-000-00-00", "123", "", "+1 202 555 0100", "870112345678"]
    const user = await createUser()
    for (const buyerPhone of samples) {
      const phone = await createPhone(user.id)
      await prisma.sale.create({ data: { phoneId: phone.id, salePrice: 1, soldAt: new Date(), paymentMethod: "CASH", buyerPhone } })
    }
    await runBackfill()
    const sales = await prisma.sale.findMany({ include: { customer: true } })
    for (const s of sales) expect(s.customer?.phone ?? null).toBe(normalizeCustomerPhone(s.buyerPhone))
  })
})
