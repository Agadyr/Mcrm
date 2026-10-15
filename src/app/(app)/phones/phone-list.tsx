import Link from "next/link"
import { ChevronRightIcon, ShieldIcon } from "lucide-react"
import { CopyText } from "@/components/copy-text"
import { PhoneStatusBadge, VerifiedMark } from "@/components/status-badge"
import { todayDate } from "@/lib/dates"
import { formatDate, formatMemory, formatMoney, phoneTitle } from "@/lib/format"
import { ACTIVE_VERIFICATION_STATUSES, PHONE_CONDITION_LABEL, VERIFICATION_STATUS_COLOR, VERIFICATION_STATUS_LABEL } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { listClasses, type ListLayout } from "@/lib/list-layout"
import type { PhoneListItem } from "@/server/phone-filters"
import { PhoneActions, SellButton } from "./phone-actions"
import { RfsBadge, RfsCheckButton } from "@/components/rfs-check-dialog"

function Badges({ phone }: { phone: PhoneListItem }) {
  const v = phone.verifications[0]
  const activeVerification = v && ACTIVE_VERIFICATION_STATUSES.includes(v.status)
  return (
    <div className="flex flex-wrap items-center gap-1">
      <PhoneStatusBadge status={phone.status} />
      {phone.isVerified && <VerifiedMark />}
      {activeVerification && (
        <span
          title={`Телефон на верификации, статус «${VERIFICATION_STATUS_LABEL[v.status]}»`}
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ring-current/10",
            VERIFICATION_STATUS_COLOR[v.status],
          )}
        >
          <ShieldIcon className="size-3.5" />
          Верификация: {VERIFICATION_STATUS_LABEL[v.status].toLowerCase()}
        </span>
      )}
      <RfsBadge status={phone.rfsStatus} checkedAt={phone.rfsCheckedAt} />
    </div>
  )
}

