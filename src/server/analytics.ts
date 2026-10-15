import "server-only"
import type { PaymentMethod } from "@prisma/client"
import { prisma } from "@/lib/db"
import { addDays, instantToDate } from "@/lib/dates"
import { buildBuckets, bucketKey, type Period } from "@/lib/analytics-period"
import { ACTIVE_VERIFICATION_STATUSES, UNPAID_VERIFICATION_STATUSES } from "@/lib/labels"
import { debtWhere, overdueWhere } from "@/server/sale-filters"

// Аналитика компании: продажи, закупки, верификации и выплаты за выбранный период.
// Данные за период и за предыдущий такой же период читаем одним запросом и делим уже в памяти.
//
// Что как считается:
//  • выручка — цена продажи (в том числе проданное в долг), по дате продажи, отменённые продажи не в счёт;
//  • прибыль — цена продажи минус закупка телефона;
//  • закупки — телефоны по дате поступления;
//  • верифицировано / отказ / не зарегистрирован — по дате завершения верификации;
//  • выплаты — по дате, когда отмечено «оплачено»: верификатору (agentFee) и человеку (payment).

export type Money = number

export type Summary = {
  revenue: Money
  profit: Money
  soldCount: number
  avgCheck: Money
  /** прибыль к выручке, % */
  margin: number
  /** сколько покупатели ещё должны по проданному в этом периоде */
  buyersOwe: Money
  purchasedCount: number
  purchasedSum: Money
  handed: number
  verified: number
  notRegistered: number
  rejected: number
  paidToAgents: Money
  paidToPeople: Money
  paidTotal: Money
  /** прибыль минус выплаты за верификацию */
  netProfit: Money
}

export type Series = {
  buckets: { key: string; label: string; title: string }[]
  revenue: number[]
  profit: number[]
  sold: number[]
  purchased: number[]
  verified: number[]
  notRegistered: number[]
  rejected: number[]
  paidAgents: number[]
  paidPeople: number[]
}

export type ModelRow = { model: string; count: number; revenue: Money; profit: Money; margin: number }
export type SupplierRow = { supplier: string | null; count: number; sum: Money; sold: number; profit: Money }
export type MethodRow = { method: PaymentMethod; count: number; revenue: Money }
export type WorkerRow = {
  id: string
  name: string
  handed: number
  verified: number
  notRegistered: number
  rejected: number
  /** сейчас в работе (передан или в процессе), независимо от периода */
  active: number
  paid: Money
  /** сейчас должны (не оплачено) */
  debt: Money
}

export type Analytics = {
  period: Period
  current: Summary
  previous: Summary | null
  series: Series
  models: ModelRow[]
  suppliers: SupplierRow[]
  methods: MethodRow[]
  agents: WorkerRow[]
  people: WorkerRow[]
  now: { buyersDebt: Money; buyersDebtCount: number; buyersOverdue: number; debtToAgents: Money; debtToPeople: Money; onVerification: number }
  empty: boolean
}

const inRange = (d: Date, from: Date, to: Date) => d >= from && d <= to

/** Самая ранняя запись пользователя — начало периода «Всё время» */
export async function getEarliestActivity(ownerId: string): Promise<Date | null> {
  const [phone, sale, verification] = await Promise.all([
    prisma.phone.aggregate({ where: { ownerId }, _min: { receivedAt: true } }),
    prisma.sale.aggregate({ where: { phone: { ownerId } }, _min: { soldAt: true } }),
    prisma.verification.aggregate({ where: { ownerId }, _min: { handedAt: true } }),
  ])
  const dates = [phone._min.receivedAt, sale._min.soldAt, verification._min.handedAt].filter((d): d is Date => !!d)
  return dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null
}

type SaleRow = { salePrice: number; paidAmount: number; soldAt: Date; paymentMethod: PaymentMethod; model: string; purchasePrice: number }
type PhoneRow = { receivedAt: Date; purchasePrice: number; supplier: string | null; soldPrice: number | null }
type VerRow = {
  agentId: string | null
  ownerId: string
  verifierId: string | null
  status: string
  handedAt: Date
  completedAt: Date | null
  agentFee: number
  agentPaid: boolean
  agentPaidAt: Date | null
  payment: number
  isPaid: boolean
  paidAt: Date | null
}

