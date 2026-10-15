import { describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { resolvePeriod } from "@/lib/analytics-period"
import { ymdToDate } from "@/lib/dates"
import { getAnalytics, getEarliestActivity } from "@/server/analytics"
import { createPhone, createUser } from "../support/factories"

const d = (ymd: string) => ymdToDate(ymd)

async function scenario() {
  const company = await createUser()
  const other = await createUser()
  const agent = await createUser({ role: "VERIFIER", name: "Madi" })
  const person = await prisma.verifier.create({ data: { ownerId: company.id, fullName: "Дана" } })

  const p1 = await createPhone(company.id, { model: "iPhone 15", supplier: "A", purchasePrice: 100, receivedAt: d("2026-10-02"), status: "SOLD" })
  const p2 = await createPhone(company.id, { model: "Galaxy S24", supplier: "A", purchasePrice: 200, receivedAt: d("2026-10-03"), status: "SOLD" })
  const p3 = await createPhone(company.id, { model: "Pixel 8", supplier: "B", purchasePrice: 300, receivedAt: d("2026-10-04") })
  const old = await createPhone(company.id, { model: "iPhone 13", supplier: "A", purchasePrice: 50, receivedAt: d("2026-09-10"), status: "SOLD" })
  const foreign = await createPhone(other.id, { purchasePrice: 999, receivedAt: d("2026-10-05"), status: "SOLD" })

  const sale = (phoneId: string, salePrice: number, soldAt: string, extra = {}) =>
    prisma.sale.create({ data: { phoneId, salePrice, paidAmount: salePrice, soldAt: d(soldAt), paymentMethod: "CASH", ...extra } })
  await sale(p1.id, 150, "2026-10-05")
  await sale(p2.id, 300, "2026-10-20", { paymentMethod: "DEBT", paidAmount: 100 })
  await sale(old.id, 80, "2026-09-15")
  await sale(p3.id, 1000, "2026-10-06", { cancelledAt: new Date() }) // отменена — не в счёт
  await sale(foreign.id, 5000, "2026-10-06")

  const ver = (phoneId: string, extra: Record<string, unknown>) =>
    prisma.verification.create({ data: { ownerId: company.id, phoneId, phoneModel: "x", imei1: "1", handedAt: d("2026-10-02"), ...extra } })
  await ver(p1.id, {
    agentId: agent.id, handedAt: d("2026-10-06"), status: "VERIFIED", completedAt: d("2026-10-10"),
    agentFee: 25_000, agentPaid: true, agentPaidAt: new Date("2026-10-11T10:00:00Z"),
  })
  await ver(p2.id, { agentId: agent.id, handedAt: d("2026-10-21"), status: "HANDED", agentFee: 25_000 })
  await ver(p3.id, { verifierId: person.id, status: "REJECTED", completedAt: d("2026-10-03"), payment: 10_000 })
  return { company, agent, person }
}

const october = () => resolvePeriod({ from: "2026-10-01", to: "2026-10-31" }, null, d("2026-10-31"))

describe("аналитика", () => {
  it("считает продажи, закупки, верификации и выплаты за период", async () => {
    const { company } = await scenario()
    const a = await getAnalytics(company.id, october())

    expect(a.current).toMatchObject({
      revenue: 450, profit: 150, soldCount: 2, avgCheck: 225, buyersOwe: 200,
      purchasedCount: 3, purchasedSum: 600,
      handed: 3, verified: 1, notRegistered: 0, rejected: 1,
      paidToAgents: 25_000, paidToPeople: 0, paidTotal: 25_000, netProfit: 150 - 25_000,
    })
    expect(a.current.margin).toBeCloseTo(33.33, 1)
    expect(a.empty).toBe(false)
  })

  it("сравнивает с предыдущим периодом той же длины", async () => {
    const { company } = await scenario()
    const a = await getAnalytics(company.id, october())
    expect(a.previous).toMatchObject({ revenue: 80, profit: 30, soldCount: 1, purchasedCount: 1, purchasedSum: 50 })
    // «Всё время» не сравнивается
    const all = resolvePeriod({ range: "all" }, d("2026-09-01"), d("2026-10-31"))
    expect((await getAnalytics(company.id, all)).previous).toBeNull()
  })

  it("раскладывает по дням, нули тоже", async () => {
    const { company } = await scenario()
    const { series } = await getAnalytics(company.id, october())
    expect(series.buckets).toHaveLength(31)
    expect(series.revenue[4]).toBe(150) // 5 октября
    expect(series.revenue[19]).toBe(300) // 20 октября
    expect(series.revenue.reduce((x, y) => x + y)).toBe(450)
    expect(series.verified[9]).toBe(1)
    expect(series.rejected[2]).toBe(1)
    expect(series.paidAgents[10]).toBe(25_000) // 11 октября
  })

  it("разрезы: модели, поставщики, способы оплаты", async () => {
    const { company } = await scenario()
    const a = await getAnalytics(company.id, october())
    expect(a.models.map((m) => [m.model, m.count, m.profit])).toEqual([["Galaxy S24", 1, 100], ["iPhone 15", 1, 50]])
    expect(a.suppliers).toHaveLength(2)
    expect(a.suppliers).toEqual(
      expect.arrayContaining([
        { supplier: "A", count: 2, sum: 300, sold: 2, profit: 150 },
        { supplier: "B", count: 1, sum: 300, sold: 0, profit: 0 },
      ])
    )
    expect(a.methods).toEqual([
      { method: "DEBT", count: 1, revenue: 300 },
      { method: "CASH", count: 1, revenue: 150 },
    ])
  })

  it("верификаторы и люди: за период и «сейчас»", async () => {
    const { company } = await scenario()
    const a = await getAnalytics(company.id, october())
    expect(a.agents).toEqual([
      { id: expect.any(String), name: "Madi", handed: 2, verified: 1, notRegistered: 0, rejected: 0, active: 1, paid: 25_000, debt: 25_000 },
    ])
    // за отказ долг человеку не считается
    expect(a.people).toEqual([
      { id: expect.any(String), name: "Дана", handed: 1, verified: 0, notRegistered: 0, rejected: 1, active: 0, paid: 0, debt: 0 },
    ])
    expect(a.now).toMatchObject({ buyersDebt: 200, buyersDebtCount: 1, debtToAgents: 25_000, debtToPeople: 0, onVerification: 1 })
  })

  it("чужие данные не попадают, пустой период — empty", async () => {
    const { company } = await scenario()
    const stranger = await createUser()
    const a = await getAnalytics(stranger.id, october())
    expect(a.empty).toBe(true)
    expect(a.current.revenue).toBe(0)
    expect(await getEarliestActivity(stranger.id)).toBeNull()
    expect((await getEarliestActivity(company.id))?.toISOString().slice(0, 10)).toBe("2026-09-10")
  })
})
