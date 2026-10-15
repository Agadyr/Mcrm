import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { AlarmClockIcon, BanknoteIcon, DownloadIcon, HandCoinsIcon, TrendingUpIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/auth"
import { formatDate, formatMoney, phoneTitle } from "@/lib/format"
import { startOfMonth, todayDate } from "@/lib/dates"
import { PAYMENT_METHOD_LABEL } from "@/lib/labels"
import { buttonVariants } from "@/components/ui/button"
import { EmptyState, PageHeader } from "@/components/page-header"
import { Pagination } from "@/components/pagination"
import { Stat } from "@/components/dashboard-ui"
import { CopyText } from "@/components/copy-text"
import { WhatsAppLink } from "@/components/whatsapp-link"
import type { StatusTab } from "@/components/status-tabs"
import { cn } from "@/lib/utils"
import { getListLayout, listClasses } from "@/lib/list-layout"
import { debtReminder } from "@/lib/sales"
import type { SearchParams } from "@/server/phone-filters"
import {
  activeSalesWhere,
  buildSaleWhere,
  debtWhere,
  overdueWhere,
  parseSaleFilters,
  SALE_PERIODS,
  saleFiltersToParams,
  saleListInclude,
  type SaleListItem,
} from "@/server/sale-filters"
import { SalesFiltersBar } from "./sales-filters-bar"
import { SalePaymentButton } from "./sale-payment-dialog"

export const metadata: Metadata = { title: "Продажи" }

const PAGE_SIZE = 50

/** Сумма долга по условию: Σ цена − Σ оплачено */
async function debtSum(where: ReturnType<typeof debtWhere>) {
  const a = await prisma.sale.aggregate({ where, _sum: { salePrice: true, paidAmount: true }, _count: true })
  return { sum: (a._sum.salePrice ?? 0) - (a._sum.paidAmount ?? 0), count: a._count }
}

export default async function SalesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const lc = listClasses(await getListLayout())
  const user = await requireUser()
  if (user.role === "VERIFIER") redirect("/")
  const ownerId = user.id
  const filters = parseSaleFilters(await searchParams)
  const where = buildSaleWhere(filters, ownerId)
  const today = todayDate()
  const monthStart = startOfMonth(today)

  const tabCount = (state: (typeof filters)["state"]) => prisma.sale.count({ where: buildSaleWhere({ ...filters, state }, ownerId) })
  const [items, total, counts, debt, overdue, month] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: saleListInclude,
      // сначала просроченные и ближайшие сроки, если смотрим долги
      orderBy:
        filters.state === "debt" || filters.state === "overdue"
          ? [{ dueDate: { sort: "asc", nulls: "last" } }, { soldAt: "asc" }]
          : [{ soldAt: "desc" }, { createdAt: "desc" }],
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.sale.count({ where }),
    Promise.all([tabCount(""), tabCount("debt"), tabCount("overdue"), tabCount("paid"), tabCount("cancelled")]),
    debtSum(debtWhere(ownerId)),
    debtSum(overdueWhere(ownerId)),
    prisma.sale.findMany({
      where: { ...activeSalesWhere(ownerId), soldAt: { gte: monthStart } },
      select: { salePrice: true, paidAmount: true, phone: { select: { purchasePrice: true } } },
    }),
  ])

  const monthRevenue = month.reduce((a, s) => a + s.salePrice, 0)
  const monthProfit = month.reduce((a, s) => a + s.salePrice - s.phone.purchasePrice, 0)
  const tabs: StatusTab[] = [
    { value: "", label: "Все", count: counts[0] },
    { value: "debt", label: "В долг", count: counts[1], dot: "bg-amber-500" },
    { value: "overdue", label: "Просрочено", count: counts[2], dot: "bg-rose-500" },
    { value: "paid", label: "Оплачено", count: counts[3], dot: "bg-emerald-500" },
    { value: "cancelled", label: "Отменённые", count: counts[4], dot: "bg-zinc-400" },
  ]
  const params = saleFiltersToParams(filters)
  const exportQs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString()

  return (
    <>
      <PageHeader
        title="Продажи"
        description={
          <>
            Покупатели должны <b className="text-foreground">{formatMoney(debt.sum)}</b>
            {overdue.count > 0 && (
              <>
                {" "}
                · просрочено <b className="text-destructive">{formatMoney(overdue.sum)}</b>
              </>
            )}
          </>
        }
        actions={
          <a href={`/api/export/sales${exportQs ? `?${exportQs}` : ""}`} className={buttonVariants({ variant: "outline" })}>
            <DownloadIcon /> Excel
          </a>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          href="/sales?period=month"
          icon={<BanknoteIcon />}
          tone="indigo"
          label="Продано за месяц"
          value={formatMoney(monthRevenue)}
          sub={`телефонов: ${month.length}`}
        />
        <Stat
          href="/sales?period=month"
          icon={<TrendingUpIcon />}
          tone="emerald"
          label="Прибыль за месяц"
          value={formatMoney(monthProfit)}
          sub="цена продажи − закупка"
        />
        <Stat
          href="/sales?state=debt"
          icon={<HandCoinsIcon />}
          tone="amber"
          label="Долги покупателей"
          value={formatMoney(debt.sum)}
          sub={debt.count ? `должников: ${debt.count}` : "долгов нет"}
        />
        <Stat
          href="/sales?state=overdue"
          icon={<AlarmClockIcon />}
          tone="rose"
          label="Просрочено"
          value={formatMoney(overdue.sum)}
          sub={overdue.count ? `срок прошёл: ${overdue.count}` : "всё в срок"}
          accent={overdue.count > 0}
        />
      </div>

      <SalesFiltersBar tabs={tabs} periods={SALE_PERIODS} />

      {items.length === 0 ? (
        <EmptyState icon={<BanknoteIcon className="size-6" />}>
          {Object.values(params).some(Boolean) ? (
            "Ничего не найдено. Попробуйте изменить фильтры."
          ) : (
            <>
              Продаж пока нет. Продать телефон можно в{" "}
              <Link href="/phones?status=IN_STOCK" className="font-medium text-primary underline">
                товарах
              </Link>
              .
            </>
          )}
        </EmptyState>
      ) : (
        <>
          {lc.showTable && (
            <div className={lc.table}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Дата</th>
                    <th className="px-4 py-3 font-medium">Телефон</th>
                    <th className="px-4 py-3 font-medium">Покупатель</th>
                    <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Цена / прибыль</th>
                    <th className="px-4 py-3 text-right font-medium">Оплата</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((s) => (
                    <tr key={s.id} className={cn("align-top transition-colors hover:bg-muted/30", s.cancelledAt && "opacity-60")}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link href={`/sales/${s.id}`} className="font-medium hover:text-primary">
                          {formatDate(s.soldAt)}
                        </Link>
                        {s.cancelledAt && <div className="text-xs text-muted-foreground">отменена</div>}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/phones/${s.phone.id}`} className="font-semibold hover:text-primary">
                          {phoneTitle(s.phone)}
                        </Link>
                        <CopyText value={s.phone.imei1} className="flex" />
                      </td>
                      <td className="px-4 py-3">
                        <Buyer s={s} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <div className="font-medium">{formatMoney(s.salePrice)}</div>
                        <Profit s={s} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Payment s={s} today={today} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Actions s={s} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {lc.showCards && (
            <div className={lc.cards}>
              {items.map((s) => (
                <div key={s.id} className={cn("rounded-2xl border bg-card shadow-xs", s.cancelledAt && "opacity-60")}>
                  <div className="flex items-start justify-between gap-3 p-4 pb-3">
                    <Link href={`/sales/${s.id}`} className="min-w-0">
                      <div className="font-semibold">{phoneTitle(s.phone)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(s.soldAt)}
                        {s.cancelledAt ? " · отменена" : ` · ${PAYMENT_METHOD_LABEL[s.paymentMethod]}`}
                      </div>
                    </Link>
                    <div className="text-right tabular-nums">
                      <div className="font-semibold">{formatMoney(s.salePrice)}</div>
                      <Profit s={s} />
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-3 border-t bg-muted/30 px-4 py-3 text-sm">
                    <Buyer s={s} />
                    <Payment s={s} today={today} />
                  </div>
                  {!s.cancelledAt && s.paidAmount < s.salePrice && (
                    <div className="border-t p-3">
                      <Actions s={s} wide />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <Pagination page={filters.page} pageCount={Math.ceil(total / PAGE_SIZE)} basePath="/sales" params={params} />
        </>
      )}
    </>
  )
}

function Buyer({ s }: { s: SaleListItem }) {
  const hasDebt = !s.cancelledAt && s.paidAmount < s.salePrice
  if (!s.buyerName && !s.buyerPhone) return <span className="text-muted-foreground">—</span>
  return (
    <div className="min-w-0">
      <div className="font-medium">{s.buyerName ?? "Без имени"}</div>
      {s.buyerPhone && (
        <div className="flex items-center gap-1">
          <a href={`tel:${s.buyerPhone}`} className="text-xs whitespace-nowrap text-muted-foreground hover:text-primary">
            {s.buyerPhone}
          </a>
          <WhatsAppLink phone={s.buyerPhone} text={hasDebt ? debtReminder(s, s.phone.model) : undefined} />
        </div>
      )}
    </div>
  )
}

function Profit({ s }: { s: SaleListItem }) {
  const profit = s.salePrice - s.phone.purchasePrice
  return (
    <div className={cn("text-xs tabular-nums", profit < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400")}>
      {profit >= 0 ? "+" : ""}
      {formatMoney(profit)}
    </div>
  )
}

/** Оплачено / долг и срок возврата */
function Payment({ s, today }: { s: SaleListItem; today: Date }) {
  const debt = s.salePrice - s.paidAmount
  if (s.cancelledAt) return <span className="text-xs text-muted-foreground">—</span>
  if (debt <= 0) {
    return (
      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        оплачено
      </span>
    )
  }
  const late = !!s.dueDate && s.dueDate < today
  return (
    <div className="text-right">
      <div className="font-semibold text-amber-700 tabular-nums dark:text-amber-400">долг {formatMoney(debt)}</div>
      {s.paidAmount > 0 && <div className="text-xs text-muted-foreground tabular-nums">оплачено {formatMoney(s.paidAmount)}</div>}
      <div className={cn("text-xs", late ? "font-medium text-destructive" : "text-muted-foreground")}>
        {s.dueDate ? `${late ? "просрочен с" : "до"} ${formatDate(s.dueDate)}` : "срок не указан"}
      </div>
    </div>
  )
}

function Actions({ s, wide }: { s: SaleListItem; wide?: boolean }) {
  if (s.cancelledAt || s.paidAmount >= s.salePrice) {
    return (
      <Link href={`/sales/${s.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
        Подробнее
      </Link>
    )
  }
  return <SalePaymentButton saleId={s.id} title={s.phone.model} debt={s.salePrice - s.paidAmount} className={wide ? "w-full" : undefined} />
}
