import "server-only"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { normalizeImei } from "@/lib/imei"
import { startOfMonth, startOfWeek, todayDate } from "@/lib/dates"
import type { SearchParams } from "./phone-filters"

/** Вкладки продаж: все, с долгом, просроченный долг, оплаченные, отменённые */
export const SALE_STATES = ["debt", "overdue", "paid", "cancelled"] as const
export type SaleState = (typeof SALE_STATES)[number] | ""

export const SALE_PERIODS = { today: "Сегодня", week: "Эта неделя", month: "Этот месяц" } as const
export type SalePeriod = keyof typeof SALE_PERIODS | ""

export type SaleFilters = { q: string; state: SaleState; period: SalePeriod; page: number }

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""

export function parseSaleFilters(sp: SearchParams): SaleFilters {
  const state = one(sp.state)
  const period = one(sp.period)
  return {
    q: one(sp.q).trim(),
    state: (SALE_STATES as readonly string[]).includes(state) ? (state as SaleState) : "",
    period: period in SALE_PERIODS ? (period as SalePeriod) : "",
    page: Math.max(1, Number.parseInt(one(sp.page)) || 1),
  }
}

export function saleFiltersToParams(f: SaleFilters): Record<string, string | undefined> {
  return { q: f.q || undefined, state: f.state || undefined, period: f.period || undefined }
}

/** Продажи пользователя (не отменённые) */
export function activeSalesWhere(ownerId: string): Prisma.SaleWhereInput {
  return { phone: { ownerId }, cancelledAt: null }
}

/** Есть долг: оплачено меньше цены */
export function debtWhere(ownerId: string): Prisma.SaleWhereInput {
  return { ...activeSalesWhere(ownerId), paidAmount: { lt: prisma.sale.fields.salePrice } }
}

/** Долг просрочен: срок возврата уже прошёл */
export function overdueWhere(ownerId: string): Prisma.SaleWhereInput {
  return { ...debtWhere(ownerId), dueDate: { lt: todayDate() } }
}

export function buildSaleWhere(f: SaleFilters, ownerId: string): Prisma.SaleWhereInput {
  const base: Prisma.SaleWhereInput =
    f.state === "debt"
      ? debtWhere(ownerId)
      : f.state === "overdue"
        ? overdueWhere(ownerId)
        : f.state === "paid"
          ? { ...activeSalesWhere(ownerId), paidAmount: { gte: prisma.sale.fields.salePrice } }
          : f.state === "cancelled"
            ? { phone: { ownerId }, cancelledAt: { not: null } }
            : activeSalesWhere(ownerId)
  const and: Prisma.SaleWhereInput[] = [base]

  if (f.period) {
    const today = todayDate()
    const from = f.period === "today" ? today : f.period === "week" ? startOfWeek(today) : startOfMonth(today)
    and.push({ soldAt: { gte: from } })
  }
  if (f.q) {
    const imei = normalizeImei(f.q)
    const or: Prisma.SaleWhereInput[] = [
      { buyerName: { contains: f.q, mode: "insensitive" } },
      { buyerPhone: { contains: f.q } },
      { phone: { model: { contains: f.q, mode: "insensitive" } } },
      { phone: { serialNumber: { contains: f.q, mode: "insensitive" } } },
      { note: { contains: f.q, mode: "insensitive" } },
    ]
    if (/^\d{4,}$/.test(imei)) or.push({ phone: { imei1: { contains: imei } } }, { phone: { imei2: { contains: imei } } })
    and.push({ OR: or })
  }
  return { AND: and }
}

export const saleListInclude = {
  phone: { select: { id: true, model: true, memoryGb: true, color: true, imei1: true, imei2: true, purchasePrice: true } },
} satisfies Prisma.SaleInclude

export type SaleListItem = Prisma.SaleGetPayload<{ include: typeof saleListInclude }>
