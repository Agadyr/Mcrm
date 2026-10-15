import "server-only"
import { prisma } from "@/lib/db"
import { brandOf } from "@/lib/kaspi-labels"

// Прайс-лист Kaspi (XML kaspi_catalog, схема http://kaspi.kz/kaspishopping.xsd). Kaspi забирает его по ссылке
// раз в 60 минут. Цена — из товара прайса, остаток — сколько таких телефонов сейчас «В наличии» на складе CRM.

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")

type OfferLike = { model: string; memoryGb: number | null; color: string | null }
type StockPhone = { model: string; memoryGb: number | null; color: string | null }

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ")

/** Подходит ли телефон под товар прайса: та же модель, и память/цвет, если они указаны у товара */
export function phoneMatchesOffer(p: StockPhone, o: OfferLike) {
  if (norm(p.model) !== norm(o.model)) return false
  if (o.memoryGb != null && p.memoryGb !== o.memoryGb) return false
  if (o.color && norm(p.color) !== norm(o.color)) return false
  return true
}

/** Остатки по товарам прайса */
export async function offerStock(ownerId: string, offers: (OfferLike & { id: string })[]) {
  const phones = await prisma.phone.findMany({ where: { ownerId, status: "IN_STOCK" }, select: { model: true, memoryGb: true, color: true } })
  return new Map(offers.map((o) => [o.id, phones.filter((p) => phoneMatchesOffer(p, o)).length]))
}

export async function buildKaspiFeed(ownerId: string, now = new Date()) {
  const [shop, owner, offers] = await Promise.all([
    prisma.kaspiShop.findUnique({ where: { ownerId }, select: { merchantId: true, storeId: true, shopName: true } }),
    prisma.user.findUnique({ where: { id: ownerId }, select: { companyName: true, name: true, login: true } }),
    prisma.kaspiOffer.findMany({ where: { ownerId }, orderBy: { sku: "asc" } }),
  ])
  const stock = await offerStock(ownerId, offers)
  const company = shop?.shopName || owner?.companyName || owner?.name || owner?.login || "Магазин"
  const store = shop?.storeId || "PP1"
  // формат даты из примеров Kaspi: дд.мм.гггг чч:мм
  const pad = (n: number) => String(n).padStart(2, "0")
  const date = `${pad(now.getUTCDate())}.${pad(now.getUTCMonth() + 1)}.${now.getUTCFullYear()} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`

  const lines = offers.map((o) => {
    const count = o.active ? (stock.get(o.id) ?? 0) : 0
    const preOrder = count === 0 && o.active && o.preOrderDays ? o.preOrderDays : null
    const available = count > 0 || preOrder ? "yes" : "no"
    const attrs = [`available="${available}"`, `storeId="${xml(store)}"`, preOrder ? `preOrder="${preOrder}"` : null, `stockCount="${count}"`].filter(Boolean).join(" ")
    return [
      `    <offer sku="${xml(o.sku)}">`,
      `      <model>${xml(o.title)}</model>`,
      `      <brand>${xml(o.brand || brandOf(o.model))}</brand>`,
      `      <availabilities>`,
      `        <availability ${attrs}/>`,
      `      </availabilities>`,
      `      <price>${o.price}</price>`,
      `    </offer>`,
    ].join("\n")
  })

  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<kaspi_catalog date="${date}" xmlns="kaspiShopping" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="kaspiShopping http://kaspi.kz/kaspishopping.xsd">`,
    `  <company>${xml(company)}</company>`,
    `  <merchantid>${xml(shop?.merchantId || "")}</merchantid>`,
    `  <offers>`,
    ...lines,
    `  </offers>`,
    `</kaspi_catalog>`,
    ``,
  ].join("\n")
}
