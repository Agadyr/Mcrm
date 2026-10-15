import { addDays, dateToYmd, isYmd, startOfMonth, startOfWeek, todayDate, ymdToDate } from "@/lib/dates"

// Период аналитики и разбивка по времени (по дням, неделям или месяцам). Даты — полночь UTC, как во всём проекте.

export type RangeKey = "7d" | "30d" | "90d" | "month" | "year" | "all" | "custom"
export type Granularity = "day" | "week" | "month"

export const RANGE_PRESETS: { key: Exclude<RangeKey, "custom">; label: string }[] = [
  { key: "7d", label: "7 дней" },
  { key: "30d", label: "30 дней" },
  { key: "90d", label: "90 дней" },
  { key: "month", label: "Этот месяц" },
  { key: "year", label: "Этот год" },
  { key: "all", label: "Всё время" },
]

export type Period = {
  key: RangeKey
  /** первый день периода */
  from: Date
  /** последний день периода (включительно) */
  to: Date
  days: number
  granularity: Granularity
  /** предыдущий период той же длины — для сравнения; у «Всё время» его нет */
  prev: { from: Date; to: Date } | null
}

const DAY = 86_400_000
const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY) + 1

export function granularityFor(days: number): Granularity {
  return days <= 45 ? "day" : days <= 180 ? "week" : "month"
}

/**
 * Период из адресной строки: ?range=30d или ?from=2026-10-01&to=2026-10-31.
 * earliest — самая ранняя запись пользователя (нужна для «Всё время»).
 */
export function resolvePeriod(
  sp: { range?: string; from?: string; to?: string },
  earliest: Date | null = null,
  today: Date = todayDate()
): Period {
  let key: RangeKey = "30d"
  let from = addDays(today, -29)
  let to = today

  if (sp.from && sp.to && isYmd(sp.from) && isYmd(sp.to)) {
    key = "custom"
    from = ymdToDate(sp.from)
    to = ymdToDate(sp.to)
    if (from > to) [from, to] = [to, from]
  } else {
    switch (sp.range) {
      case "7d":
        key = "7d"
        from = addDays(today, -6)
        break
      case "90d":
        key = "90d"
        from = addDays(today, -89)
        break
      case "month":
        key = "month"
        from = startOfMonth(today)
        break
      case "year":
        key = "year"
        from = new Date(Date.UTC(today.getUTCFullYear(), 0, 1))
        break
      case "all":
        key = "all"
        from = earliest && earliest < today ? earliest : addDays(today, -29)
        break
    }
  }

  const days = daysBetween(from, to)
  const prev =
    key === "all" ? null : { from: addDays(from, -days), to: addDays(from, -1) }
  return { key, from, to, days, granularity: granularityFor(days), prev }
}

/** Что показывать в заголовке: «13.09.2026 – 12.10.2026 · 30 дней» */
export function periodLabel(p: Pick<Period, "from" | "to" | "days">) {
  const fmt = (d: Date) => dateToYmd(d).split("-").reverse().join(".")
  return p.days === 1 ? fmt(p.from) : `${fmt(p.from)} – ${fmt(p.to)}`
}

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
const MONTHS_FULL = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"]
const ddmm = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`
const ddmmyyyy = (d: Date) => `${ddmm(d)}.${d.getUTCFullYear()}`

export type Bucket = {
  key: string
  /** короткая подпись под осью */
  label: string
  /** полная подпись в подсказке */
  title: string
  from: Date
  to: Date
}

function bucketStart(date: Date, g: Granularity) {
  return g === "day" ? date : g === "week" ? startOfWeek(date) : startOfMonth(date)
}

/** Ключ отрезка, в который попадает день */
export function bucketKey(date: Date, g: Granularity) {
  return dateToYmd(bucketStart(date, g))
}

function nextStart(date: Date, g: Granularity) {
  if (g === "day") return addDays(date, 1)
  if (g === "week") return addDays(date, 7)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
}

/** Все отрезки периода подряд — пустые тоже, чтобы на графике были нули, а не провалы */
export function buildBuckets(from: Date, to: Date, g: Granularity): Bucket[] {
  const out: Bucket[] = []
  for (let start = bucketStart(from, g); start <= to; start = nextStart(start, g)) {
    const end = addDays(nextStart(start, g), -1)
    const label =
      g === "day" ? ddmm(start) : g === "week" ? ddmm(start) : `${MONTHS[start.getUTCMonth()]}${start.getUTCMonth() === 0 || out.length === 0 ? ` ${String(start.getUTCFullYear()).slice(2)}` : ""}`
    const title =
      g === "day"
        ? ddmmyyyy(start)
        : g === "week"
          ? `${ddmm(start)} – ${ddmmyyyy(end)}`
          : `${MONTHS_FULL[start.getUTCMonth()]} ${start.getUTCFullYear()}`
    out.push({ key: dateToYmd(start), label, title, from: start, to: end })
  }
  return out
}
