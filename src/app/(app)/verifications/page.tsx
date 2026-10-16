import type { Metadata } from "next"
import Link from "next/link"
import { BriefcaseIcon, DownloadIcon, PlusIcon, ShieldCheckIcon, UserSearchIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/auth"
import { formatDate, formatMoney } from "@/lib/format"
import { buttonVariants } from "@/components/ui/button"
import type { StatusTab } from "@/components/status-tabs"
import { ACTIVE_VERIFICATION_STATUSES, VERIFICATION_STATUS_DOT, VERIFICATION_STATUS_LABEL, VERIFICATION_STATUSES } from "@/lib/labels"
import { CopyText } from "@/components/copy-text"
import { EmptyState, PageHeader } from "@/components/page-header"
import { Pagination } from "@/components/pagination"
import { VerificationStatusPill } from "@/components/status-badge"
import { RfsBadge, RfsCheckButton, type RfsTarget } from "@/components/rfs-check-dialog"
import { cn } from "@/lib/utils"
import { getListLayout, listClasses } from "@/lib/list-layout"
import { displayName } from "@/server/access"
import { WhatsAppLink } from "@/components/whatsapp-link"
import { DaysBadge } from "@/components/days-badge"
import { phoneText } from "@/lib/whatsapp"
import type { SearchParams } from "@/server/phone-filters"
import {
  agentDebtWhere,
  buildVerificationWhere,
  owedToAgentWhere,
  parseVerificationFilters,
  travelerDebtWhere,
  verificationFiltersToParams,
  verificationListInclude,
  type VerificationListItem,
} from "@/server/verification-filters"
import { VerificationFiltersBar } from "./verification-filters-bar"
import { AgentPaidToggle, PaidToggle, QuickStatus, VerificationRowMenu } from "./verification-row-actions"

export const metadata: Metadata = { title: "Верификация телефонов" }

const PAGE_SIZE = 50

function rfsTarget(v: VerificationListItem): RfsTarget {
  return {
    phoneId: v.phoneId,
    title: v.phoneModel,
    imei1: v.imei1,
    imei2: v.imei2,
    rfsStatus: v.phone?.rfsStatus,
    rfsCheckedAt: v.phone?.rfsCheckedAt,
  }
}

/**
 * Убираем данные человека (и заметку верификатора), если пользователь не ведёт эту верификацию:
 * компания не должна получить их даже в коде страницы.
 */
function sanitize(v: VerificationListItem, userId: string): VerificationListItem {
  if ((v.agentId ?? v.ownerId) === userId) return v
  return { ...v, verifier: null, country: null, payment: 0, isPaid: false, paidAt: null, agentNote: null }
}

/** Что видит и что может пользователь в строке */
function viewOf(v: VerificationListItem, userId: string, isVerifier: boolean) {
  const isOwner = v.ownerId === userId
  const viaAgent = !!v.agentId && v.agentId !== v.ownerId
  const isHandler = (v.agentId ?? v.ownerId) === userId
  return {
    isOwner,
    viaAgent,
    isHandler,
    /** верификатор смотрит телефон компании */
    fromCompany: !isOwner ? v.owner.companyName || displayName(v.owner) : null,
    /** у верификатора есть доход за этот телефон */
    hasIncome: v.agentId === userId,
    /** страна, где был человек, — нужна только верификатору */
    showCountry: isVerifier,
  }
}

type View = ReturnType<typeof viewOf>

function Imeis({ v }: { v: VerificationListItem }) {
  return (
    <>
      {[v.imei1, v.imei2]
        .filter((x): x is string => !!x)
        .map((imei) => (
          <CopyText key={imei} value={imei} className="flex" quiet />
        ))}
    </>
  )
}

/** Сообщение верификатора компании: «верифицирован» или вопрос по телефону */
function companyMessage(v: VerificationListItem) {
  return v.status === "VERIFIED" ? `Здравствуйте! Телефон верифицирован:\n${phoneText(v)}` : `Здравствуйте! По телефону на верификацию:\n${phoneText(v)}`
}

/** Поверх ссылки-карточки: пустое место пропускает нажатие к ссылке, а кнопки и ссылки внутри работают сами */
const overlayControls =
  "relative z-10 pointer-events-none [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_label]:pointer-events-auto"

/** Кому отдан телефон */
/** compact — мобильная карточка: без служебных подписей */
function Who({ v, view, compact }: { v: VerificationListItem; view: View; compact?: boolean }) {
  if (view.viaAgent && view.isOwner) {
    return (
      <div>
        <div className="flex items-center gap-1.5 font-medium">
          <BriefcaseIcon className="size-3.5 text-primary" />
          {v.agent ? displayName(v.agent) : "—"}
        </div>
        {v.agent?.phone && (
          <div className="flex items-center gap-1">
            <a href={`tel:${v.agent.phone}`} className="text-xs text-muted-foreground">
              {v.agent.phone}
            </a>
            <WhatsAppLink phone={v.agent.phone} text={`Здравствуйте! Передаём телефон на верификацию:\n${phoneText(v)}`} />
          </div>
        )}
        {!compact && <div className="text-xs text-muted-foreground">{v.verifierId ? "человек найден" : "ищет человека"}</div>}
      </div>
    )
  }
  if (!v.verifier) {
    return (
      <Link href={`/verifications/${v.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400 hover:underline">
        <UserSearchIcon className="size-4" /> Выбрать человека
      </Link>
    )
  }
  return (
    <div>
      <Link href={`/verifications?verifier=${v.verifier.id}`} className="font-medium hover:text-primary">
        {v.verifier.fullName}
      </Link>
      {v.verifier.phone && (
        <div className="flex items-center gap-1">
          <a href={`tel:${v.verifier.phone}`} className="text-xs text-muted-foreground">
            {v.verifier.phone}
          </a>
          <WhatsAppLink phone={v.verifier.phone} text={`Здравствуйте! Данные для верификации:\n${phoneText(v)}`} />
        </div>
      )}
      {view.showCountry && v.country && <div className="text-xs text-muted-foreground">{v.country}</div>}
    </div>
  )
}

/** Деньги по строке */
/** compact — мобильная карточка: только суммы, без отметок об оплате */
function Money({ v, view, align = "right", compact }: { v: VerificationListItem; view: View; align?: "right" | "left"; compact?: boolean }) {
  const cls = cn("flex flex-col gap-0.5", align === "right" ? "items-end text-right" : "items-start")
  // компания передала верификатору — платит ему
  if (view.viaAgent && view.isOwner) {
    return (
      <div className={cls}>
        <span className="text-xs text-muted-foreground">Верификатору</span>
        <span className="font-medium tabular-nums">{formatMoney(v.agentFee)}</span>
        {!compact && v.agentFee > 0 && <AgentPaidToggle id={v.id} paid={v.agentPaid} />}
      </div>
    )
  }
  // верификатор: доход, расход, прибыль
  if (view.hasIncome) {
    const profit = v.agentFee - v.payment
    return (
      <div className={cls}>
        <span className="text-xs text-muted-foreground">
          Доход <b className="font-medium text-foreground tabular-nums">{formatMoney(v.agentFee)}</b>
        </span>
        {compact ? null : view.isOwner ? (
          v.agentFee > 0 && <AgentPaidToggle id={v.id} paid={v.agentPaid} label="клиент оплатил" />
        ) : (
          <span className={cn("text-xs", v.agentPaid ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>
            {v.agentPaid ? "компания оплатила" : "компания не оплатила"}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          Человеку <b className="font-medium text-foreground tabular-nums">{v.payment ? formatMoney(v.payment) : "—"}</b>
        </span>
        {!compact && v.payment > 0 && <PaidToggle id={v.id} isPaid={v.isPaid} />}
        <span className={cn("text-xs font-semibold tabular-nums", profit < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400")}>прибыль {formatMoney(profit)}</span>
      </div>
    )
  }
  // компания сама платит человеку
  return (
    <div className={cls}>
      <span className="font-medium tabular-nums">{v.payment ? formatMoney(v.payment) : "—"}</span>
      {!compact && v.payment > 0 && <PaidToggle id={v.id} isPaid={v.isPaid} />}
    </div>
  )
}

/** Статус меняется прямо здесь: у ведущего и у владельца телефона (компания может поставить статус и за верификатора) */
function Status({ v, view, className }: { v: VerificationListItem; view: View; className?: string }) {
  if (view.isHandler || view.isOwner) return <QuickStatus id={v.id} status={v.status} className={className} />
  return <VerificationStatusPill status={v.status} className={className} title="Статус ведёт верификатор" />
}

export default async function VerificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const lc = listClasses(await getListLayout())
  const user = await requireUser()
  const userId = user.id
  const isVerifier = user.role === "VERIFIER"
  const filters = parseVerificationFilters(await searchParams)
  const where = buildVerificationWhere(filters, userId)

  const [rawItems, total, people, agents, byStatus, travelerDebt, agentDebt, owedToMe] = await Promise.all([
    prisma.verification.findMany({
      where,
      include: verificationListInclude,
      orderBy: [{ handedAt: "desc" }, { createdAt: "desc" }],
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.verification.count({ where }),
    prisma.verifier.findMany({ where: { ownerId: userId }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    isVerifier
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: { role: "VERIFIER", agentVerifications: { some: { ownerId: userId } } },
          select: { id: true, name: true, login: true },
        }),
    prisma.verification.groupBy({
      by: ["status"],
      where: buildVerificationWhere({ ...filters, status: "" }, userId),
      _count: true,
    }),
    prisma.verification.aggregate({ where: travelerDebtWhere(userId), _sum: { payment: true } }),
    isVerifier ? Promise.resolve(null) : prisma.verification.aggregate({ where: agentDebtWhere(userId), _sum: { agentFee: true } }),
    isVerifier ? prisma.verification.aggregate({ where: owedToAgentWhere(userId), _sum: { agentFee: true } }) : Promise.resolve(null),
  ])

  const items = rawItems.map((v) => sanitize(v, userId))
  const count = (s?: string[]) => byStatus.filter((r) => !s || s.includes(r.status)).reduce((a, r) => a + r._count, 0)
  const statusTabs: StatusTab[] = [
    { value: "", label: "Все", count: count() },
    ...VERIFICATION_STATUSES.map((s) => ({
      value: s,
      label: VERIFICATION_STATUS_LABEL[s],
      dot: VERIFICATION_STATUS_DOT[s],
      count: count([s]),
    })),
  ]
  const whoOptions = [...agents.map((a) => ({ id: a.id, fullName: `Верификатор: ${displayName(a)}` })), ...people]

  const params = verificationFiltersToParams(filters)
  const exportQs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString()
  const peopleDebt = travelerDebt._sum.payment ?? 0

  return (
    <>
      <PageHeader
        title={isVerifier ? "Верификации" : "Верификация телефонов"}
        description={
          isVerifier ? (
            <>
              В работе <b className="text-foreground">{count(ACTIVE_VERIFICATION_STATUSES)}</b> · мне должны{" "}
              <b className="text-foreground">{formatMoney(owedToMe?._sum.agentFee ?? 0)}</b> · я должен людям{" "}
              <b className="text-foreground">{formatMoney(peopleDebt)}</b>
            </>
          ) : (
            <>
              В работе <b className="text-foreground">{count(ACTIVE_VERIFICATION_STATUSES)}</b> · долг людям{" "}
              <b className="text-foreground">{formatMoney(peopleDebt)}</b> · верификаторам{" "}
              <b className="text-foreground">{formatMoney(agentDebt?._sum.agentFee ?? 0)}</b>
            </>
          )
        }
        actions={
          <>
            <a href={`/api/export/verifications${exportQs ? `?${exportQs}` : ""}`} className={buttonVariants({ variant: "outline" })}>
              <DownloadIcon /> Excel
            </a>
            <Link href="/verifications/new" className={buttonVariants()}>
              <PlusIcon /> {isVerifier ? "Добавить телефон" : "Новая верификация"}
            </Link>
          </>
        }
      />
      <VerificationFiltersBar verifiers={whoOptions} statusTabs={statusTabs} />

      {items.length === 0 ? (
        <EmptyState icon={<ShieldCheckIcon className="size-6" />}>
          {!Object.values(params).some(Boolean) ? (
            isVerifier ? (
              <>
                Пока пусто. Телефоны от компаний появятся здесь автоматически, а свои можно{" "}
                <Link href="/verifications/new" className="font-medium text-primary underline">
                  добавить сами
                </Link>
                .
              </>
            ) : (
              <>
                Верификаций пока нет.{" "}
                <Link href="/verifications/new" className="font-medium text-primary underline">
                  Отдать телефон на верификацию
                </Link>
              </>
            )
          ) : (
            "Ничего не найдено. Попробуйте изменить фильтры."
          )}
        </EmptyState>
      ) : (
        <>
          {lc.showTable && (
            <div className={lc.table}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Телефон</th>
                    <th className="px-4 py-3 font-medium">IMEI</th>
                    <th className="px-4 py-3 font-medium">Кому отдан</th>
                    <th className="px-4 py-3 font-medium">Даты</th>
                    <th className="px-4 py-3 text-right font-medium">Деньги</th>
                    <th className="px-4 py-3 text-center font-medium">Статус</th>
                  <th className="w-0 py-3 pr-3"><span className="sr-only">Действия</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((v) => {
                    const view = viewOf(v, userId, isVerifier)
                    return (
                      <tr key={v.id} className="group align-top transition-colors hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <Link href={`/verifications/${v.id}`} className="font-semibold hover:text-primary">
                            {v.phoneModel}
                          </Link>
                          {view.fromCompany ? (
                            <div className="flex items-center gap-1 text-xs font-medium text-primary">
                              от {view.fromCompany}
                              <WhatsAppLink phone={v.owner.phone} text={companyMessage(v)} />
                            </div>
                          ) : !v.phoneId ? (
                            <div className="text-xs text-muted-foreground">не в товарах</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <Imeis v={v} />
                          {v.phone && <RfsBadge status={v.phone.rfsStatus} checkedAt={v.phone.rfsCheckedAt} />}
                        </td>
                        <td className="px-4 py-3">
                          <Who v={v} view={view} />
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div>Передан {formatDate(v.handedAt)}</div>
                          {v.completedAt && <div className="text-muted-foreground">Заверш. {formatDate(v.completedAt)}</div>}
                          {ACTIVE_VERIFICATION_STATUSES.includes(v.status) && <DaysBadge since={v.handedAt} className="mt-1" />}
                        </td>
                        <td className="px-4 py-3">
                          <Money v={v} view={view} />
                        </td>
                        <td className="px-4 py-3 text-center align-top">
                          <Status v={v} view={view} />
                        </td>
                        <td className="py-3 pr-3 align-top">
                          <VerificationRowMenu id={v.id} phoneId={v.phoneId} rfs={rfsTarget(v)} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {lc.showCards && (
            <div className={lc.cards}>
              {items.map((v) => {
                const view = viewOf(v, userId, isVerifier)
                return (
                  // вся карточка — ссылка (растянутая на карточку через after:), кнопки внутри остаются кликабельными
                  <div key={v.id} className="relative rounded-2xl border bg-card shadow-xs transition-colors active:bg-muted/40">
                    <div className="flex items-start justify-between gap-2 p-4 pb-3">
                      <div className="min-w-0">
                        <Link href={`/verifications/${v.id}`} className="block font-semibold after:absolute after:inset-0 after:rounded-2xl">
                          {v.phoneModel}
                        </Link>
                        {view.fromCompany && <div className="flex items-center gap-1 text-xs font-medium text-primary">от {view.fromCompany}</div>}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">Передан {formatDate(v.handedAt)}</div>
                      </div>
                      <div className={overlayControls}>
                        <Status v={v} view={view} />
                      </div>
                    </div>
                    <div className={cn("flex items-end justify-between gap-2 px-4 pb-3 text-sm", overlayControls)}>
                      <div>
                        <Imeis v={v} />
                        {v.phone && <RfsBadge status={v.phone.rfsStatus} checkedAt={v.phone.rfsCheckedAt} />}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {view.fromCompany && <WhatsAppLink phone={v.owner.phone} text={companyMessage(v)} label="Компании" />}
                        <RfsCheckButton target={rfsTarget(v)} size="sm" variant="secondary" label="РФС" />
                      </div>
                    </div>
                    <div className={cn("flex items-start justify-between gap-3 rounded-b-2xl border-t bg-muted/30 px-4 py-3 text-sm", overlayControls)}>
                      <Who v={v} view={view} compact />
                      <Money v={v} view={view} compact />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
      <Pagination page={filters.page} pageCount={Math.ceil(total / PAGE_SIZE)} basePath="/verifications" params={params} />
    </>
  )
}
