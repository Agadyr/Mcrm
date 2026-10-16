import { describe, expect, it } from "vitest"
import { formatCustomerPhone, normalizeCustomerPhone } from "@/lib/customers"

describe("номер клиента", () => {
  it.each([
    ["8 701 123 45 67", "+77011234567"],
    ["+7 (701) 123-45-67", "+77011234567"],
    ["77011234567", "+77011234567"],
    ["701 123 45 67", "+77011234567"],
    ["123", null],
    ["+1 202 555 0100", null],
    ["870112345678", null],
    ["", null],
    [null, null],
  ])("normalizeCustomerPhone(%j)", (input, expected) => {
    expect(normalizeCustomerPhone(input)).toBe(expected)
  })

  it("красиво для показа", () => {
    expect(formatCustomerPhone("+77011234567")).toBe("+7 701 123 45 67")
    expect(formatCustomerPhone(null)).toBe("")
  })
})
