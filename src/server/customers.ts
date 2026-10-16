import "server-only"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { NO_NAME, normalizeCustomerPhone } from "@/lib/customers"

/**
 * Клиент для продажи: ищем по номеру в магазине, нет — создаём. Без номера (или с непонятным номером) — null,
 * продажа остаётся без клиента. Безопасно при одновременных продажах: вставка с ON CONFLICT DO NOTHING.
 */
export async function findOrCreateCustomer(
  tx: Prisma.TransactionClient,
  ownerId: string,
  buyerName: string | null | undefined,
  buyerPhone: string | null | undefined
): Promise<string | null> {
  const phone = normalizeCustomerPhone(buyerPhone)
  if (!phone) return null
  const name = buyerName?.trim() || null
  await tx.customer.createMany({ data: [{ ownerId, phone, name: name ?? NO_NAME }], skipDuplicates: true })
  const customer = await tx.customer.findUniqueOrThrow({ where: { ownerId_phone: { ownerId, phone } }, select: { id: true, name: true } })
  // клиент был записан без имени — теперь оно известно
  if (name && customer.name === NO_NAME) await tx.customer.update({ where: { id: customer.id }, data: { name } })
  return customer.id
}

/** Условие поиска клиента по имени или части номера («8701…», «+7 701…», «701…» — всё находит) */
export function customerSearchWhere(q: string): Prisma.CustomerWhereInput | undefined {
  q = q.trim()
  if (!q) return undefined
  const or: Prisma.CustomerWhereInput[] = [{ name: { contains: q, mode: "insensitive" } }]
  const digits = q.replace(/\D/g, "")
  if (digits.length >= 3) {
    or.push({ phone: { contains: digits } })
    // номер вводят с 8 в начале, а хранится +7
    if (/^8\d/.test(digits)) or.push({ phone: { startsWith: "+7" + digits.slice(1) } })
  }
  return { OR: or }
}

export type CustomerListItem = {
  id: string
  name: string
  phone: string | null
  note: string | null
  /** покупок (без отменённых) */
  purchaseCount: number
  purchaseSum: number
  /** сколько клиент должен по всем продажам */
  debt: number
  lastPurchaseAt: Date | null
}

/** Клиенты магазина со счётчиками: сначала те, кто покупал недавно */
export async function listCustomers(ownerId: string, opts: { q?: string; page?: number; pageSize?: number } = {}) {
  const pageSize = opts.pageSize ?? 50
  const page = Math.max(1, opts.page ?? 1)
  const q = (opts.q ?? "").trim()
  const total = await prisma.customer.count({ where: { ownerId, ...customerSearchWhere(q) } })
  if (!total) return { items: [] as CustomerListItem[], total }

  // то же условие, что customerSearchWhere, но в SQL — для сортировки по последней покупке
  let search = Prisma.empty
  if (q) {
    const digits = q.replace(/\D/g, "")
    const like = (s: string) => s.replace(/[\\%_]/g, "\\$&")
    const parts = [Prisma.sql`c."name" ILIKE ${`%${like(q)}%`}`]
    if (digits.length >= 3) {
      parts.push(Prisma.sql`c."phone" LIKE ${`%${digits}%`}`)
      if (/^8\d/.test(digits)) parts.push(Prisma.sql`c."phone" LIKE ${`+7${digits.slice(1)}%`}`)
    }
    search = Prisma.sql`AND (${Prisma.join(parts, " OR ")})`
  }

  const rows = await prisma.$queryRaw<
    { id: string; name: string; phone: string | null; note: string | null; purchaseCount: bigint; purchaseSum: bigint; debt: bigint; lastPurchaseAt: Date | null }[]
  >`
    SELECT c."id", c."name", c."phone", c."note",
      count(s."id") FILTER (WHERE s."cancelledAt" IS NULL) AS "purchaseCount",
      COALESCE(sum(s."salePrice") FILTER (WHERE s."cancelledAt" IS NULL), 0)::bigint AS "purchaseSum",
      COALESCE(sum(GREATEST(s."salePrice" - s."paidAmount", 0)) FILTER (WHERE s."cancelledAt" IS NULL), 0)::bigint AS "debt",
      max(s."soldAt") FILTER (WHERE s."cancelledAt" IS NULL) AS "lastPurchaseAt"
    FROM "Customer" c
    LEFT JOIN "Sale" s ON s."customerId" = c."id"
    WHERE c."ownerId" = ${ownerId} ${search}
    GROUP BY c."id"
    ORDER BY "lastPurchaseAt" DESC NULLS LAST, c."createdAt" DESC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`

  const items: CustomerListItem[] = rows.map((r) => ({
    ...r,
    purchaseCount: Number(r.purchaseCount),
    purchaseSum: Number(r.purchaseSum),
    debt: Number(r.debt),
  }))
  return { items, total }
}

/** Карточка клиента: все его продажи (и отменённые — для истории) */
export async function getCustomer(id: string, ownerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id, ownerId },
    include: {
      sales: {
        include: { phone: { select: { id: true, model: true, memoryGb: true, color: true, imei1: true, purchasePrice: true } } },
        orderBy: [{ soldAt: "desc" }, { createdAt: "desc" }],
      },
    },
  })
  if (!customer) return null
  return { ...customer, totals: customerTotals(customer.sales) }
}

/** Итоги по продажам клиента: отменённые не считаются */
export function customerTotals(sales: { salePrice: number; paidAmount: number; cancelledAt: Date | null; soldAt: Date }[]) {
  const active = sales.filter((s) => !s.cancelledAt)
  return {
    purchaseCount: active.length,
    purchaseSum: active.reduce((a, s) => a + s.salePrice, 0),
    paidSum: active.reduce((a, s) => a + s.paidAmount, 0),
    debt: active.reduce((a, s) => a + Math.max(0, s.salePrice - s.paidAmount), 0),
    lastPurchaseAt: active.reduce<Date | null>((a, s) => (!a || s.soldAt > a ? s.soldAt : a), null),
  }
}
