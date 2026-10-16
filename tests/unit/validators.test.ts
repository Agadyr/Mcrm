import { describe, expect, it } from "vitest"
import { fieldErrorsOf, money } from "@/lib/validators/common"
import { phoneSchema, saleSchema } from "@/lib/validators/phone"
import { createUserSchema, generatePassword, profileSchema, verifierSignupSchema } from "@/lib/validators/user"
import { batchHandoverSchema, missingForVerification, verificationSchema } from "@/lib/validators/verification"
import { saleCreateData } from "@/server/sale-data"

const phone = {
  model: " iPhone 15 ",
  memoryGb: "128",
  color: "",
  imei1: "4901 5420 3237 518",
  imei2: "",
  serialNumber: "abc12345",
  condition: "NEW",
  purchasePrice: "450 000 ₸",
  receivedAt: "2026-10-01",
  supplier: "",
  note: "",
  status: "IN_STOCK",
}

const sale = {
  salePrice: "500000",
  soldAt: "2026-10-10",
  buyerName: "",
  paymentMethod: "CASH",
  paidNow: "",
  dueDate: "",
}

describe("суммы", () => {
  it.each([
    ["450 000", 450_000],
    ["450,000 ₸", 450_000],
    [0, 0],
  ])("money(%j) → %d", (input, expected) => {
    expect(money().parse(input)).toBe(expected)
  })

  it.each(["", "-5", "12.5", "abc", 2_000_000_000])("money(%j) — ошибка", (input) => {
    expect(money().safeParse(input).success).toBe(false)
  })
})

describe("phoneSchema", () => {
  it("нормализует данные формы", () => {
    const d = phoneSchema.parse(phone)
    expect(d).toMatchObject({
      model: "iPhone 15",
      memoryGb: 128,
      color: null,
      imei1: "490154203237518",
      imei2: null,
      serialNumber: "ABC12345",
      purchasePrice: 450_000,
    })
    expect(d.receivedAt.toISOString()).toBe("2026-10-01T00:00:00.000Z")
  })

  it("IMEI2 не может совпадать с IMEI1", () => {
    const r = phoneSchema.safeParse({ ...phone, imei2: "490154203237518" })
    expect(r.success).toBe(false)
    if (!r.success) expect(fieldErrorsOf(r.error)).toEqual({ imei2: "IMEI2 совпадает с IMEI1" })
  })

  it("IMEI с неверной контрольной цифрой сохранить можно (только предупреждение)", () => {
    expect(phoneSchema.safeParse({ ...phone, imei1: "123" }).success).toBe(true)
  })
})

describe("saleSchema", () => {
  it("обычная продажа", () => {
    expect(saleSchema.parse(sale)).toMatchObject({ salePrice: 500_000, paidNow: 0, prepayMethod: "CASH" })
  })

  it("в долг: нужен покупатель, предоплата меньше цены, срок не раньше продажи", () => {
    const r = saleSchema.safeParse({ ...sale, paymentMethod: "DEBT", paidNow: "500000", dueDate: "2026-10-01" })
    expect(r.success).toBe(false)
    if (!r.success) expect(Object.keys(fieldErrorsOf(r.error)).sort()).toEqual(["buyerName", "dueDate", "paidNow"])
  })

  it("saleCreateData: первая оплата — предоплата или вся сумма", () => {
    const cash = saleCreateData(saleSchema.parse({ ...sale, paymentMethod: "KASPI" }))
    expect(cash).toMatchObject({ paidAmount: 500_000, dueDate: null, payments: { create: { amount: 500_000, method: "KASPI" } } })

    const debt = saleCreateData(
      saleSchema.parse({ ...sale, paymentMethod: "DEBT", buyerName: "Тима", dueDate: "2026-10-20" })
    )
    expect(debt.paidAmount).toBe(0)
    expect(debt).not.toHaveProperty("payments")
    expect(debt.dueDate?.toISOString().slice(0, 10)).toBe("2026-10-20")
  })
})

describe("пользователи", () => {
  it("логин: латиница, приводится к нижнему регистру", () => {
    expect(createUserSchema.parse({ login: " Shop_1 ", password: "secret12", role: "USER" }).login).toBe("shop_1")
    expect(createUserSchema.safeParse({ login: "магазин", password: "secret12", role: "USER" }).success).toBe(false)
  })

  it("телефон в профиле", () => {
    expect(profileSchema.safeParse({ companyName: "", name: "Айдос", phone: "+7 (701) 123-45-67" }).success).toBe(true)
    expect(profileSchema.safeParse({ companyName: "", name: "Айдос", phone: "12345" }).success).toBe(false)
  })

  it("пароль — минимум 8 символов", () => {
    expect(createUserSchema.safeParse({ login: "shop", password: "1234567", role: "USER" }).success).toBe(false)
    expect(createUserSchema.safeParse({ login: "shop", password: "12345678", role: "USER" }).success).toBe(true)
  })

  it("пароли при регистрации должны совпадать", () => {
    const r = verifierSignupSchema.safeParse({ name: "Айдос", phone: "87011234567", login: "aidos", password: "secret12", confirmPassword: "secret21" })
    expect(r.success).toBe(false)
  })

  it("generatePassword без похожих символов", () => {
    const p = generatePassword(200)
    expect(p).toHaveLength(200)
    expect(p).not.toMatch(/[01ilo]/)
  })
})

describe("верификация", () => {
  const base = { phoneMode: "manual", verifierMode: "new", verifierName: "Дана", handedAt: "2026-10-01", status: "HANDED" }

  it("клиентский телефон: нужны модель, оба IMEI и серийник", () => {
    const r = verificationSchema.safeParse(base)
    expect(r.success).toBe(false)
    if (!r.success) expect(Object.keys(fieldErrorsOf(r.error)).sort()).toEqual(["imei1", "imei2", "phoneModel", "serialNumber"])
  })

  it("missingForVerification", () => {
    expect(missingForVerification({ imei1: "1", imei2: null, serialNumber: null })).toEqual(["IMEI2", "серийный номер"])
  })

  it("пакетная передача ловит повторы", () => {
    const item = { phoneModel: "iPhone", imei1: "111", imei2: "222", serialNumber: "SN12345" }
    const r = batchHandoverSchema.safeParse({
      agentId: "a1",
      handedAt: "2026-10-01",
      items: [item, { ...item, serialNumber: "SN99999" }, { phoneId: "p1" }, { phoneId: "p1" }],
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      const errors = fieldErrorsOf(r.error)
      expect(errors["items.1.imei1"]).toBe("Такой IMEI уже есть в строке 1")
      expect(errors["items.3.phoneId"]).toBe("Этот телефон уже есть в списке")
    }
  })
})
