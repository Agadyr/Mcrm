import type { PhoneStatus, Prisma } from "@prisma/client"
import { isYmd, todayYmd, ymdToDate, addDays } from "@/lib/dates"
import { ACTIVE_VERIFICATION_STATUSES, PHONE_STATUSES } from "@/lib/labels"
import { normalizeImei } from "@/lib/imei"
import { BRANDS, brandByKey } from "@/lib/brands"
import { phoneAccessWhere } from "@/server/access"

export type SearchParams = Record<string, string | string[] | undefined>

export const PHONE_SORTS = {
  received_desc: "Сначала новые поступления",
  received_asc: "Сначала старые поступления",
  price_desc: "Цена закупки: дороже",
  price_asc: "Цена закупки: дешевле",
  model_asc: "Модель: А → Я",
  model_desc: "Модель: Я → А",
} as const
export type PhoneSort = keyof typeof PHONE_SORTS

export type PhoneFilters = {
  q: string
  status: PhoneStatus | ""
  brand: string
  model: string
  period: "received" | "sold"
  from: string
  to: string
  sort: PhoneSort
  page: number
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""

export function parsePhoneFilters(sp: SearchParams): PhoneFilters {
  const status = one(sp.status)
  const sort = one(sp.sort)
  const from = one(sp.from)
  const to = one(sp.to)
  return {
    q: one(sp.q).trim(),
    status: (PHONE_STATUSES as string[]).includes(status) ? (status as PhoneStatus) : "",
    brand: brandByKey(one(sp.brand)) ? one(sp.brand) : "",
    model: one(sp.model),
    period: one(sp.period) === "sold" ? "sold" : "received",
    from: isYmd(from) ? from : "",
    to: isYmd(to) ? to : "",
    sort: sort in PHONE_SORTS ? (sort as PhoneSort) : "received_desc",
    page: Math.max(1, Number.parseInt(one(sp.page)) || 1),
  }
}

/** Параметры фильтра для ссылок (экспорт, пагинация) */
export function phoneFiltersToParams(f: PhoneFilters): Record<string, string | undefined> {
  return {
    q: f.q || undefined,
    status: f.status || undefined,
    brand: f.brand || undefined,
    model: f.model || undefined,
    period: f.from || f.to ? f.period : undefined,
    from: f.from || undefined,
    to: f.to || undefined,
    sort: f.sort !== "received_desc" ? f.sort : undefined,
  }
}

/**
 * Дата в поисковом запросе: «07.10.2026», «7.10.26», «2026-10-07» или «07.10» (без года — этот и прошлый).
 * Возвращает подходящие дни (полночь UTC) или пустой список, если запрос на дату не похож.
 */
export function parseDateQuery(q: string): Date[] {
  const text = q.trim()
  if (isYmd(text)) return [ymdToDate(text)]
  const m = text.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{4}|\d{2}))?$/)
  if (!m) return []
  const day = m[1].padStart(2, "0")
  const month = m[2].padStart(2, "0")
  const thisYear = Number(todayYmd().slice(0, 4))
  const years = m[3] ? [m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])] : [thisYear, thisYear - 1]
  return years.map((y) => `${y}-${month}-${day}`).filter(isYmd).map(ymdToDate).filter((d) => d.getUTCDate() === Number(day))
}

