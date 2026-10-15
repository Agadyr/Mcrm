import { describe, expect, it } from "vitest"
import { buildBuckets, bucketKey, periodLabel, resolvePeriod } from "@/lib/analytics-period"
import { dateToYmd, instantToDate, ymdToDate } from "@/lib/dates"

const today = ymdToDate("2026-10-12") // понедельник

describe("период аналитики", () => {
  it("по умолчанию — последние 30 дней, с предыдущим периодом той же длины", () => {
    const p = resolvePeriod({}, null, today)
    expect([p.key, dateToYmd(p.from), dateToYmd(p.to), p.days, p.granularity]).toEqual(["30d", "2026-09-13", "2026-10-12", 30, "day"])
    expect([dateToYmd(p.prev!.from), dateToYmd(p.prev!.to)]).toEqual(["2026-08-14", "2026-09-12"])
  })

  it.each([
    ["7d", "2026-10-06", 7, "day"],
    ["90d", "2026-07-15", 90, "week"],
    ["month", "2026-10-01", 12, "day"],
    ["year", "2026-01-01", 285, "month"],
  ])("пресет %s", (range, from, days, g) => {
    const p = resolvePeriod({ range }, null, today)
    expect([dateToYmd(p.from), p.days, p.granularity]).toEqual([from, days, g])
  })

  it("«Всё время» начинается с первой записи и не сравнивается", () => {
    const p = resolvePeriod({ range: "all" }, ymdToDate("2026-01-05"), today)
    expect([dateToYmd(p.from), p.prev]).toEqual(["2026-01-05", null])
  })

  it("свой период: даты можно перепутать местами, мусор игнорируется", () => {
    const p = resolvePeriod({ from: "2026-10-10", to: "2026-10-01" }, null, today)
    expect([p.key, dateToYmd(p.from), dateToYmd(p.to), p.days]).toEqual(["custom", "2026-10-01", "2026-10-10", 10])
    expect(resolvePeriod({ from: "вчера", to: "x", range: "boom" }, null, today).key).toBe("30d")
  })

  it("подпись периода", () => {
    expect(periodLabel(resolvePeriod({ range: "7d" }, null, today))).toBe("06.10.2026 – 12.10.2026")
  })
})

describe("отрезки времени", () => {
  it("по дням — все дни подряд", () => {
    const b = buildBuckets(ymdToDate("2026-10-01"), ymdToDate("2026-10-03"), "day")
    expect(b.map((x) => x.key)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"])
    expect(b[0]).toMatchObject({ label: "01.10", title: "01.10.2026" })
  })

  it("по неделям — с понедельника, края периода входят целыми неделями", () => {
    const b = buildBuckets(ymdToDate("2026-10-07"), ymdToDate("2026-10-20"), "week")
    expect(b.map((x) => x.key)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"])
    expect(b[0].title).toBe("05.10 – 11.10.2026")
  })

  it("по месяцам, в том числе через границу года", () => {
    const b = buildBuckets(ymdToDate("2026-11-20"), ymdToDate("2027-02-02"), "month")
    expect(b.map((x) => x.key)).toEqual(["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"])
    expect(b.map((x) => x.title)).toEqual(["Ноябрь 2026", "Декабрь 2026", "Январь 2027", "Февраль 2027"])
  })

  it("ключ дня совпадает с ключом его отрезка", () => {
    const d = ymdToDate("2026-10-14")
    expect(bucketKey(d, "day")).toBe("2026-10-14")
    expect(bucketKey(d, "week")).toBe("2026-10-12")
    expect(bucketKey(d, "month")).toBe("2026-10-01")
  })

  it("момент времени переводится в день по Алматы", () => {
    expect(dateToYmd(instantToDate(new Date("2026-10-12T20:00:00Z")))).toBe("2026-10-13")
    expect(dateToYmd(instantToDate(new Date("2026-10-12T18:59:00Z")))).toBe("2026-10-12")
  })
})