/** «прибыль +40 000 ₸» или «убыток −10 000 ₸» */
function Profit({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("tabular-nums", value < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400", className)}>
      {value < 0 ? "убыток " : "прибыль "}
      {value > 0 ? "+" : ""}
      {formatMoney(value)}
    </span>
  )
}

type Sale = PhoneListItem["sales"][number]

/** Сколько покупатель ещё должен; просрочено ли */
function Debt({ sale, className }: { sale: Sale; className?: string }) {
  const debt = sale.salePrice - sale.paidAmount
  if (debt <= 0) return null
  const overdue = !!sale.dueDate && sale.dueDate < todayDate()
  return (
    <span className={cn("tabular-nums font-medium", overdue ? "text-destructive" : "text-amber-700 dark:text-amber-400", className)}>
      долг {formatMoney(debt)}
      {sale.dueDate && (overdue ? " · просрочен" : ` · до ${formatDate(sale.dueDate).slice(0, 5)}`)}
    </span>
  )
}

function details(p: PhoneListItem) {
  return [formatMemory(p.memoryGb), p.color, PHONE_CONDITION_LABEL[p.condition]].filter(Boolean).join(" · ")
}

function actionsTarget(p: PhoneListItem) {
  return {
    id: p.id,
    title: phoneTitle(p),
    status: p.status,
    purchasePrice: p.purchasePrice,
    rfs: { phoneId: p.id, title: phoneTitle(p), imei1: p.imei1, imei2: p.imei2, rfsStatus: p.rfsStatus, rfsCheckedAt: p.rfsCheckedAt },
  }
}

function FromCompany({ p }: { p: PhoneListItem }) {
  return <span className="text-xs font-medium text-primary">от {p.owner.companyName || p.owner.name || p.owner.login}</span>
}

/** viewerId — текущий пользователь: чужие телефоны (переданные верификатору) показываем без цен и действий */
export function PhoneList({ phones, viewerId, layout = "both" }: { phones: PhoneListItem[]; viewerId: string; layout?: ListLayout }) {
  const lc = listClasses(layout)
  return (
    <>
      {/* Таблица — компьютер */}
      {lc.showTable && (
        <div className={lc.table}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-3 font-medium">Телефон</th>
                <th className="px-4 py-3 font-medium">IMEI / серийный</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 text-right font-medium">Закупка</th>
                <th className="px-4 py-3 text-right font-medium">Продажа</th>
                <th className="w-0 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {phones.map((p) => {
                const own = p.ownerId === viewerId
                const sale = own ? p.sales[0] : undefined
                return (
                  <tr key={p.id} className={cn("group align-top transition-colors hover:bg-muted/40", p.status === "SOLD" && "bg-muted/20")}>
                    <td className="px-4 py-3">
                      <Link href={`/phones/${p.id}`} className="font-semibold hover:text-primary">
                        {p.model}
                      </Link>
                      <div className="text-xs text-muted-foreground">{details(p)}</div>
                      {own ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          Поступил {formatDate(p.receivedAt)}
                          {p.supplier ? ` · ${p.supplier}` : ""}
                        </div>
                      ) : (
                        <FromCompany p={p} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <CopyText value={p.imei1} label="IMEI1" quiet />
                        {p.imei2 && <CopyText value={p.imei2} label="IMEI2" quiet className="text-muted-foreground" />}
                        {p.serialNumber && <CopyText value={p.serialNumber} label="S/N" quiet className="text-muted-foreground" />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badges phone={p} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {own ? formatMoney(p.purchasePrice) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {sale ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-medium tabular-nums">{formatMoney(sale.salePrice)}</span>
                          <Profit value={sale.salePrice - p.purchasePrice} className="text-xs" />
                          <Debt sale={sale} className="text-xs" />
                          <span className="text-xs text-muted-foreground">продан {formatDate(sale.soldAt)}</span>
                        </div>
                      ) : own && p.status !== "SOLD" ? (
                        <SellButton phone={actionsTarget(p)} className="-my-1" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      {own ? (
                        <PhoneActions phone={actionsTarget(p)} hideSell />
                      ) : (
                        <RfsCheckButton target={actionsTarget(p).rfs} size="icon-sm" variant="ghost" />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Карточки — телефон */}
      {lc.showCards && (
        <div className={lc.cards}>
          {phones.map((p) => {
            const own = p.ownerId === viewerId
            const sale = own ? p.sales[0] : undefined
            return (
              <div key={p.id} className="rounded-2xl border bg-card shadow-xs">
                <Link href={`/phones/${p.id}`} className="block p-4 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold">{p.model}</div>
                      <div className="text-sm text-muted-foreground">{details(p)}</div>
                    </div>
                    <ChevronRightIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground/60" />
                  </div>
                  <div className="mt-2.5">
                    <Badges phone={p} />
                  </div>
                </Link>
                <div className="px-4 pb-3 text-sm">
                  <CopyText value={p.imei1} label="IMEI1" />
                </div>
                <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2.5">
                  {sale ? (
                    <div className="text-sm">
                      <span className="font-semibold tabular-nums">{formatMoney(sale.salePrice)}</span>{" "}
                      <Profit value={sale.salePrice - p.purchasePrice} className="text-xs" />
                      <div className="text-xs text-muted-foreground">
                        продан {formatDate(sale.soldAt)}
                        <Debt sale={sale} className="block" />
                      </div>
                    </div>
                  ) : own ? (
                    <div className="text-sm">
                      <span className="font-semibold tabular-nums">{formatMoney(p.purchasePrice)}</span>
                      <div className="text-xs text-muted-foreground">закупка · {formatDate(p.receivedAt)}</div>
                    </div>
                  ) : (
                    <FromCompany p={p} />
                  )}
                  {own ? <PhoneActions phone={actionsTarget(p)} /> : <RfsCheckButton target={actionsTarget(p).rfs} size="sm" variant="secondary" label="РФС" />}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
