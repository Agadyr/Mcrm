import { describe, expect, it } from "vitest"
import { phoneText, waLink, waNumber } from "@/lib/whatsapp"
import { brandByKey, detectBrand, shortModelName } from "@/lib/brands"
import { guessMapping } from "@/lib/import-fields"
import { signSession, verifySession } from "@/lib/session"
import { SignJWT } from "jose"

describe("WhatsApp", () => {
  it.each([
    ["8 701 123 45 67", "77011234567"],
    ["+7 (701) 123-45-67", "77011234567"],
    ["701 123 45 67", "77011234567"],
    ["123", null],
    [null, null],
  ])("waNumber(%j)", (input, expected) => {
    expect(waNumber(input)).toBe(expected)
  })

  it("ссылка с текстом", () => {
    expect(waLink("87011234567", "Привет!")).toBe("https://wa.me/77011234567?text=%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82!")
    expect(waLink("")).toBeNull()
    expect(phoneText({ phoneModel: "iPhone 15", imei1: "1", imei2: null, serialNumber: "SN" })).toBe("iPhone 15\nIMEI1: 1\nS/N: SN")
  })
})

describe("марки", () => {
  it("определяет марку по модели", () => {
    expect(detectBrand("iPhone 15 Pro").key).toBe("apple")
    expect(detectBrand(" Galaxy S24").key).toBe("samsung")
    expect(detectBrand("Redmi Note 13").key).toBe("xiaomi")
    expect(detectBrand("Nokia 3310").key).toBe("other")
    expect(brandByKey("other")?.label).toBe("Другие")
    expect(brandByKey("nope")).toBeUndefined()
    expect(shortModelName("Samsung Galaxy S24")).toBe("Galaxy S24")
    expect(shortModelName("iPhone 15")).toBe("iPhone 15")
  })
})

describe("сопоставление колонок Excel", () => {
  it("точные совпадения важнее частичных, колонка используется один раз", () => {
    const m = guessMapping(["№", "Модель", "IMEI 1", "IMEI 2", "Цена закупки", "Цена продажи", "Дата продажи", "Дата"])
    expect(m).toMatchObject({ model: 1, imei1: 2, imei2: 3, purchasePrice: 4, salePrice: 5, soldAt: 6, receivedAt: 7 })
  })
})

describe("сессионный токен", () => {
  it("подписывается и проверяется", async () => {
    const token = await signSession({ sub: "u1", login: "shop", v: 3 })
    expect(await verifySession(token)).toEqual({ sub: "u1", login: "shop", v: 3 })
  })

  it("чужой секрет, мусор и неполный токен отклоняются", async () => {
    const foreign = await new SignJWT({ login: "x", v: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .sign(new TextEncoder().encode("other-secret"))
    expect(await verifySession(foreign)).toBeNull()
    expect(await verifySession("garbage")).toBeNull()
    expect(await verifySession(undefined)).toBeNull()
    const noVersion = await new SignJWT({ login: "x" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET))
    expect(await verifySession(noVersion)).toBeNull()
  })
})