/** Выплата верификатору-аккаунту (не себе) */
const agentPayment = (v: VerRow) =>
  v.agentId && v.agentId !== v.ownerId && v.agentPaid && v.agentPaidAt ? { day: instantToDate(v.agentPaidAt), amount: v.agentFee } : null
/** Выплата человеку, с которым компания работает сама */
const personPayment = (v: VerRow) => (!v.agentId && v.isPaid && v.paidAt ? { day: instantToDate(v.paidAt), amount: v.payment } : null)

function summarize(from: Date, to: Date, sales: SaleRow[], phones: PhoneRow[], vers: VerRow[]): Summary {
  const s = sales.filter((x) => inRange(x.soldAt, from, to))
  const revenue = s.reduce((a, x) => a + x.salePrice, 0)
  const profit = s.reduce((a, x) => a + x.salePrice - x.purchasePrice, 0)
  const bought = phones.filter((x) => inRange(x.receivedAt, from, to))
  const finished = (status: string) => vers.filter((v) => v.status === status && v.completedAt && inRange(v.completedAt, from, to)).length
  let paidToAgents = 0
  let paidToPeople = 0
  for (const v of vers) {
    const a = agentPayment(v)
    if (a && inRange(a.day, from, to)) paidToAgents += a.amount
    const p = personPayment(v)
    if (p && inRange(p.day, from, to)) paidToPeople += p.amount
  }
  const paidTotal = paidToAgents + paidToPeople
  return {
    revenue,
    profit,
    soldCount: s.length,
    avgCheck: s.length ? Math.round(revenue / s.length) : 0,
    margin: revenue ? (profit / revenue) * 100 : 0,
    buyersOwe: s.reduce((a, x) => a + (x.salePrice - x.paidAmount), 0),
    purchasedCount: bought.length,
    purchasedSum: bought.reduce((a, x) => a + x.purchasePrice, 0),
    handed: vers.filter((v) => inRange(v.handedAt, from, to)).length,
    verified: finished("VERIFIED"),
    notRegistered: finished("NOT_REGISTERED"),
    rejected: finished("REJECTED"),
    paidToAgents,
    paidToPeople,
    paidTotal,
    netProfit: profit - paidTotal,
  }
}

