import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { appUrl } from "@/lib/telegram"
import { brandOf } from "@/lib/kaspi-labels"
import { formatMemory } from "@/lib/format"
import { offerStock, phoneMatchesOffer } from "@/server/kaspi-feed"
import { KaspiOffers, type OfferRow, type Suggestion } from "./kaspi-offers"

export const metadata: Metadata = { title: "Kaspi · Товары и цены" }

export default async function KaspiOffersPage() {
  const user = await requireUser()
  if (user.role === "VERIFIER") redirect("/")
  const shop = await prisma.kaspiShop.findUnique({ where: { ownerId: user.id }, select: { merchantId: true, storeId: true, feedToken: true } })
  if (!shop) redirect("/kaspi")

  const [offers, phones] = await Promise.all([
    prisma.kaspiOffer.findMany({ where: { ownerId: user.id }, orderBy: [{ active: "desc" }, { title: "asc" }] }),
    prisma.phone.findMany({ where: { ownerId: user.id, status: "IN_STOCK" }, select: { model: true, memoryGb: true, color: true, purchasePrice: true } }),
  ])
  const stock = await offerStock(user.id, offers)

  // модели на складе, которых ещё нет в прайсе (модель + память + цвет)
  const groups = new Map<string, Suggestion>()
  for (const p of phones) {
    if (offers.some((o) => phoneMatchesOffer(p, o))) continue
    const key = [p.model.trim().toLowerCase(), p.memoryGb ?? "", (p.color ?? "").trim().toLowerCase()].join("|")
    const g = groups.get(key)
    if (g) {
      g.count++
      g.maxPurchase = Math.max(g.maxPurchase, p.purchasePrice)
    } else {
      groups.set(key, {
        key,
        model: p.model,
        memoryGb: p.memoryGb,
        color: p.color,
        title: [p.model, formatMemory(p.memoryGb), p.color].filter(Boolean).join(" "),
        brand: brandOf(p.model),
        count: 1,
        maxPurchase: p.purchasePrice,
      })
    }
  }

  const rows: OfferRow[] = offers.map((o) => ({ ...o, stock: stock.get(o.id) ?? 0 }))
  const feedPath = shop.feedToken ? `/api/kaspi/feed/${shop.feedToken}` : null

  return (
    <KaspiOffers
      settings={{ merchantId: shop.merchantId ?? "", storeId: shop.storeId ?? "" }}
      feedUrl={feedPath ? appUrl(feedPath) : null}
      feedPath={feedPath}
      offers={rows}
      suggestions={[...groups.values()].sort((a, b) => b.count - a.count)}
    />
  )
}