/** Условие выборки телефонов: свои + переданные пользователю на верификацию, плюс фильтры */
export function buildPhoneWhere(f: PhoneFilters, userId: string): Prisma.PhoneWhereInput {
  const and: Prisma.PhoneWhereInput[] = [phoneAccessWhere(userId)]

  if (f.q) {
    const imei = normalizeImei(f.q)
    const or: Prisma.PhoneWhereInput[] = [
      { model: { contains: f.q, mode: "insensitive" } },
      { serialNumber: { contains: f.q, mode: "insensitive" } },
      // покупатель — только по своим телефонам
      { ownerId: userId, sales: { some: { cancelledAt: null, buyerName: { contains: f.q, mode: "insensitive" } } } },
      { ownerId: userId, sales: { some: { cancelledAt: null, buyerPhone: { contains: f.q } } } },
      // поставщик — только у своих телефонов
      { ownerId: userId, supplier: { contains: f.q, mode: "insensitive" } },
      // телефоны, переданные верификатору с таким именем
      {
        ownerId: userId,
        verifications: {
          some: { agent: { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { login: { contains: f.q, mode: "insensitive" } }] } },
        },
      },
    ]
    // дата поступления или продажи
    const days = parseDateQuery(f.q)
    if (days.length) {
      or.push(
        { ownerId: userId, receivedAt: { in: days } },
        { ownerId: userId, sales: { some: { cancelledAt: null, soldAt: { in: days } } } }
      )
    }
    if (/^\d+$/.test(imei)) {
      or.push({ imei1: { contains: imei } }, { imei2: { contains: imei } })
    }
    and.push({ OR: or })
  }
  if (f.status) and.push(statusWhere(f.status))
  if (f.brand) and.push(brandWhere(f.brand))
  if (f.model) and.push({ model: f.model })

  if (f.from || f.to) {
    const range: Prisma.DateTimeFilter = {}
    if (f.from) range.gte = ymdToDate(f.from)
    if (f.to) range.lt = addDays(ymdToDate(f.to), 1)
    if (f.period === "sold") and.push({ ownerId: userId, sales: { some: { cancelledAt: null, soldAt: range } } })
    else and.push({ receivedAt: range })
  }

  return { AND: and }
}

export function buildPhoneOrderBy(sort: PhoneSort): Prisma.PhoneOrderByWithRelationInput[] {
  switch (sort) {
    case "received_asc":
      return [{ receivedAt: "asc" }, { createdAt: "asc" }]
    case "price_desc":
      return [{ purchasePrice: "desc" }, { receivedAt: "desc" }]
    case "price_asc":
      return [{ purchasePrice: "asc" }, { receivedAt: "desc" }]
    case "model_asc":
      return [{ model: "asc" }, { receivedAt: "desc" }]
    case "model_desc":
      return [{ model: "desc" }, { receivedAt: "desc" }]
    default:
      return [{ receivedAt: "desc" }, { createdAt: "desc" }]
  }
}

/** Что подгружаем для списка товаров */
export const phoneListInclude = {
  owner: { select: { id: true, name: true, login: true, companyName: true } },
  sales: { where: { cancelledAt: null }, take: 1, orderBy: { createdAt: "desc" } },
  verifications: {
    take: 1,
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  },
} satisfies Prisma.PhoneInclude

export type PhoneListItem = Prisma.PhoneGetPayload<{ include: typeof phoneListInclude }>

/**
 * «На верификации» — телефон сейчас у верификатора («Передан» или «В процессе»).
 * На верификацию отдают проданные телефоны, их статус остаётся «Продан», поэтому смотрим на сами верификации.
 */
export const onVerificationWhere: Prisma.PhoneWhereInput = {
  OR: [{ status: "ON_VERIFICATION" }, { verifications: { some: { status: { in: ACTIVE_VERIFICATION_STATUSES } } } }],
}

function statusWhere(status: PhoneStatus): Prisma.PhoneWhereInput {
  return status === "ON_VERIFICATION" ? onVerificationWhere : { status }
}

/** Условие «модель относится к марке» — по началу названия */
function brandWhere(key: string): Prisma.PhoneWhereInput {
  const byPrefix = (prefixes: string[]): Prisma.PhoneWhereInput[] =>
    prefixes.map((p) => ({ model: { startsWith: p, mode: "insensitive" } }))
  if (key === "other") return { NOT: { OR: byPrefix(BRANDS.flatMap((b) => b.prefixes)) } }
  return { OR: byPrefix(brandByKey(key)?.prefixes ?? []) }
}
