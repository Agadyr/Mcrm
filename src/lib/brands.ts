// Марка определяется по названию модели — отдельное поле заполнять не нужно.

export type Brand = { key: string; label: string; prefixes: string[] }

export const BRANDS: Brand[] = [
  { key: "apple", label: "Apple", prefixes: ["iphone", "apple"] },
  { key: "samsung", label: "Samsung", prefixes: ["samsung", "galaxy"] },
  { key: "xiaomi", label: "Xiaomi", prefixes: ["xiaomi", "redmi", "poco", "mi "] },
  { key: "google", label: "Google", prefixes: ["google", "pixel"] },
  { key: "huawei", label: "Huawei", prefixes: ["huawei"] },
  { key: "honor", label: "Honor", prefixes: ["honor"] },
  { key: "oneplus", label: "OnePlus", prefixes: ["oneplus", "one plus"] },
  { key: "oppo", label: "OPPO", prefixes: ["oppo"] },
  { key: "vivo", label: "vivo", prefixes: ["vivo"] },
  { key: "realme", label: "realme", prefixes: ["realme"] },
  { key: "nothing", label: "Nothing", prefixes: ["nothing"] },
  { key: "motorola", label: "Motorola", prefixes: ["motorola", "moto "] },
  { key: "tecno", label: "Tecno", prefixes: ["tecno"] },
  { key: "infinix", label: "Infinix", prefixes: ["infinix"] },
]

export const OTHER_BRAND: Brand = { key: "other", label: "Другие", prefixes: [] }

export function detectBrand(model: string): Brand {
  const m = model.trim().toLowerCase()
  return BRANDS.find((b) => b.prefixes.some((p) => m.startsWith(p))) ?? OTHER_BRAND
}

export function brandByKey(key: string): Brand | undefined {
  return key === OTHER_BRAND.key ? OTHER_BRAND : BRANDS.find((b) => b.key === key)
}

/** Короткое имя модели без марки: «Samsung Galaxy S24» → «Galaxy S24». iPhone оставляем как есть. */
export function shortModelName(model: string): string {
  const stripped = model.replace(/^(samsung|xiaomi|google|huawei|honor|oneplus|oppo|vivo|realme|motorola)\s+/i, "")
  return stripped || model
}
