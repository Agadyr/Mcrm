import { BRANDS } from "@/lib/brands"

// Какие телефоны склада относятся к товару прайса Kaspi. Одна логика для прайс-листа (остатки в Kaspi) и экрана «Товары и цены».

type OfferLike = { model: string; memoryGb: number | null; color: string | null }
type StockPhone = { model: string; memoryGb: number | null; color: string | null }

/** Марки, которые пишут перед моделью: «Apple iPhone 15» и «iPhone 15» — одна модель */
const BRAND_WORDS = new Set(BRANDS.map((b) => b.key))

/** Без регистра и лишних пробелов */
export const normText = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ")

/** Модель для сравнения: без регистра, лишних пробелов и марки в начале («Samsung Galaxy S24» → «galaxy s24») */
export function normModel(model: string | null | undefined) {
  const m = normText(model)
  const space = m.indexOf(" ")
  return space > 0 && BRAND_WORDS.has(m.slice(0, space)) ? m.slice(space + 1) : m
}

/** Подходит ли телефон под товар прайса: та же модель, и память/цвет, если они указаны у товара */
export function phoneMatchesOffer(p: StockPhone, o: OfferLike) {
  if (normModel(p.model) !== normModel(o.model)) return false
  if (o.memoryGb != null && p.memoryGb !== o.memoryGb) return false
  if (o.color && normText(p.color) !== normText(o.color)) return false
  return true
}

/** Похожая модель: одна содержит другую («iPhone 15» ↔ «iPhone 15 Pro») — подсказка, если по товару остаток 0 */
export function similarModel(a: string, b: string) {
  const x = normModel(a)
  const y = normModel(b)
  if (x.length < 2 || y.length < 2) return false
  return x.includes(y) || y.includes(x)
}
