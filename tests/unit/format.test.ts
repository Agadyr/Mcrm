import { afterEach, describe, expect, it, vi } from "vitest"
import { formatDate, formatDateTime, formatMemory, formatMoney, formatNumber, phoneTitle } from "@/lib/format"
import { addDays, dateToYmd, daysSince, isYmd, startOfMonth, startOfWeek, todayYmd, ymdToDate } from "@/lib/dates"
import { debtReminder } from "@/lib/sales"

describe("форматирование", () => {
  it("деньги и числа с пробелами", () => {
    expect(formatMoney(450000)).toBe("450 000 ₸")
    expect(formatMoney(null)).toBe("—")
    expect(formatNumber(-1234567.6)).toBe("−1 234 568")
    expect(formatNumber(0)).toBe("0")
  })

  it("даты: ДД.ММ.ГГГГ и время по Алматы (UTC+5)", () => {
    expect(formatDate(new Date("2026-03-05T00:00:00Z"))).toBe("05.03.2026")
    expect(formatDate(null)).toBe("—")
    expect(formatDateTime(new Date("2026-10-12T20:30:00Z"))).toBe("13.10.2026 01:30")
  })

  it("память и название телефона", () => {
    expect(formatMemory(256)).toBe("256 ГБ")
    expect(formatMemory(1024)).toBe("1 ТБ")
    expect(formatMemory(null)).toBe("")
    expect(phoneTitle({ model: "iPhone 15", memoryGb: 128, color: null })).toBe("iPhone 15 · 128 ГБ")
  })

  it("напоминание о долге", () => {
    const text = debtReminder(
      { buyerName: "Тима", salePrice: 600_000, paidAmount: 200_000, dueDate: new Date("2026-10-19T00:00:00Z") },
      "iPhone 15"
    )
    expect(text).toBe("Здравствуйте, Тима! Напоминаем об оплате за iPhone 15: осталось 400 000 ₸, срок — 19.10.2026.")
  })
})

describe("даты", () => {
  afterEach(() => vi.useRealTimers())

  it("«сегодня» считается по Алматы", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-12T20:00:00Z")) // в Алматы уже 13-е
    expect(todayYmd()).toBe("2026-10-13")
  })

  it("преобразования и границы недели/месяца", () => {
    const d = ymdToDate("2026-10-15") // четверг
    expect(dateToYmd(d)).toBe("2026-10-15")
    expect(dateToYmd(startOfWeek(d))).toBe("2026-10-12")
    expect(dateToYmd(startOfMonth(d))).toBe("2026-10-01")
    expect(dateToYmd(addDays(d, 20))).toBe("2026-11-04")
    expect(dateToYmd(null)).toBe("")
  })

  it("isYmd", () => {
    expect(isYmd("2026-10-12")).toBe(true)
    expect(isYmd("12.10.2026")).toBe(false)
    expect(isYmd("2026-13-45")).toBe(false)
  })

  it("daysSince", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-12T06:00:00Z"))
    expect(daysSince(ymdToDate("2026-10-05"))).toBe(7)
    expect(daysSince(ymdToDate("2026-10-20"))).toBe(0)
  })
})
