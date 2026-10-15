import { z } from "zod"
import { isYmd, ymdToDate } from "@/lib/dates"
import { normalizeImei } from "@/lib/imei"

z.config(z.locales.ru())

/** Необязательная строка: пустая → null */
export const optText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, `Не более ${max} символов`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))

export const reqText = (message: string, max = 200) =>
  z.string().trim().min(1, message).max(max, `Не более ${max} символов`)

function parseNumber(v: string | number | null | undefined): number | null {
  if (v == null) return null
  if (typeof v === "number") return v
  const cleaned = v.replace(/[\s ₸,]/g, "")
  if (!cleaned) return null
  return Number(cleaned)
}

/** Сумма в тенге: принимает "450 000", "450000" или число */
export const money = (message = "Укажите сумму") =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    const n = parseNumber(v)
    if (n == null) {
      ctx.addIssue({ code: "custom", message })
      return z.NEVER
    }
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000_000) {
      ctx.addIssue({ code: "custom", message: "Введите целую сумму в тенге" })
      return z.NEVER
    }
    return n
  })

export const optMoney = () =>
  z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v, ctx) => {
      const n = parseNumber(v)
      if (n == null) return 0
      if (!Number.isInteger(n) || n < 0 || n > 1_000_000_000) {
        ctx.addIssue({ code: "custom", message: "Введите целую сумму в тенге" })
        return z.NEVER
      }
      return n
    })

/** Необязательное целое (например, память в ГБ) */
export const optInt = () =>
  z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v, ctx) => {
      const n = parseNumber(v)
      if (n == null) return null
      if (!Number.isInteger(n) || n <= 0 || n > 100_000) {
        ctx.addIssue({ code: "custom", message: "Введите целое число" })
        return z.NEVER
      }
      return n
    })

/** Дата "ГГГГ-ММ-ДД" из input[type=date] → Date */
export const reqDate = (message = "Укажите дату") =>
  z
    .string()
    .refine((v) => isYmd(v), message)
    .transform(ymdToDate)

export const optDate = () =>
  z
    .string()
    .optional()
    .nullable()
    .refine((v) => !v || isYmd(v), "Неверная дата")
    .transform((v) => (v ? ymdToDate(v) : null))

/** IMEI: убираем пробелы и дефисы; только цифры. Длину и Луна проверяем мягко (предупреждение). */
export const reqImei = (message = "Укажите IMEI") =>
  z
    .string()
    .transform(normalizeImei)
    .pipe(z.string().min(1, message).regex(/^\d{1,20}$/, "IMEI должен состоять только из цифр"))

export const optImei = () =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => normalizeImei(v))
    .pipe(z.string().regex(/^\d{0,20}$/, "IMEI должен состоять только из цифр"))
    .transform((v) => (v ? v : null))

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

/** Первая ошибка по каждому полю — для показа в форме */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join(".")
    if (!out[key]) out[key] = issue.message
  }
  return out
}
