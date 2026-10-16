import type { KaspiEntry } from "@/server/kaspi"

// Продажа по заказу Kaspi: на каждую единицу позиции с IMEI — свой телефон со склада и своя продажа.

/** Больше телефонов в одной позиции не бывает — защита от мусора в данных Kaspi */
export const MAX_ENTRY_QUANTITY = 50

/** Сколько штук в позиции (минимум одна) */
export const entryQuantity = (e: KaspiEntry) => Math.min(MAX_ENTRY_QUANTITY, Math.max(1, Math.floor(e.quantity) || 1))

/** Сумма позиции: total из Kaspi, иначе цена × количество */
export const entryTotal = (e: KaspiEntry) => e.total || e.price * e.quantity || 0

/**
 * Позиции заказа, на которые нужен телефон со склада и IMEI в Kaspi: отмеченные Kaspi «нужен IMEI»;
 * если отметок нет, а заказ требует IMEI — единственная позиция заказа.
 */
export function phoneEntries(entries: KaspiEntry[], orderImeiRequired: boolean): (KaspiEntry & { id: string })[] {
  const withId = entries.filter((e): e is KaspiEntry & { id: string } => !!e.id)
  const flagged = withId.filter((e) => e.imeiRequired)
  if (flagged.length) return flagged
  return orderImeiRequired && withId.length === 1 ? withId : []
}

/** Делим сумму позиции на штуки: остаток от деления — первым штукам, сумма сходится до тенге */
export function unitPrices(total: number, quantity: number): number[] {
  const base = Math.floor(total / quantity)
  const rest = total - base * quantity
  return Array.from({ length: quantity }, (_, i) => base + (i < rest ? 1 : 0))
}
