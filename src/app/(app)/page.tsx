import type { Metadata } from "next"
import { ACTIVE_VERIFICATION_STATUSES } from "@/lib/labels"
import Link from "next/link"
import {
  BanknoteIcon,
  HandCoinsIcon,
  PackageIcon,
  PlusIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  TrendingUpIcon,
  WalletIcon,
  WarehouseIcon,
} from "lucide-react"
import { prisma } from "@/lib/db"
import { addDays, OVERDUE_DAYS, startOfMonth, startOfWeek, todayDate } from "@/lib/dates"
import { formatDate, formatMoney, formatNumber, phoneTitle } from "@/lib/format"
import { PAYMENT_METHOD_LABEL } from "@/lib/labels"
import { buttonVariants } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { PhoneStatusBadge } from "@/components/status-badge"
import { agentDebtWhere, travelerDebtWhere } from "@/server/verification-filters"
import { debtWhere, overdueWhere } from "@/server/sale-filters"
import { AgentDashboard } from "./agent-dashboard"
import { TelegramHint } from "@/components/telegram-hint"
import { ListCard, ListRow, Stat } from "@/components/dashboard-ui"
import { requireUser } from "@/lib/auth"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Главная" }

export default async function DashboardPage() {
  const user = await requireUser()
  if (user.role === "VERIFIER")
    return <AgentDashboard userId={user.id} name={user.name || user.login} telegramLinked={!!user.telegramChatId} />
  const ownerId = user.id
  const today = todayDate()
  const monthStart = startOfMonth(today)
  const weekStart = startOfWeek(today)
  const periodStart = monthStart < weekStart ? monthStart : weekStart

  const [inStock, allStock, onVerification, debt, agentDebt, periodSales, lastSales, lastReceived, overdue, buyersDebt, buyersLate] =
    await Promise.all([
    prisma.phone.aggregate({ where: { ownerId, status: "IN_STOCK" }, _count: true, _sum: { purchasePrice: true } }),
    prisma.phone.aggregate({
      where: { ownerId, status: { in: ["IN_STOCK", "ON_VERIFICATION", "RESERVED"] } },
      _count: true,
      _sum: { purchasePrice: true },
    }),
    prisma.verification.count({ where: { ownerId, status: { in: ACTIVE_VERIFICATION_STATUSES } } }),
    prisma.verification.aggregate({ where: travelerDebtWhere(ownerId), _sum: { payment: true }, _count: true }),
    prisma.verification.aggregate({ where: agentDebtWhere(ownerId), _sum: { agentFee: true }, _count: true }),
    prisma.sale.findMany({
      where: { cancelledAt: null, soldAt: { gte: periodStart }, phone: { ownerId } },
      select: { salePrice: true, soldAt: true, phone: { select: { purchasePrice: true } } },
    }),
    prisma.sale.findMany({
      where: { cancelledAt: null, phone: { ownerId } },
      orderBy: [{ soldAt: "desc" }, { createdAt: "desc" }],
      take: 5,
      include: { phone: true },
    }),
    prisma.phone.findMany({ where: { ownerId }, orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }], take: 5 }),
    prisma.verification.count({
      where: { ownerId, status: { in: ACTIVE_VERIFICATION_STATUSES }, handedAt: { lte: addDays(today, -OVERDUE_DAYS) } },
    }),
    prisma.sale.aggregate({ where: debtWhere(ownerId), _sum: { salePrice: true, paidAmount: true }, _count: true }),
    prisma.sale.count({ where: overdueWhere(ownerId) }),
  ])
  const buyersDebtSum = (buyersDebt._sum.salePrice ?? 0) - (buyersDebt._sum.paidAmount ?? 0)

  const tomorrow = addDays(today, 1)
  function summary(from: Date) {
    const list = periodSales.filter((s) => s.soldAt >= from && s.soldAt < tomorrow)
    return {
      count: list.length,
      revenue: list.reduce((a, s) => a + s.salePrice, 0),
      profit: list.reduce((a, s) => a + s.salePrice - s.phone.purchasePrice, 0),
    }
  }
  const periods = [
    { label: "Сегодня", ...summary(today) },
    { label: "С понедельника", ...summary(weekStart) },
    { label: "С начала месяца", ...summary(monthStart) },
  ]

  return (
    <>
      <PageHeader
        title="Главная"
        description={`Сводка на ${formatDate(today)}`}
        actions={
          <div className="hidden gap-2 sm:flex">
            <Link href="/verifications/new" className={buttonVariants({ variant: "outline" })}>
              <ShieldCheckIcon /> На верификацию
            </Link>
            <Link href="/phones/new" className={buttonVariants()}>
              <PlusIcon /> Добавить телефон
            </Link>
          </div>
        }
      />

      <TelegramHint linked={!!user.telegramChatId} text="Сообщим, когда верификатор закончит верификацию телефона" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Stat
          href="/phones?status=IN_STOCK"
          icon={<PackageIcon />}
          tone="emerald"
          label="В наличии"
          value={`${formatNumber(inStock._count)} шт.`}
          sub={formatMoney(inStock._sum.purchasePrice ?? 0)}
        />
        <Stat
          href="/phones"
          icon={<WarehouseIcon />}
          tone="indigo"
          label="Весь склад"
          value={`${formatNumber(allStock._count)} шт.`}
          sub={formatMoney(allStock._sum.purchasePrice ?? 0)}
        />
        <Stat
          href="/verifications?status=active"
          icon={<ShieldCheckIcon />}
          tone="amber"
          label="На верификации"
          value={`${formatNumber(onVerification)} шт.`}
          sub={overdue ? `долго в работе (${OVERDUE_DAYS}+ дн.): ${overdue}` : "передан или в процессе"}
          accent={overdue > 0}
        />
        <Stat
          href="/verifications?paid=no"
          icon={<WalletIcon />}
          tone="rose"
          label="Долг верификаторам"
          value={formatMoney((debt._sum.payment ?? 0) + (agentDebt._sum.agentFee ?? 0))}
          sub={
            debt._count + agentDebt._count
              ? `людям ${formatMoney(debt._sum.payment ?? 0)} · верификаторам ${formatMoney(agentDebt._sum.agentFee ?? 0)}`
              : "всё оплачено"
          }
        />
        <Stat
          href={buyersLate ? "/sales?state=overdue" : "/sales?state=debt"}
          icon={<HandCoinsIcon />}
          tone="indigo"
          label="Покупатели должны"
          value={formatMoney(buyersDebtSum)}
          sub={
            buyersDebt._count
              ? buyersLate
                ? `просрочено: ${buyersLate} из ${buyersDebt._count}`
                : `должников: ${buyersDebt._count}`
              : "долгов нет"
          }
          accent={buyersLate > 0}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <section className="mt-4 rounded-2xl border bg-card shadow-xs">
        <div className="flex items-center justify-between px-5 pt-4">
          <Link href="/sales" className="font-semibold hover:text-primary">
            Продажи →
          </Link>
          <TrendingUpIcon className="size-5 text-muted-foreground" />
        </div>
        <div className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {periods.map((p) => (
            <div key={p.label} className="px-5 py-4">
              <div className="text-sm text-muted-foreground">{p.label}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">{p.count}</span>
                <span className="text-sm text-muted-foreground">шт.</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Выручка</div>
                  <div className="font-medium tabular-nums">{formatMoney(p.revenue)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Прибыль</div>
                  <div className={cn("font-semibold tabular-nums", p.profit < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400")}>
                    {formatMoney(p.profit)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ListCard title="Последние продажи" href="/sales" empty="Продаж пока нет">
          {lastSales.map((s) => (
            <ListRow
              key={s.id}
              href={`/sales/${s.id}`}
              icon={<BanknoteIcon />}
              title={phoneTitle(s.phone)}
              sub={[
                formatDate(s.soldAt),
                s.paidAmount < s.salePrice ? `долг ${formatMoney(s.salePrice - s.paidAmount)}` : PAYMENT_METHOD_LABEL[s.paymentMethod],
                s.buyerName,
              ]
                .filter(Boolean)
                .join(" · ")}
              right={
                <>
                  <div className="font-medium tabular-nums">{formatMoney(s.salePrice)}</div>
                  <div
                    className={cn(
                      "text-xs tabular-nums",
                      s.salePrice - s.phone.purchasePrice < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"
                    )}
                  >
                    +{formatMoney(s.salePrice - s.phone.purchasePrice)}
                  </div>
                </>
              }
            />
          ))}
        </ListCard>
        <ListCard title="Последние поступления" href="/phones" empty="Поступлений пока нет">
          {lastReceived.map((p) => (
            <ListRow
              key={p.id}
              href={`/phones/${p.id}`}
              icon={<SmartphoneIcon />}
              title={phoneTitle(p)}
              sub={[formatDate(p.receivedAt), p.supplier].filter(Boolean).join(" · ")}
              right={
                <div className="flex flex-col items-end gap-1">
                  <span className="font-medium tabular-nums">{formatMoney(p.purchasePrice)}</span>
                  <PhoneStatusBadge status={p.status} />
                </div>
              }
            />
          ))}
        </ListCard>
      </div>
    </>
  )
}
