import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { KASPI_TABS, type KaspiTab } from "@/lib/kaspi-labels"
import type { KaspiEntry } from "@/server/kaspi"
import { KaspiConnect } from "./kaspi-connect"
import { KaspiOrders, type OrderRow, type StockOption } from "./kaspi-orders"

export const metadata: Metadata = { title: "Kaspi магазин" }

const MAX_ORDERS = 100

export default async function KaspiPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser()
  // у верификатора нет склада и продаж
  if (user.role === "VERIFIER") redirect("/")
  const { tab: rawTab } = await searchParams

  const shop = await prisma.kaspiShop.findUnique({
    where: { ownerId: user.id },
    select: { shopName: true, tokenHint: true, status: true, lastError: true, connectedAt: true, lastCheckedAt: true, autoAccept: true, lastSyncAt: true, lastSyncError: true },
  })
  if (!shop || rawTab === "settings") return <KaspiConnect shop={shop} />

  const tab: KaspiTab = KASPI_TABS.find((t) => t.key === rawTab)?.key ?? "NEW"
  const states = KASPI_TABS.find((t) => t.key === tab)!.states as readonly string[]

  const [orders, counts, stock] = await Promise.all([
    prisma.kaspiOrder.findMany({ where: { ownerId: user.id, state: { in: [...states] } }, orderBy: { orderedAt: "desc" }, take: MAX_ORDERS }),
    prisma.kaspiOrder.groupBy({ by: ["state"], where: { ownerId: user.id }, _count: { _all: true } }),
    prisma.phone.findMany({
      where: { ownerId: user.id, status: { in: ["IN_STOCK", "RESERVED"] } },
      select: { id: true, model: true, memoryGb: true, color: true, imei1: true, purchasePrice: true },
      orderBy: { receivedAt: "desc" },
      take: 300,
    }),
  ])
  const count = (s: readonly string[]) => counts.filter((c) => s.includes(c.state)).reduce((a, c) => a + c._count._all, 0)

  const rows: OrderRow[] = orders.map((o) => ({
    id: o.id,
    code: o.code,
    state: o.state,
    status: o.status,
    totalPrice: o.totalPrice,
    paymentMode: o.paymentMode,
    deliveryMode: o.deliveryMode,
    orderedAt: o.orderedAt.toISOString(),
    plannedDeliveryAt: o.plannedDeliveryAt?.toISOString() ?? null,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    address: o.address,
    entries: o.entries as unknown as KaspiEntry[],
    hasSale: !!o.saleId,
    imeiRequired: o.imeiRequired,
    imeiSent: !!o.imeiSentAt,
    waybill: o.waybill,
    waybillNumber: o.waybillNumber,
    assembled: o.assembled,
    courierAt: o.courierAt?.toISOString() ?? null,
  }))
  const stockOptions: StockOption[] = stock

  return (
    <KaspiOrders
      shop={{ name: shop.shopName, ok: shop.status === "ACTIVE", autoAccept: shop.autoAccept, lastSyncAt: shop.lastSyncAt?.toISOString() ?? null, lastSyncError: shop.lastSyncError }}
      tab={tab}
      tabs={KASPI_TABS.map((t) => ({ key: t.key, label: t.label, count: count(t.states) }))}
      orders={rows}
      stock={stockOptions}
    />
  )
}
