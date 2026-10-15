import { describe, expect, it } from "vitest"
import { extractImeis, looksLikeImei, parseMemory, parseMoney, parsePhoneText } from "@/server/telegram-bot/parse"

describe("разбор сообщений боту", () => {
  it.each([
    ["450000", 450_000],
    ["450 000", 450_000],
    ["450к", 450_000],
    ["450 k", 450_000],
    ["1,2 млн", 1_200_000],
    ["25 000 ₸", 25_000],
    ["абв", null],
  ])("сумма «%s» → %s", (text, expected) => {
    expect(parseMoney(text)).toBe(expected)
  })

  it("два IMEI одним сообщением — через пробел, запятую или с новой строки", () => {
    expect(extractImeis("356789000010049 356789000010056")).toEqual(["356789000010049", "356789000010056"])
    expect(extractImeis("356789000010049,\n356789000010056")).toEqual(["356789000010049", "356789000010056"])
  })

  it("один IMEI группами цифр и с дефисами", () => {
    expect(extractImeis("35 678900 001004 9")).toEqual(["356789000010049"])
    expect(extractImeis("35-678900-001004-9")).toEqual(["356789000010049"])
    expect(extractImeis("iPhone")).toEqual([])
  })

  it("похоже на IMEI — 15 цифр", () => {
    expect(looksLikeImei("356789000010049")).toBe(true)
    expect(looksLikeImei("0049")).toBe(false)
  })

  it("память: 256, 256gb, 1 ТБ; странные числа — нет", () => {
    expect(parseMemory("256")).toBe(256)
    expect(parseMemory("256GB")).toBe(256)
    expect(parseMemory("1 ТБ")).toBe(1024)
    expect(parseMemory("15")).toBeNull()
  })

  it("телефон без подписей: IMEI по порядку, S/N, память, цена, остальное — модель", () => {
    expect(parsePhoneText("iPhone 15 Pro 256\n356789000010049\n356789000010056\nf2lxk1q9p3\n450 000")).toEqual({
      model: "iPhone 15 Pro",
      memoryGb: 256,
      imei1: "356789000010049",
      imei2: "356789000010056",
      serialNumber: "F2LXK1Q9P3",
      purchasePrice: 450_000,
    })
  })

  it("телефон с подписями: порядок строк не важен, IMEI 2 до IMEI1", () => {
    expect(parsePhoneText("IMEI 2: 356789000010056\nIMEI1 - 356789000010049\nS/N: F2LXK1Q9P3\nЦена 450к\nПоставщик: Алмас (Дубай)\nб/у")).toEqual({
      imei1: "356789000010049",
      imei2: "356789000010056",
      serialNumber: "F2LXK1Q9P3",
      purchasePrice: 450_000,
      supplier: "Алмас (Дубай)",
      condition: "USED",
    })
  })

  it("модель с числами не путается с ценой и памятью", () => {
    expect(parsePhoneText("Samsung Galaxy S24 Ultra")).toEqual({ model: "Samsung Galaxy S24 Ultra" })
    expect(parsePhoneText("iPhone 15")).toEqual({ model: "iPhone 15" })
  })
})
