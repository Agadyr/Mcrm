import { TIME_ZONE } from "@/lib/dates"

/** 450000 → "450 000 ₸" */
export function formatMoney(value: number | null | undefined): string {
  if (value == null) return "—"
  return `${formatNumber(value)} ₸`
}

export function formatNumber(value: number): string {
  const sign = value < 0 ? "−" : ""
  return sign + Math.abs(Math.round(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")
}

/** Дата без времени (@db.Date) → "ДД.ММ.ГГГГ" */
export function formatDate(date: Date | null | undefined): string {
  if (!date) return "—"
  const d = String(date.getUTCDate()).padStart(2, "0")
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${d}.${m}.${date.getUTCFullYear()}`
}

/** Момент времени → "ДД.ММ.ГГГГ ЧЧ:ММ" по Алматы */
export function formatDateTime(date: Date | null | undefined): string {
  if (!date) return "—"
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}`
}

export function formatMemory(gb: number | null | undefined): string {
  if (!gb) return ""
  return gb >= 1024 && gb % 1024 === 0 ? `${gb / 1024} ТБ` : `${gb} ГБ`
}

/** "iPhone 15 Pro · 256 ГБ · Чёрный" */
export function phoneTitle(p: { model: string; memoryGb?: number | null; color?: string | null }): string {
  return [p.model, formatMemory(p.memoryGb), p.color].filter(Boolean).join(" · ")
}
