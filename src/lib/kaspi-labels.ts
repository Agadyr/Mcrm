// Подписи этапов, статусов, оплаты и доставки заказов Kaspi. Неизвестное значение показываем как есть.

export const KASPI_TABS = [
  { key: "NEW", label: "Новые", states: ["NEW"] },
  { key: "SIGN_REQUIRED", label: "На подписании", states: ["SIGN_REQUIRED"] },
  { key: "PICKUP", label: "Самовывоз", states: ["PICKUP"] },
  { key: "DELIVERY", label: "Доставка", states: ["DELIVERY", "KASPI_DELIVERY"] },
  { key: "ARCHIVE", label: "Архив", states: ["ARCHIVE"] },
] as const
export type KaspiTab = (typeof KASPI_TABS)[number]["key"]

export const KASPI_STATUS: Record<string, { label: string; tone: "blue" | "amber" | "green" | "red" | "gray" }> = {
  APPROVED_BY_BANK: { label: "Ждёт принятия", tone: "amber" },
  ACCEPTED_BY_MERCHANT: { label: "Принят", tone: "blue" },
  COMPLETED: { label: "Выдан", tone: "green" },
  CANCELLED: { label: "Отменён", tone: "red" },
  CANCELLING: { label: "Отменяется", tone: "red" },
  KASPI_DELIVERY_RETURN_REQUESTED: { label: "Запрошен возврат", tone: "amber" },
  RETURN_ACCEPTED_BY_MERCHANT: { label: "Возврат принят", tone: "gray" },
  RETURNED: { label: "Возвращён", tone: "gray" },
}

export const KASPI_PAYMENT: Record<string, string> = {
  PAY_WITH_CREDIT: "Кредит / рассрочка",
  PREPAID: "Оплачен",
}

export const KASPI_DELIVERY: Record<string, string> = {
  DELIVERY_PICKUP: "Самовывоз",
  DELIVERY_LOCAL: "Доставка по городу",
  DELIVERY_REGIONAL_TODOOR: "Доставка по Казахстану",
  DELIVERY_REGIONAL_PICKUP: "Доставка в пункт выдачи",
  DELIVERY_POSTOMAT: "Kaspi Постамат",
}

export const kaspiStatus = (s: string) => KASPI_STATUS[s] ?? { label: s, tone: "gray" as const }

/** Причины отмены заказа, которые принимает Kaspi */
export const KASPI_CANCEL_REASONS = {
  BUYER_CANCELLATION_BY_MERCHANT: "Покупатель отказался",
  BUYER_NOT_REACHABLE: "Не удалось связаться с покупателем",
  MERCHANT_OUT_OF_STOCK: "Товара нет в наличии",
} as const
export type KaspiCancelReason = keyof typeof KASPI_CANCEL_REASONS

/** Бренд по названию модели — для прайс-листа, если не указан явно */
export function brandOf(model: string) {
  const m = model.toLowerCase()
  if (/iphone|ipad|apple|airpods|macbook/.test(m)) return "Apple"
  if (/samsung|galaxy/.test(m)) return "Samsung"
  if (/redmi|xiaomi|poco/.test(m)) return "Xiaomi"
  if (/pixel|google/.test(m)) return "Google"
  if (/honor/.test(m)) return "Honor"
  if (/huawei/.test(m)) return "Huawei"
  if (/realme/.test(m)) return "realme"
  if (/oppo/.test(m)) return "OPPO"
  if (/vivo/.test(m)) return "vivo"
  if (/tecno/.test(m)) return "TECNO"
  if (/infinix/.test(m)) return "Infinix"
  return model.trim().split(/\s+/)[0] || "Другое"
}
