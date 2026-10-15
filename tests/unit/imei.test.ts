import { describe, expect, it } from "vitest"
import { imeiWarning, luhnCheckDigit, luhnValid, normalizeImei } from "@/lib/imei"

describe("IMEI", () => {
  it("normalizeImei убирает разделители", () => {
    expect(normalizeImei(" 35-391805 /123456.7_8 ")).toBe("3539180512345678")
    expect(normalizeImei(null)).toBe("")
  })

  it("алгоритм Луна", () => {
    expect(luhnValid("490154203237518")).toBe(true)
    expect(luhnValid("490154203237519")).toBe(false)
    expect(luhnValid("12a4")).toBe(false)
    expect(luhnCheckDigit("49015420323751")).toBe("8")
  })

  it.each([
    ["", null],
    ["490154203237518", null],
    ["4901 5420 3237 518", null],
    ["49015420323751", "IMEI должен содержать 15 цифр (сейчас 14)"],
    ["49015420323751x", "IMEI должен состоять только из цифр"],
    ["490154203237519", expect.stringContaining("контрольная цифра")],
  ])("imeiWarning(%j)", (value, expected) => {
    expect(imeiWarning(value)).toEqual(expected)
  })
})
