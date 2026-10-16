import { describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { cancelSaleAction, sellPhoneAction } from "@/server/actions/phones"
import { addSalePaymentAction, deleteSalePaymentAction, updateSaleInfoAction } from "@/server/actions/sales"
import { createPhone, createUser, loginAs, saleForm } from "../support/factories"

/** Продажа в долг: 500 000, предоплата 100 000 */
async function debtSale() {
  const user = await createUser()
  await loginAs(user)
  const phone = await createPhone(user.id)
  await sellPhoneAction(phone.id, saleForm({ paymentMethod: "DEBT", paidNow: "100000", dueDate: "2026-10-20" }))
  const sale = await prisma.sale.findFirstOrThrow({ where: { phoneId: phone.id } })
  return { user, phone, sale }
}

const payment = (amount: string, extra: Record<string, unknown> = {}) => ({
  amount,
  paidAt: "2026-10-12",
  method: "CASH",
  note: "",
  dueDate: "",
  ...extra,
})

describe("оплата долга", () => {
  it("частями, пока долг не закроется", async () => {
    const { sale } = await debtSale()
    expect((await addSalePaymentAction(sale.id, payment("150 000", { dueDate: "2026-10-25" }))).ok).toBe(true)
    let s = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })
    expect(s.paidAmount).toBe(250_000)
    expect(s.dueDate?.toISOString().slice(0, 10)).toBe("2026-10-25")

    expect((await addSalePaymentAction(sale.id, payment("250000"))).ok).toBe(true)
    s = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })
    expect(s.paidAmount).toBe(500_000)
    expect(await prisma.salePayment.count({ where: { saleId: sale.id } })).toBe(3)

    const last = await prisma.phoneEvent.findFirstOrThrow({ where: { type: "SALE_PAYMENT" }, orderBy: { createdAt: "desc" } })
    expect(last.message).toContain("Долг закрыт")
    expect(await addSalePaymentAction(sale.id, payment("1"))).toMatchObject({ ok: false })
  })

  it("больше долга принять нельзя", async () => {
    const { sale } = await debtSale()
    const r = await addSalePaymentAction(sale.id, payment("400 001"))
    expect(r).toMatchObject({ ok: false, fieldErrors: { amount: "Долг всего 400 000 ₸" } })
  })

  it("две одновременные оплаты не переплачивают долг", async () => {
    const { sale } = await debtSale()
    // долг 400 000: каждая по отдельности проходит, вместе — нет
    const results = await Promise.all([
      addSalePaymentAction(sale.id, payment("300000")),
      addSalePaymentAction(sale.id, payment("300000")),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false, error: "Сумма больше остатка долга" })

    const s = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })
    expect(s.paidAmount).toBe(400_000)
    expect(await prisma.salePayment.count({ where: { saleId: sale.id } })).toBe(2)
    expect(await prisma.phoneEvent.count({ where: { type: "SALE_PAYMENT" } })).toBe(1)
  })

  it("одновременные оплаты, которые вместе укладываются в долг, проходят обе", async () => {
    const { sale } = await debtSale()
    const results = await Promise.all([
      addSalePaymentAction(sale.id, payment("150000")),
      addSalePaymentAction(sale.id, payment("250000")),
    ])
    expect(results.every((r) => r.ok)).toBe(true)
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).paidAmount).toBe(500_000)
    const events = await prisma.phoneEvent.findMany({ where: { type: "SALE_PAYMENT" } })
    expect(events.filter((e) => e.message.includes("Долг закрыт"))).toHaveLength(1)
  })

  it("по отменённой продаже оплату не принимает", async () => {
    const { sale, phone } = await debtSale()
    await cancelSaleAction(phone.id)
    expect(await addSalePaymentAction(sale.id, payment("1000"))).toEqual({ ok: false, error: "Продажа отменена" })
  })

  it("удалённая оплата возвращает долг", async () => {
    const { sale } = await debtSale()
    await addSalePaymentAction(sale.id, payment("50000"))
    const p = await prisma.salePayment.findFirstOrThrow({ where: { saleId: sale.id, amount: 50_000 } })
    expect((await deleteSalePaymentAction(p.id)).ok).toBe(true)
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).paidAmount).toBe(100_000)
  })

  it("чужую продажу не видно", async () => {
    const { sale } = await debtSale()
    await loginAs(await createUser())
    expect(await addSalePaymentAction(sale.id, payment("1000"))).toEqual({ ok: false, error: "Продажа не найдена" })
  })

  it("у продажи с долгом нельзя стереть покупателя", async () => {
    const { sale } = await debtSale()
    const r = await updateSaleInfoAction(sale.id, { buyerName: "", buyerPhone: "", dueDate: "", note: "" })
    expect(r).toMatchObject({ ok: false, fieldErrors: { buyerName: expect.any(String) } })
  })
})