export async function getAnalytics(ownerId: string, period: Period): Promise<Analytics> {
  const { from, to, prev, granularity } = period
  const windowFrom = prev?.from ?? from
  // для моментов времени (paidAt) берём окно шире на сутки — точное попадание в день по Алматы проверяем уже в памяти
  const wideFrom = addDays(windowFrom, -1)
  const wideTo = addDays(to, 2)

  const [salesRaw, phonesRaw, versRaw, open, buyers, overdue] = await Promise.all([
    prisma.sale.findMany({
      where: { cancelledAt: null, phone: { ownerId }, soldAt: { gte: windowFrom, lte: to } },
      select: { salePrice: true, paidAmount: true, soldAt: true, paymentMethod: true, phone: { select: { model: true, purchasePrice: true } } },
    }),
    prisma.phone.findMany({
      where: { ownerId, receivedAt: { gte: windowFrom, lte: to } },
      select: { receivedAt: true, purchasePrice: true, supplier: true, sales: { where: { cancelledAt: null }, take: 1, select: { salePrice: true } } },
    }),
    prisma.verification.findMany({
      where: {
        ownerId,
        OR: [
          { handedAt: { gte: windowFrom, lte: to } },
          { completedAt: { gte: windowFrom, lte: to } },
          { paidAt: { gte: wideFrom, lt: wideTo } },
          { agentPaidAt: { gte: wideFrom, lt: wideTo } },
        ],
      },
      select: {
        agentId: true, ownerId: true, verifierId: true, status: true, handedAt: true, completedAt: true,
        agentFee: true, agentPaid: true, agentPaidAt: true, payment: true, isPaid: true, paidAt: true,
      },
    }),
    // что происходит сейчас: в работе и неоплачено — независимо от периода
    prisma.verification.findMany({
      where: {
        ownerId,
        OR: [
          { status: { in: ACTIVE_VERIFICATION_STATUSES } },
          { agentPaid: false, agentFee: { gt: 0 }, agentId: { not: null }, NOT: { agentId: ownerId } },
          { isPaid: false, payment: { gt: 0 }, agentId: null },
        ],
      },
      select: { agentId: true, ownerId: true, verifierId: true, status: true, agentFee: true, agentPaid: true, payment: true, isPaid: true },
    }),
    prisma.sale.aggregate({ where: debtWhere(ownerId), _sum: { salePrice: true, paidAmount: true }, _count: true }),
    prisma.sale.count({ where: overdueWhere(ownerId) }),
  ])

  const sales: SaleRow[] = salesRaw.map((s) => ({
    salePrice: s.salePrice, paidAmount: s.paidAmount, soldAt: s.soldAt, paymentMethod: s.paymentMethod,
    model: s.phone.model, purchasePrice: s.phone.purchasePrice,
  }))
  const phones: PhoneRow[] = phonesRaw.map((p) => ({
    receivedAt: p.receivedAt, purchasePrice: p.purchasePrice, supplier: p.supplier, soldPrice: p.sales[0]?.salePrice ?? null,
  }))
  const vers: VerRow[] = versRaw

  const current = summarize(from, to, sales, phones, vers)
  const previous = prev ? summarize(prev.from, prev.to, sales, phones, vers) : null

  // ── ряды по времени
  const buckets = buildBuckets(from, to, granularity)
  const index = new Map(buckets.map((b, i) => [b.key, i]))
  const zeros = () => buckets.map(() => 0)
  const series: Series = {
    buckets: buckets.map(({ key, label, title }) => ({ key, label, title })),
    revenue: zeros(), profit: zeros(), sold: zeros(), purchased: zeros(),
    verified: zeros(), notRegistered: zeros(), rejected: zeros(), paidAgents: zeros(), paidPeople: zeros(),
  }
  const at = (day: Date) => index.get(bucketKey(day, granularity))
  const add = (row: number[], day: Date, amount: number) => {
    if (!inRange(day, from, to)) return
    const i = at(day)
    if (i !== undefined) row[i] += amount
  }
  for (const s of sales) {
    add(series.revenue, s.soldAt, s.salePrice)
    add(series.profit, s.soldAt, s.salePrice - s.purchasePrice)
    add(series.sold, s.soldAt, 1)
  }
  for (const p of phones) add(series.purchased, p.receivedAt, 1)
  for (const v of vers) {
    if (v.completedAt) {
      if (v.status === "VERIFIED") add(series.verified, v.completedAt, 1)
      if (v.status === "NOT_REGISTERED") add(series.notRegistered, v.completedAt, 1)
      if (v.status === "REJECTED") add(series.rejected, v.completedAt, 1)
    }
    const a = agentPayment(v)
    if (a) add(series.paidAgents, a.day, a.amount)
    const p = personPayment(v)
    if (p) add(series.paidPeople, p.day, p.amount)
  }

  // ── разрезы
  const periodSales = sales.filter((s) => inRange(s.soldAt, from, to))
  const byModel = new Map<string, ModelRow>()
  const byMethod = new Map<PaymentMethod, MethodRow>()
  for (const s of periodSales) {
    const m = byModel.get(s.model) ?? { model: s.model, count: 0, revenue: 0, profit: 0, margin: 0 }
    m.count++
    m.revenue += s.salePrice
    m.profit += s.salePrice - s.purchasePrice
    byModel.set(s.model, m)
    const k = byMethod.get(s.paymentMethod) ?? { method: s.paymentMethod, count: 0, revenue: 0 }
    k.count++
    k.revenue += s.salePrice
    byMethod.set(s.paymentMethod, k)
  }
  const models = [...byModel.values()]
    .map((m) => ({ ...m, margin: m.revenue ? (m.profit / m.revenue) * 100 : 0 }))
    .sort((a, b) => b.profit - a.profit || b.count - a.count)

  const bySupplier = new Map<string, SupplierRow>()
  for (const p of phones.filter((x) => inRange(x.receivedAt, from, to))) {
    const key = p.supplier?.trim() || ""
    const r = bySupplier.get(key) ?? { supplier: key || null, count: 0, sum: 0, sold: 0, profit: 0 }
    r.count++
    r.sum += p.purchasePrice
    if (p.soldPrice !== null) {
      r.sold++
      r.profit += p.soldPrice - p.purchasePrice
    }
    bySupplier.set(key, r)
  }

  // ── верификаторы и люди
  type Acc = WorkerRow
  const workers = (kind: "agent" | "person") => {
    const map = new Map<string, Acc>()
    const get = (id: string) =>
      map.get(id) ?? map.set(id, { id, name: "", handed: 0, verified: 0, notRegistered: 0, rejected: 0, active: 0, paid: 0, debt: 0 }).get(id)!
    const idOf = (v: { agentId: string | null; ownerId: string; verifierId: string | null }) =>
      kind === "agent" ? (v.agentId && v.agentId !== v.ownerId ? v.agentId : null) : !v.agentId ? v.verifierId : null
    for (const v of vers) {
      const id = idOf(v)
      if (!id) continue
      const w = get(id)
      if (inRange(v.handedAt, from, to)) w.handed++
      if (v.completedAt && inRange(v.completedAt, from, to)) {
        if (v.status === "VERIFIED") w.verified++
        if (v.status === "NOT_REGISTERED") w.notRegistered++
        if (v.status === "REJECTED") w.rejected++
      }
      const pay = kind === "agent" ? agentPayment(v) : personPayment(v)
      if (pay && inRange(pay.day, from, to)) w.paid += pay.amount
    }
    for (const v of open) {
      const id = idOf(v)
      if (!id) continue
      const w = get(id)
      if (ACTIVE_VERIFICATION_STATUSES.includes(v.status as never)) w.active++
      if (UNPAID_VERIFICATION_STATUSES.includes(v.status as never)) continue // за отказ долг не считается
      w.debt += kind === "agent" ? (!v.agentPaid ? v.agentFee : 0) : !v.isPaid ? v.payment : 0
    }
    return map
  }
  const agentMap = workers("agent")
  const peopleMap = workers("person")
  const [agentUsers, peopleRecords] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...agentMap.keys()] } }, select: { id: true, name: true, login: true } }),
    prisma.verifier.findMany({ where: { id: { in: [...peopleMap.keys()] }, ownerId }, select: { id: true, fullName: true } }),
  ])
  const named = (map: Map<string, Acc>, names: Map<string, string>) =>
    [...map.values()]
      .map((w) => ({ ...w, name: names.get(w.id) ?? "—" }))
      .filter((w) => w.handed + w.verified + w.notRegistered + w.rejected + w.active + w.paid + w.debt > 0)
      .sort((a, b) => b.handed + b.active - (a.handed + a.active) || b.paid - a.paid)
  const agents = named(agentMap, new Map(agentUsers.map((u) => [u.id, u.name || u.login])))
  const people = named(peopleMap, new Map(peopleRecords.map((p) => [p.id, p.fullName])))

  const now = {
    buyersDebt: (buyers._sum.salePrice ?? 0) - (buyers._sum.paidAmount ?? 0),
    buyersDebtCount: buyers._count,
    buyersOverdue: overdue,
    debtToAgents: agents.reduce((a, w) => a + w.debt, 0),
    debtToPeople: people.reduce((a, w) => a + w.debt, 0),
    onVerification: open.filter((v) => ACTIVE_VERIFICATION_STATUSES.includes(v.status as never)).length,
  }

  const empty =
    current.soldCount + current.purchasedCount + current.handed + current.verified + current.notRegistered + current.rejected + current.paidTotal === 0

  return {
    period, current, previous, series,
    models,
    suppliers: [...bySupplier.values()].sort((a, b) => b.sum - a.sum),
    methods: [...byMethod.values()].sort((a, b) => b.revenue - a.revenue),
    agents, people, now, empty,
  }
}
