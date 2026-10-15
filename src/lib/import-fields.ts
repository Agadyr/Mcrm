// Поля, которые можно сопоставить с колонками Excel при импорте товаров.

export const IMPORT_FIELDS = [
  { key: "model", label: "Модель", required: true, synonyms: ["модель", "model", "наименование", "товар", "телефон", "название"] },
  { key: "memory", label: "Память", synonyms: ["память", "memory", "объём", "объем", "гб", "storage"] },
  { key: "color", label: "Цвет", synonyms: ["цвет", "color", "colour"] },
  { key: "imei1", label: "IMEI1", required: true, synonyms: ["imei1", "imei", "имей1", "имей", "imei 1"] },
  { key: "imei2", label: "IMEI2", synonyms: ["imei2", "имей2", "imei 2"] },
  { key: "serialNumber", label: "Серийный номер", synonyms: ["серийный", "серийныйномер", "serial", "sn", "s/n", "серийник"] },
  { key: "condition", label: "Состояние", synonyms: ["состояние", "condition", "новый/бу"] },
  { key: "purchasePrice", label: "Цена закупки", synonyms: ["ценазакупки", "закупка", "закуп", "себестоимость", "закупочнаяцена", "цена"] },
  { key: "receivedAt", label: "Дата поступления", synonyms: ["датапоступления", "поступление", "датазакупки", "приход", "дата"] },
  { key: "supplier", label: "Поставщик", synonyms: ["поставщик", "откого", "укого", "supplier", "продавец"] },
  { key: "status", label: "Статус", synonyms: ["статус", "status"] },
  { key: "note", label: "Заметка", synonyms: ["заметка", "примечание", "комментарий", "note"] },
  { key: "salePrice", label: "Цена продажи", synonyms: ["ценапродажи", "продажа", "продал", "продано", "ценапродаж"] },
  { key: "soldAt", label: "Дата продажи", synonyms: ["датапродажи"] },
  { key: "buyerName", label: "Покупатель", synonyms: ["покупатель", "клиент", "buyer", "кому"] },
  { key: "buyerPhone", label: "Телефон покупателя", synonyms: ["телефонпокупателя", "номерпокупателя", "телефонклиента", "номерклиента"] },
  { key: "paymentMethod", label: "Способ оплаты", synonyms: ["способоплаты", "оплата", "payment"] },
] as const

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"]
export type ImportMapping = Partial<Record<ImportFieldKey, number>> // поле → индекс колонки

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[\s_.\-:№#()]/g, "")

/** Автоматическое сопоставление по названиям колонок */
export function guessMapping(headers: string[]): ImportMapping {
  const mapping: ImportMapping = {}
  const used = new Set<number>()
  const normalized = headers.map(norm)
  // Сначала точные совпадения, потом «содержит»
  for (const pass of ["exact", "contains"] as const) {
    for (const field of IMPORT_FIELDS) {
      if (mapping[field.key] !== undefined) continue
      for (const syn of field.synonyms) {
        const s = norm(syn)
        const idx = normalized.findIndex(
          (h, i) => !used.has(i) && h && (pass === "exact" ? h === s : h.includes(s))
        )
        if (idx >= 0) {
          mapping[field.key] = idx
          used.add(idx)
          break
        }
      }
    }
  }
  return mapping
}
