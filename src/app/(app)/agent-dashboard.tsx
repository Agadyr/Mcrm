import Link from "next/link"
import { ACTIVE_VERIFICATION_STATUSES } from "@/lib/labels"
import { BriefcaseIcon, HandCoinsIcon, PlusIcon, ShieldCheckIcon, TrendingUpIcon, UserSearchIcon, WalletIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { formatDate, formatMoney } from "@/lib/format"
import { addDays, OVERDUE_DAYS, startOfMonth, todayDate } from "@/lib/dates"
import { buttonVariants } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { VerificationStatusBadge } from "@/components/status-badge"
import { ListCard, ListRow, Stat } from "@/components/dashboard-ui"
import { cn } from "@/lib/utils"
import { WhatsAppLink } from "@/components/whatsapp-link"
import { TelegramHint } from "@/components/telegram-hint"
import { owedToAgentWhere, travelerDebtWhere } from "@/server/verification-filters"

/** Главная верификатора: работа, деньги, телефоны от компаний */
export async function AgentDashboard({
  userId,
  name,
  telegramLinked,
}: {
  userId: string
  name: string
  telegramLinked: boolean
}) {
  const monthStart = startOfMonth(todayDate())
  const mine = { agentId: userId }

  const [active, owedToMe, iOwe, monthDone, needPerson, inProgress, byCompany, overdue] = await Promise.all([
    prisma.verification.count({ where: { ...mine, status: { in: ACTIVE_VERIFICATION_STATUSES } } }),
    prisma.verification.aggregate({ where: owedToAgentWhere(userId), _sum: { agentFee: true }, _count: true }),
    prisma.verification.aggregate({ where: travelerDebtWhere(userId), _sum: { payment: true }, _count: true }),
    prisma.verification.findMany({
      where: { ...mine, status: "VERIFIED", completedAt: { gte: monthStart } },
      select: { agentFee: true, payment: true },
    }),
    // переданы компаниями, а человек ещё не найден
    prisma.verification.findMany({
      where: { ...mine, verifierId: null, status: "HANDED" },
      include: { owner: { select: { name: true, login: true, companyName: true } } },
      orderBy: { handedAt: "asc" },
      take: 5,
    }),
    // человек найден, верификация идёт
    prisma.verification.findMany({
      where: { ...mine, status: "IN_PROGRESS" },
      include: { owner: { select: { name: true, login: true, companyName: true } }, verifier: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.verification.groupBy({
      by: ["ownerId"],
      where: { ...mine, NOT: { ownerId: userId } },
      _count: true,
      _sum: { agentFee: true },
    }),
    prisma.verification.count({
      where: { ...mine, status: { in: ACTIVE_VERIFICATION_STATUSES }, handedAt: { lte: addDays(todayDate(), -OVERDUE_DAYS) } },
    }),
  ])

  const earned = monthDone.reduce((a, v) => a + v.agentFee - v.payment, 0)
  const companies = byCompany.length
    ? await prisma.user.findMany({
        where: { id: { in: byCompany.map((c) => c.ownerId) } },
        select: { id: true, name: true, login: true, companyName: true, phone: true },
      })
    : []
  const companyDebt = await Promise.all(
    byCompany.map((c) =>
      prisma.verification.aggregate({ where: { ...owedToAgentWhere(userId), ownerId: c.ownerId }, _sum: { agentFee: true } })
    )
  )

  return (
    <>
      <PageHeader
        title={`Привет, ${name.split(" ")[0]}!`}
        description="Ваши верификации и деньги"
        actions={
          <Link href="/verifications/new" className={cn(buttonVariants(), "hidden sm:inline-flex")}>
            <PlusIcon /> Добавить телефон
          </Link>
        }
      />

      <TelegramHint linked={telegramLinked} text="Сообщим, когда компания передаст вам телефон" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat href="/verifications?status=active" icon={<ShieldCheckIcon />} tone="amber" label="В работе" value={`${active} шт.`} sub={overdue ? `долго (${OVERDUE_DAYS}+ дн.): ${overdue}` : "передан или в процессе"} accent={overdue > 0} />
        <Stat
          href="/verifications"
          icon={<HandCoinsIcon />}
          tone="emerald"
          label="Мне должны"
          value={formatMoney(owedToMe._sum.agentFee ?? 0)}
          sub={owedToMe._count ? `не оплачено: ${owedToMe._count}` : "всё оплачено"}
        />
        <Stat
          href="/verifications?paid=no"
          icon={<WalletIcon />}
          tone="rose"
          label="Я должен людям"
          value={formatMoney(iOwe._sum.payment ?? 0)}
          sub={iOwe._count ? `не оплачено: ${iOwe._count}` : "всё оплачено"}
        />
        <Stat
          href="/verifications?status=VERIFIED"
          icon={<TrendingUpIcon />}
          tone="indigo"
          label="Заработал за месяц"
          value={formatMoney(earned)}
          sub={`верифицировано: ${monthDone.length}`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ListCard title="Нужно найти человека" href="/verifications?status=HANDED" empty="Все телефоны уже отданы людям">
          {needPerson.map((v) => (
            <ListRow
              key={v.id}
              href={`/verifications/${v.id}`}
              icon={<UserSearchIcon />}
              title={v.phoneModel}
              sub={`от ${v.owner.companyName || v.owner.name || v.owner.login} · ${formatDate(v.handedAt)}`}
              right={<span className="font-medium tabular-nums">{formatMoney(v.agentFee)}</span>}
            />
          ))}
        </ListCard>
        <ListCard title="В процессе" href="/verifications?status=IN_PROGRESS" empty="Нет телефонов в процессе">
          {inProgress.map((v) => (
            <ListRow
              key={v.id}
              href={`/verifications/${v.id}`}
              icon={<ShieldCheckIcon />}
              title={v.phoneModel}
              sub={[v.owner.companyName || v.owner.name || v.owner.login, v.verifier?.fullName].filter(Boolean).join(" · ")}
              right={<VerificationStatusBadge status={v.status} />}
            />
          ))}
        </ListCard>
      </div>

      {companies.length > 0 && (
        <section className="mt-4 rounded-2xl border bg-card shadow-xs">
          <div className="flex items-center gap-2 px-5 pt-4 pb-2">
            <BriefcaseIcon className="size-5 text-muted-foreground" />
            <h2 className="font-semibold">Компании</h2>
          </div>
          <ul className="divide-y px-2 pb-2">
            {byCompany.map((c, i) => {
              const co = companies.find((x) => x.id === c.ownerId)
              const debt = companyDebt[i]._sum.agentFee ?? 0
              return (
                <li key={c.ownerId} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{co?.companyName || co?.name || co?.login}</div>
                    <div className="text-xs text-muted-foreground">
                      телефонов: {c._count}
                      {co?.phone && (
                        <>
                          {" · "}
                          <a href={`tel:${co.phone}`} className="hover:text-primary">
                            {co.phone}
                          </a>
                          <WhatsAppLink phone={co.phone} className="ml-1 align-middle" />
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn("font-semibold tabular-nums", debt > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                      {debt > 0 ? formatMoney(debt) : "оплачено"}
                    </div>
                    {debt > 0 && <div className="text-xs text-muted-foreground">должны вам</div>}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </>
  )
}
