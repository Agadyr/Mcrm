import { describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import {
  cancelSaleAction,
  checkImeiAction,
  createPhoneAction,
  deletePhoneAction,
  sellPhoneAction,
  setRfsResultAction,
  updatePhoneAction,
} from "@/server/actions/phones"
import { createPhone, createUser, loginAs, makeImei, phoneForm, saleForm } from "../support/factories"
import { RedirectError } from "../support/next-mocks"

async function shop() {
  const user = await createUser()
  await loginAs(user)
  return user
}

describe("createPhoneAction", () => {
  it("без входа перенаправляет на /login", async () => {
    await expect(createPhoneAction(phoneForm())).rejects.toBeInstanceOf(RedirectError)
  })

  it("создаёт телефон и пишет событие в историю", async () => {
    const user = await shop()
    const r = await createPhoneAction(phoneForm({ supplier: "Алмас" }))
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const phone = await prisma.phone.findUniqueOrThrow({ where: { id: r.data.id }, include: { events: true } })
    expect(phone).toMatchObject({ ownerId: user.id, purchasePrice: 450_000, serialNumber: "F2LXK1Q9P3", memoryGb: 256 })
    expect(phone.events).toHaveLength(1)
    expect(phone.events[0]).toMatchObject({ type: "CREATED", message: "Поступил на склад от «Алмас», закупка 450 000 ₸" })
  })

  it("возвращает ошибки полей при неверных данных", async () => {
    await shop()
    const r = await createPhoneAction(phoneForm({ model: "", imei1: "abc", purchasePrice: "" }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(Object.keys(r.fieldErrors ?? {})).toEqual(expect.arrayContaining(["model", "imei1", "purchasePrice"]))
  })

  it("не даёт записать дубль IMEI (IMEI2 другого телефона)", async () => {
    const user = await shop()
    const existing = await createPhone(user.id, { imei2: makeImei() })
    const r = await createPhoneAction(phoneForm({ imei1: existing.imei2 }))
    expect(r).toMatchObject({ ok: false, fieldErrors: { imei1: expect.stringContaining(existing.imei2!) } })
  })

  it("тот же IMEI у другого магазина — не дубль", async () => {
    const other = await createUser()
    const theirs = await createPhone(other.id)
    await shop()
    expect((await createPhoneAction(phoneForm({ imei1: theirs.imei1 }))).ok).toBe(true)
  })

  it("не ставит статус «Продан» из формы", async () => {
    await shop()
    expect(await createPhoneAction(phoneForm({ status: "SOLD" }))).toMatchObject({ ok: false, fieldErrors: { status: expect.any(String) } })
  })

  it("у верификатора нет склада", async () => {
    const verifier = await createUser({ role: "VERIFIER" })
    await loginAs(verifier)
    expect(await createPhoneAction(phoneForm())).toMatchObject({ ok: false })
    expect(await prisma.phone.count()).toBe(0)
  })
})

describe("updatePhoneAction", () => {
  it("сохраняет изменения и описывает их в истории", async () => {
    const user = await shop()
    const phone = await createPhone(user.id)
    const r = await updatePhoneAction(phone.id, phoneForm({ imei1: phone.imei1, purchasePrice: "410000", color: "Белый" }))
    expect(r.ok).toBe(true)

    const event = await prisma.phoneEvent.findFirstOrThrow({ where: { phoneId: phone.id, type: "UPDATED" } })
    expect(event.message).toContain("закупка: 400 000 ₸ → 410 000 ₸")
    expect(event.message).toContain("цвет: Чёрный → Белый")
  })

  it("без изменений историю не засоряет", async () => {
    const user = await shop()
    const phone = await createPhone(user.id, { color: "Чёрный", supplier: "Алмас", serialNumber: "ABC12345" })
    await updatePhoneAction(
      phone.id,
      phoneForm({ imei1: phone.imei1, color: "Чёрный", purchasePrice: "400000", serialNumber: "abc12345", memoryGb: "256" })
    )
    expect(await prisma.phoneEvent.count({ where: { phoneId: phone.id } })).toBe(0)
  })

  it("свой IMEI не считается дублем, чужой телефон не найти", async () => {
    const owner = await createUser()
    const theirs = await createPhone(owner.id)
    const user = await shop()
    const mine = await createPhone(user.id)
    expect((await updatePhoneAction(mine.id, phoneForm({ imei1: mine.imei1 }))).ok).toBe(true)
    expect(await updatePhoneAction(theirs.id, phoneForm({ imei1: theirs.imei1 }))).toEqual({ ok: false, error: "Телефон не найден" })
  })

  it("проданный телефон остаётся проданным", async () => {
    const user = await shop()
    const phone = await createPhone(user.id, { status: "SOLD" })
    await updatePhoneAction(phone.id, phoneForm({ imei1: phone.imei1, status: "IN_STOCK" }))
    expect((await prisma.phone.findUniqueOrThrow({ where: { id: phone.id } })).status).toBe("SOLD")
  })
})

describe("checkImeiAction", () => {
  it("находит телефон с таким IMEI, кроме исключённого", async () => {
    const user = await shop()
    const phone = await createPhone(user.id)
    expect(await checkImeiAction(phone.imei1)).toMatchObject({ phoneId: phone.id, imei: phone.imei1 })
    expect(await checkImeiAction(phone.imei1, phone.id)).toBeNull()
    expect(await checkImeiAction("не imei")).toBeNull()
  })
})

describe("продажа", () => {
  it("за наличные: полная оплата, статус «Продан», история с прибылью", async () => {
    const user = await shop()
    const phone = await createPhone(user.id)
    const r = await sellPhoneAction(phone.id, saleForm({ salePrice: "500000" }))
    expect(r.ok).toBe(true)

    const sale = await prisma.sale.findFirstOrThrow({ where: { phoneId: phone.id }, include: { payments: true, phone: true } })
    expect(sale).toMatchObject({ salePrice: 500_000, paidAmount: 500_000, paymentMethod: "CASH", dueDate: null })
    expect(sale.payments).toMatchObject([{ amount: 500_000, method: "CASH" }])
    expect(sale.phone.status).toBe("SOLD")
    const event = await prisma.phoneEvent.findFirstOrThrow({ where: { phoneId: phone.id, type: "SOLD" } })
    expect(event.message).toBe("Продан 10.10.2026 за 500 000 ₸ (Наличные), покупатель: Ержан. Прибыль 100 000 ₸")
  })

  it("в долг с предоплатой: остаток и срок", async () => {
    const user = await shop()
    const phone = await createPhone(user.id)
    const r = await sellPhoneAction(
      phone.id,
      saleForm({ paymentMethod: "DEBT", paidNow: "100 000", prepayMethod: "KASPI", dueDate: "2026-10-17" })
    )
    expect(r.ok).toBe(true)
    const sale = await prisma.sale.findFirstOrThrow({ where: { phoneId: phone.id }, include: { payments: true } })
    expect(sale).toMatchObject({ paidAmount: 100_000, paymentMethod: "DEBT" })
    expect(sale.dueDate?.toISOString().slice(0, 10)).toBe("2026-10-17")
    expect(sale.payments).toMatchObject([{ amount: 100_000, method: "KASPI" }])
    const event = await prisma.phoneEvent.findFirstOrThrow({ where: { phoneId: phone.id, type: "SOLD" } })
    expect(event.message).toContain("В долг: 400 000 ₸ до 17.10.2026")
  })

  it("в долг без покупателя — ошибка", async () => {
    const user = await shop()
    const phone = await createPhone(user.id)
    const r = await sellPhoneAction(phone.id, saleForm({ paymentMethod: "DEBT", buyerName: "" }))
    expect(r).toMatchObject({ ok: false, fieldErrors: { buyerName: expect.any(String) } })
  })

  it("дважды продать нельзя", async () => {
    const user = await shop()
    const phone = await createPhone(user.id)
    expect((await sellPhoneAction(phone.id, saleForm())).ok).toBe(true)
    expect(await sellPhoneAction(phone.id, saleForm())).toEqual({ ok: false, error: "Телефон уже продан" })
    expect(await prisma.sale.count()).toBe(1)
  })

  it("отмена продажи: запись остаётся, телефон снова в наличии", async () => {
    const user = await shop()
    const phone = await createPhone(user.id)
    await sellPhoneAction(phone.id, saleForm())
    expect((await cancelSaleAction(phone.id)).ok).toBe(true)

    const sale = await prisma.sale.findFirstOrThrow({ where: { phoneId: phone.id } })
    expect(sale.cancelledAt).not.toBeNull()
    expect((await prisma.phone.findUniqueOrThrow({ where: { id: phone.id } })).status).toBe("IN_STOCK")
    expect(await cancelSaleAction(phone.id)).toEqual({ ok: false, error: "Активной продажи нет" })
    // после отмены можно продать снова
    expect((await sellPhoneAction(phone.id, saleForm())).ok).toBe(true)
  })

  it("отмена продажи телефона на верификации возвращает его на верификацию", async () => {
    const user = await shop()
    const phone = await createPhone(user.id)
    await sellPhoneAction(phone.id, saleForm())
    await prisma.verification.create({
      data: { ownerId: user.id, phoneId: phone.id, phoneModel: phone.model, imei1: phone.imei1, handedAt: new Date(), status: "HANDED" },
    })
    await cancelSaleAction(phone.id)
    expect((await prisma.phone.findUniqueOrThrow({ where: { id: phone.id } })).status).toBe("ON_VERIFICATION")
  })
})

describe("deletePhoneAction", () => {
  it("удаляет свой телефон, верификация остаётся без связи", async () => {
    const user = await shop()
    const phone = await createPhone(user.id)
    const v = await prisma.verification.create({
      data: { ownerId: user.id, phoneId: phone.id, phoneModel: phone.model, imei1: phone.imei1, handedAt: new Date() },
    })
    expect((await deletePhoneAction(phone.id)).ok).toBe(true)
    expect(await prisma.phone.count()).toBe(0)
    expect((await prisma.verification.findUniqueOrThrow({ where: { id: v.id } })).phoneId).toBeNull()
  })

  it("проданный не удаляет — сначала отмена продажи", async () => {
    const user = await shop()
    const phone = await createPhone(user.id)
    await sellPhoneAction(phone.id, saleForm())
    expect(await deletePhoneAction(phone.id)).toEqual({ ok: false, error: "Телефон продан — сначала отмените продажу" })
    expect(await prisma.sale.count()).toBe(1)

    await cancelSaleAction(phone.id)
    expect((await deletePhoneAction(phone.id)).ok).toBe(true)
    expect(await prisma.phone.count()).toBe(0)
    expect(await prisma.sale.count()).toBe(0)
  })

  it("активная продажа мешает удалению, даже если статус не «Продан»", async () => {
    const user = await shop()
    const phone = await createPhone(user.id)
    await prisma.sale.create({ data: { phoneId: phone.id, salePrice: 1, soldAt: new Date(), paymentMethod: "CASH" } })
    expect(await deletePhoneAction(phone.id)).toMatchObject({ ok: false, error: expect.stringContaining("отмените продажу") })
  })

  it("чужой телефон не удаляет", async () => {
    const other = await createUser()
    const phone = await createPhone(other.id)
    await shop()
    expect(await deletePhoneAction(phone.id)).toEqual({ ok: false, error: "Телефон не найден" })
    expect(await prisma.phone.count()).toBe(1)
  })
})

describe("setRfsResultAction", () => {
  it("сохраняет результат проверки в РФС", async () => {
    const user = await shop()
    const phone = await createPhone(user.id)
    expect((await setRfsResultAction(phone.id, "REGISTERED")).ok).toBe(true)
    const saved = await prisma.phone.findUniqueOrThrow({ where: { id: phone.id }, include: { events: true } })
    expect(saved.rfsStatus).toBe("REGISTERED")
    expect(saved.rfsCheckedAt).toBeInstanceOf(Date)
    expect(saved.events[0].message).toBe("Проверка IMEI в РФС: зарегистрирован")
  })

  it("верификатор, которому передан телефон, тоже может отметить", async () => {
    const company = await createUser()
    const agent = await createUser({ role: "VERIFIER" })
    const phone = await createPhone(company.id)
    await prisma.verification.create({
      data: { ownerId: company.id, agentId: agent.id, phoneId: phone.id, phoneModel: phone.model, imei1: phone.imei1, handedAt: new Date() },
    })
    await loginAs(agent)
    expect((await setRfsResultAction(phone.id, "NOT_REGISTERED")).ok).toBe(true)
  })

  it("посторонний и неверное значение — отказ", async () => {
    const other = await createUser()
    const phone = await createPhone(other.id)
    await shop()
    expect(await setRfsResultAction(phone.id, "REGISTERED")).toMatchObject({ ok: false })
    expect(await setRfsResultAction(phone.id, "MAYBE")).toMatchObject({ ok: false })
  })
})
