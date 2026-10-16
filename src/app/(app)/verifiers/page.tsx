import type { Metadata } from "next"
import Link from "next/link"
import { formatMoney } from "@/lib/format"
import { requireUser } from "@/lib/auth"
import { EmptyState, PageHeader } from "@/components/page-header"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getAgentStats, getVerifierStats } from "../verifications/form-data"
import { buttonVariants } from "@/components/ui/button"
import { UserAvatar } from "@/components/user-avatar"
import { cn } from "@/lib/utils"
import { BriefcaseIcon, SendIcon } from "lucide-react"
import { DeleteVerifierButton, VerifierDialogButton } from "./verifier-dialog"

export const metadata: Metadata = { title: "Верификаторы" }

export default async function VerifiersPage() {
  const user = await requireUser()
  const isVerifier = user.role === "VERIFIER"
  const [verifiers, agents] = await Promise.all([
    getVerifierStats(user.id),
    isVerifier ? Promise.resolve([]) : getAgentStats(user.id),
  ])
  const totalDebt = verifiers.reduce((a, v) => a + v.debtSum, 0)
  const totalPaid = verifiers.reduce((a, v) => a + v.paidSum, 0)

  return (
    <>
      <PageHeader
        title={isVerifier ? "Мои люди" : "Верификаторы"}
        description={
          isVerifier
            ? `Люди, которые были за границей: ${verifiers.length} · выплачено ${formatMoney(totalPaid)} · долг ${formatMoney(totalDebt)}`
            : "Верификаторы в системе и люди, которым вы отдаёте телефоны сами"
        }
        actions={<VerifierDialogButton />}
      />

      {agents.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <BriefcaseIcon className="size-4 text-primary" /> Верификаторы в системе
          </h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((a) => (
              <div key={a.id} className="flex flex-col rounded-2xl border bg-card p-4 shadow-xs">
                <div className="flex items-start gap-3">
                  <UserAvatar name={a.name} login={a.login} className="size-11" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/verifications?verifier=${a.id}`} className="block truncate font-semibold hover:text-primary">
                      {a.name || a.login}
                    </Link>
                    <div className="truncate text-sm text-muted-foreground">
                      {a.phone ? <a href={`tel:${a.phone}`}>{a.phone}</a> : `@${a.login}`}
                      {a.companyName ? ` · ${a.companyName}` : ""}
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
                  <div className="rounded-xl bg-muted/60 py-2">
                    <div className="text-base font-semibold text-foreground tabular-nums">{a.activeCount}</div>в работе
                  </div>
                  <div className="rounded-xl bg-muted/60 py-2">
                    <div className="text-base font-semibold text-foreground tabular-nums">{a.verifiedCount}</div>готово
                  </div>
                  <div className="rounded-xl bg-muted/60 py-2">
                    <div className={cn("text-base font-semibold tabular-nums", a.debtSum ? "text-amber-700 dark:text-amber-400" : "text-foreground")}>
                      {a.debtSum ? formatMoney(a.debtSum) : "0"}
                    </div>
                    вы должны
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Link href={`/verifications/batch?agent=${a.id}`} className={cn(buttonVariants({ variant: "secondary" }), "flex-1")}>
                    <SendIcon /> Несколько
                  </Link>
                  <Link href={`/verifications/new?agent=${a.id}`} className={cn(buttonVariants({ variant: "secondary" }), "flex-1")}>
                    <SendIcon /> Один
                  </Link>
                </div>
              </div>
            ))}
          </div>
          <h2 className="mt-6 font-semibold">Мои люди</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Если отдаёте телефоны сами. Выплачено {formatMoney(totalPaid)} · долг {formatMoney(totalDebt)}
          </p>
        </section>
      )}
      {verifiers.length === 0 ? (
        <EmptyState>Справочник пуст. Люди добавляются здесь или при создании верификации.</EmptyState>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-xs md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>ФИО</TableHead>
                  <TableHead>Телефон</TableHead>
                  <TableHead className="text-right">Верифицировал</TableHead>
                  <TableHead className="text-right">В работе</TableHead>
                  <TableHead className="text-right">Отказы</TableHead>
                  <TableHead className="text-right">Выплачено</TableHead>
                  <TableHead className="text-right">Долг</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {verifiers.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="whitespace-normal">
                      <Link href={`/verifications?verifier=${v.id}`} className="font-medium hover:underline">
                        {v.fullName}
                      </Link>
                      {v.note && <div className="text-xs text-muted-foreground">{v.note}</div>}
                    </TableCell>
                    <TableCell>{v.phone ? <a href={`tel:${v.phone}`}>{v.phone}</a> : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {v.verifiedCount} <span className="text-muted-foreground">из {v.totalCount}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{v.activeCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.rejectedCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(v.paidSum)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {v.debtSum ? <span className="text-amber-700 dark:text-amber-400">{formatMoney(v.debtSum)}</span> : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex">
                        <VerifierDialogButton verifier={v} />
                        <DeleteVerifierButton id={v.id} name={v.fullName} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-2 md:hidden">
            {verifiers.map((v) => (
              <div key={v.id} className="rounded-2xl border bg-card p-4 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/verifications?verifier=${v.id}`} className="min-w-0">
                    <div className="font-medium">{v.fullName}</div>
                    {v.phone && <div className="text-xs text-muted-foreground">{v.phone}</div>}
                  </Link>
                  <div className="flex">
                    <VerifierDialogButton verifier={v} />
                    <DeleteVerifierButton id={v.id} name={v.fullName} />
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 border-t pt-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Верифиц.</div>
                    {v.verifiedCount} из {v.totalCount}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Выплачено</div>
                    <span className="tabular-nums">{formatMoney(v.paidSum)}</span>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Долг</div>
                    <span className="tabular-nums">{v.debtSum ? formatMoney(v.debtSum) : "—"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
