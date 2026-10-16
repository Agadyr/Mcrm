// Клиенты магазина: один клиент на номер телефона.
// Правило нормализации повторено в SQL миграции 20261017050000_customers (перенос старых продаж) — менять вместе.

/** Имя клиента, если в продаже указан только телефон */
export const NO_NAME = "Без имени"

/**
 * Номер покупателя → +7XXXXXXXXXX. «8 701 …», «+7 (701) …», «701 …» — один и тот же клиент.
 * null — номера нет или он не похож на казахстанский (такую продажу к клиенту не привязываем).
 */
export function normalizeCustomerPhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "")
  if (/^[78]\d{10}$/.test(digits)) return "+7" + digits.slice(1)
  if (/^7\d{9}$/.test(digits)) return "+7" + digits
  return null
}

/** +77011234567 → +7 701 123 45 67 */
export function formatCustomerPhone(phone: string | null | undefined): string {
  const m = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(phone ?? "")
  return m ? `+7 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : (phone ?? "")
}
