// Даты без времени (@db.Date) храним как полночь UTC нужного календарного дня.
// «Сегодня» считаем по времени Алматы.

export const TIME_ZONE = "Asia/Almaty"

/** Сегодняшняя дата в Алматы в виде "ГГГГ-ММ-ДД" */
export function todayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date())
}

/** "ГГГГ-ММ-ДД" → Date (полночь UTC) */
export function ymdToDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`)
}

/** Date (полночь UTC) → "ГГГГ-ММ-ДД" — для input[type=date] */
export function dateToYmd(date: Date | null | undefined): string {
  if (!date) return ""
  return date.toISOString().slice(0, 10)
}

export function todayDate(): Date {
  return ymdToDate(todayYmd())
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}

/** Понедельник текущей недели */
export function startOfWeek(date: Date): Date {
  const day = (date.getUTCDay() + 6) % 7 // 0 = понедельник
  return addDays(date, -day)
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

export function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(ymdToDate(value).getTime())
}

/** Сколько полных дней прошло с даты (по Алматы) */
export function daysSince(date: Date): number {
  return Math.max(0, Math.round((todayDate().getTime() - ymdToDate(dateToYmd(date)).getTime()) / 86_400_000))
}

/** Верификация «долго в работе» с этого количества дней */
export const OVERDUE_DAYS = 7

/** Момент времени → календарный день по Алматы (полночь UTC), как у дат без времени */
export function instantToDate(instant: Date): Date {
  return ymdToDate(new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(instant))
}
