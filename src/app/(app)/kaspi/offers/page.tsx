import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { appUrl } from "@/lib/telegram"
import { brandOf } from "@/lib/kaspi-labels"
import { formatMemory } from "@/lib/format"
import { normModel, normText, phoneMatchesOffer, similarModel } from "@/lib/kaspi-match"
import { KaspiOffers, type OfferRow, type StockPhoneRow, type Suggestion } from "./kaspi-offers"

export const metadata: Metadata = { title: "Kaspi · Товары и цены" }

/** Сколько телефонов показывать в раскрывающемся списке у товара */
const LIST_LIMIT = 100

export default async function KaspiOffersPage() {
  const user = await requireUser()
  if (user.role === "VERIFIER") redirect("/")
  const shop = await prisma.kaspiShop.findUnique({ where: { ownerId: user.id }, select: { merchantId: true, storeId: true, feedToken: true } })
  if (!shop) redirect("/kaspi")

  const [offers, phones, models] = await Promise.all([
    prisma.kaspiOffer.findMany({ where: { ownerId: user.id }, orderBy: [{ active: "desc" }, { title: "asc" }] }),
    // те же телефоны, что считает прайс-лист: «В наличии»
    prisma.phone.findMany({
      where: { ownerId: user.id, status: "IN_STOCK" },
      select: { id: true, model: true, memoryGb: true, color: true, imei1: true, purchasePrice: true },
      orderBy: { receivedAt: "desc" },
    }),
    // подсказки для поля «Модель»: модели, которые уже есть на складе
    prisma.phone.findMany({ where: { ownerId: user.id }, distinct: ["model"], select: { model: true }, orderBy: { model: "asc" }, take: 1000 }),
  ])

  // модели на складе, которых ещё нет в прайсе (модель + память + цвет)
  const groups = new Map<string, Suggestion>()
  for (const p of phones) {
    if (offers.some((o) => phoneMatchesOffer(p, o))) continue
    const key = [normModel(p.model), p.memoryGb ?? "", normText(p.color)].join("|")
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

  // по каждому товару — подходящие телефоны (остаток для Kaspi) и, если их нет, похожие модели на складе
  const brief = (p: (typeof phones)[number]): StockPhoneRow => ({ id: p.id, model: p.model, memoryGb: p.memoryGb, color: p.color, imei1: p.imei1 })
  const rows: OfferRow[] = offers.map((o) => {
    const matched = phones.filter((p) => phoneMatchesOffer(p, o))
    const similar = matched.length ? [] : phones.filter((p) => similarModel(p.model, o.model))
    return { ...o, stock: matched.length, matched: matched.slice(0, LIST_LIMIT).map(brief), similarCount: similar.length, similar: similar.slice(0, LIST_LIMIT).map(brief) }
  })
  // одна подсказка на модель, даже если её писали по-разному («iPhone 15» и «Apple iphone 15»)
  const modelOptions = [...new Map(models.map((m) => [normModel(m.model), m.model.trim().replace(/\s+/g, " ")])).values()]
  const feedPath = shop.feedToken ? `/api/kaspi/feed/${shop.feedToken}` : null

  return (
    <KaspiOffers
      settings={{ merchantId: shop.merchantId ?? "", storeId: shop.storeId ?? "" }}
      feedUrl={feedPath ? appUrl(feedPath) : null}
      feedPath={feedPath}
      offers={rows}
      suggestions={[...groups.values()].sort((a, b) => b.count - a.count)}
      models={modelOptions}
    />
  )
}
