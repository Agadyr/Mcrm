import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronRightIcon, SearchIcon } from "lucide-react"
import { requireUser } from "@/lib/auth"
import { periodLabel, resolvePeriod } from "@/lib/analytics-period"
import { formatMoney, formatNumber } from "@/lib/format"
import { PAYMENT_METHOD_LABEL } from "@/lib/labels"
import { DataTable, Delta, Panel, RangeBar, ShareList, Stat, StatGrid, type Column } from "@/components/analytics-ui"
import { EmptyState, PageHeader } from "@/components/page-header"
import { cn } from "@/lib/utils"
import { getAnalytics, getEarliestActivity, type WorkerRow } from "@/server/analytics"

export const metadata: Metadata = { title: "Аналитика" }

const percent = (v: number) => `${formatNumber(v)}%`
const minus = (v: number) => (v ? `− ${formatMoney(v)}` : formatMoney(0))
const sum = <T,>(rows: T[], pick: (r: T) => number) => rows.reduce((a, r) => a + pick(r), 0)

/** Колонки таблицы по верификаторам и по людям одинаковые */
function workerColumns(who: string, href: (w: WorkerRow) => string, rows: WorkerRow[]): Column<WorkerRow>[] {
  const done = (w: WorkerRow) => w.verified + w.notRegistered + w.rejected
  const rate = (w: WorkerRow) => (done(w) ? `${formatNumber((w.verified / done(w)) * 100)}%` : "—")
  const total = {
    verified: sum(rows, (w) => w.verified),
    done: sum(rows, done),
  }
  return [
    {
      header: who,
      cell: (w) => (
        <Link href={href(w)} className="font-medium hover:text-primary">
          {w.name}
        </Link>
      ),
    },
    {
      header: "Передано",
      align: "right",
      cell: (w) => w.handed,
      total: sum(rows, (w) => w.handed),
    },
    {
      header: "Сейчас в работе",
      align: "right",
      cell: (w) => w.active || "—",
      total: sum(rows, (w) => w.active),
    },
    {
      header: "Верифицировано",
      align: "right",
      cell: (w) => w.verified,
      total: total.verified,
    },
    {
      header: "Не зарегистрирован",
      align: "right",
      cell: (w) => w.notRegistered || "—",
      total: sum(rows, (w) => w.notRegistered),
    },
    {
      header: "Отказ",
      align: "right",
      cell: (w) => w.rejected || "—",
      total: sum(rows, (w) => w.rejected),
    },
    {
      header: "Доля успешных",
      align: "right",
      cell: rate,
      total: total.done ? `${formatNumber((total.verified / total.done) * 100)}%` : "—",
    },
    {
      header: "Выплачено",
      align: "right",
      cell: (w) => formatMoney(w.paid),
      total: formatMoney(sum(rows, (w) => w.paid)),
    },
    {
      header: "Долг сейчас",
      align: "right",
      cell: (w) => (w.debt ? <span className="font-medium text-amber-700 dark:text-amber-400">{formatMoney(w.debt)}</span> : "—"),
      total: formatMoney(sum(rows, (w) => w.debt)),
    },
  ]
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const user = await requireUser()
  // у верификатора своя сводка на главной
  if (user.role === "VERIFIER") redirect("/")

  const sp = await searchParams
  const earliest = sp.range === "all" ? await getEarliestActivity(user.id) : null
  const period = resolvePeriod(sp, earliest)
  const a = await getAnalytics(user.id, period)
  const { current: c, previous: p, now } = a
  const vs = `к пред. ${period.days} дн.`

  return (
    <>
      <PageHeader
        title="Аналитика"
        description={`${periodLabel(period)} · ${period.days} ${period.days === 1 ? "день" : "дн."}`}
        actions={<RangeBar period={period} />}
      />

      {a.empty ? (
        <EmptyState icon={<SearchIcon className="size-6" />}>За выбранный период нет продаж, закупок и верификаций. Выберите другой период.</EmptyState>
      ) : (
        <div className="flex flex-col gap-4 sm:gap-5">
          {/* ── итоги периода: главные цифры крупно, остальные строкой ниже */}
          <section aria-label="Итоги периода" className="overflow-hidden rounded-2xl border bg-card shadow-xs">
            <StatGrid>
              <Stat
                size="lg"
                label="Выручка"
                value={formatMoney(c.revenue)}
                delta={<Delta now={c.revenue} before={p?.revenue} label={vs} />}
                sub="по цене продажи, с проданным в долг"
              />
              <Stat
                size="lg"
                label="Прибыль"
                value={formatMoney(c.profit)}
                delta={<Delta now={c.profit} before={p?.profit} label={vs} />}
                sub={`маржа ${formatNumber(c.margin)}% от выручки`}
              />
              <Stat
                size="lg"
                label="Чистая прибыль"
                value={formatMoney(c.netProfit)}
                tone={c.netProfit < 0 ? "negative" : undefined}
                delta={<Delta now={c.netProfit} before={p?.netProfit} label={vs} />}
                sub="прибыль минус выплаты за верификацию"
              />
              <Stat
                size="lg"
                label="Продано"
                value={`${formatNumber(c.soldCount)} шт.`}
                delta={<Delta now={c.soldCount} before={p?.soldCount} label={vs} />}
                sub={c.soldCount ? `средний чек ${formatMoney(c.avgCheck)}` : "продаж не было"}
              />
            </StatGrid>
            <StatGrid className="border-t [&>*]:bg-[color-mix(in_oklab,var(--muted)_45%,var(--card))]">
              <Stat
                size="sm"
                label="Закуплено"
                value={`${formatNumber(c.purchasedCount)} шт.`}
                delta={<Delta now={c.purchasedCount} before={p?.purchasedCount} label={vs} good="none" />}
                sub={`на ${formatMoney(c.purchasedSum)}`}
              />
              <Stat
                size="sm"
                label="Верифицировано"
                value={`${formatNumber(c.verified)} шт.`}
                delta={<Delta now={c.verified} before={p?.verified} label={vs} />}
                sub={`передано ${formatNumber(c.handed)} · не зарег. ${formatNumber(c.notRegistered)} · отказ ${formatNumber(c.rejected)}`}
              />
              <Stat
                size="sm"
                label="Выплачено за верификацию"
                value={formatMoney(c.paidTotal)}
                delta={<Delta now={c.paidTotal} before={p?.paidTotal} label={vs} good="none" />}
                sub={`верификаторам ${formatMoney(c.paidToAgents)} · людям ${formatMoney(c.paidToPeople)}`}
              />
              <Stat
                size="sm"
                label="Покупатели должны сейчас"
                value={formatMoney(now.buyersDebt)}
                sub={
                  now.buyersDebtCount ? (
                    <>
                      {now.buyersDebtCount} продаж
                      {now.buyersOverdue > 0 && <span className="font-medium text-destructive"> · просрочено {now.buyersOverdue}</span>}
                    </>
                  ) : (
                    "долгов нет"
                  )
                }
              />
            </StatGrid>
          </section>

          {/* ── три коротких списка: откуда прибыль, что сейчас, как платят */}
          <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 xl:grid-cols-3">
            <Panel title="Как получилась прибыль" description="Из чего сложилась прибыль за период">
              <dl className="text-sm">
                <Row label={`Выручка · ${formatNumber(c.soldCount)} продаж`} value={formatMoney(c.revenue)} />
                <Row label="Закупка проданных" value={minus(c.revenue - c.profit)} muted />
                <Row label="Прибыль от продаж" value={formatMoney(c.profit)} strong />
                <Row label="Верификаторам" value={minus(c.paidToAgents)} muted />
                <Row label="Людям" value={minus(c.paidToPeople)} muted />
                <Row label="Чистая прибыль" value={formatMoney(c.netProfit)} strong total negative={c.netProfit < 0} />
              </dl>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                {c.buyersOwe > 0
                  ? `В выручку входит проданное в долг: покупатели ещё должны ${formatMoney(c.buyersOwe)} по продажам этого периода.`
                  : "Все продажи периода оплачены."}
              </p>
            </Panel>

            <Panel title="Сейчас" description="Не зависит от выбранного периода">
              <dl className="text-sm">
                <Row label="На верификации" value={`${formatNumber(now.onVerification)} шт.`} href="/verifications?status=active" />
                <Row label="Долг верификаторам" value={formatMoney(now.debtToAgents)} href="/verifications?paid=no" />
                <Row label="Долг людям" value={formatMoney(now.debtToPeople)} href="/verifications?paid=no" />
                <Row label="Покупатели должны" value={formatMoney(now.buyersDebt)} href="/sales?state=debt" />
                <Row
                  label="Из них просрочено"
                  value={`${formatNumber(now.buyersOverdue)} продаж`}
                  href="/sales?state=overdue"
                  negative={now.buyersOverdue > 0}
                />
              </dl>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Нажмите на строку, чтобы открыть список.</p>
            </Panel>

            <Panel title="Как платят покупатели" description="Доля выручки по способам оплаты" className="lg:col-span-2 xl:col-span-1">
              <ShareList
                empty="Продаж за период нет."
                rows={a.methods.map((m) => ({
                  key: m.method,
                  label: PAYMENT_METHOD_LABEL[m.method],
                  value: formatMoney(m.revenue),
                  meta: `${m.count} прод.`,
                  share: c.revenue ? (m.revenue / c.revenue) * 100 : 0,
                }))}
              />
            </Panel>
          </div>

          {/* ── таблицы */}
          <Panel
            title="По верификаторам"
            description="Кому передавали телефоны и что получилось. «Передано», «Верифицировано» и «Выплачено» — за период."
            flush
          >
            <DataTable
              rows={a.agents}
              rowKey={(w) => w.id}
              empty="Верификаторам телефоны не передавались."
              columns={workerColumns("Верификатор", (w) => `/verifications?verifier=${w.id}`, a.agents)}
            />
          </Panel>

          {a.people.length > 0 && (
            <Panel title="По людям" description="С кем вы работаете сами, без верификатора." flush>
              <DataTable rows={a.people} rowKey={(w) => w.id} empty="" columns={workerColumns("Человек", (w) => `/verifications?verifier=${w.id}`, a.people)} />
            </Panel>
          )}

          <div className="grid gap-4 sm:gap-5 xl:grid-cols-2">
            <Panel title="Что продаётся лучше всего" description="Модели по прибыли за период" flush>
              <DataTable
                rows={a.models}
                rowKey={(m) => m.model}
                empty="Продаж за период нет."
                columns={[
                  {
                    header: "Модель",
                    cell: (m) => (
                      <Link href={`/phones?model=${encodeURIComponent(m.model)}`} className="font-medium hover:text-primary">
                        {m.model}
                      </Link>
                    ),
                  },
                  { header: "Продано", align: "right", cell: (m) => `${m.count} шт.`, total: `${sum(a.models, (m) => m.count)} шт.` },
                  { header: "Выручка", align: "right", cell: (m) => formatMoney(m.revenue), total: formatMoney(c.revenue) },
                  { header: "Прибыль", align: "right", cell: (m) => formatMoney(m.profit), total: formatMoney(c.profit) },
                  { header: "Маржа", align: "right", cell: (m) => percent(m.margin), total: percent(c.margin) },
                ]}
              />
            </Panel>

            <Panel title="Поставщики" description="У кого купили за период. «Продано» и «Прибыль» — по этим же телефонам." flush>
              <DataTable
                rows={a.suppliers}
                rowKey={(r) => r.supplier ?? "—"}
                empty="Закупок за период нет."
                columns={[
                  {
                    header: "Поставщик",
                    cell: (r) =>
                      r.supplier ? (
                        <Link href={`/phones?q=${encodeURIComponent(r.supplier)}`} className="font-medium hover:text-primary">
                          {r.supplier}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Не указан</span>
                      ),
                  },
                  { header: "Куплено", align: "right", cell: (r) => `${r.count} шт.`, total: `${c.purchasedCount} шт.` },
                  { header: "На сумму", align: "right", cell: (r) => formatMoney(r.sum), total: formatMoney(c.purchasedSum) },
                  { header: "Продано", align: "right", cell: (r) => `${r.sold} шт.`, total: `${sum(a.suppliers, (r) => r.sold)} шт.` },
                  { header: "Прибыль", align: "right", cell: (r) => formatMoney(r.profit), total: formatMoney(sum(a.suppliers, (r) => r.profit)) },
                ]}
              />
            </Panel>
          </div>
        </div>
      )}
    </>
  )
}

function Row({
  label,
  value,
  strong,
  muted,
  negative,
  total,
  href,
}: {
  label: string
  value: string
  strong?: boolean
  muted?: boolean
  negative?: boolean
  total?: boolean
  href?: string
}) {
  const cls = cn(
    "relative flex items-center justify-between gap-4 py-2",
    strong && "font-semibold",
    total && "mt-2 rounded-lg bg-muted/60 px-3 py-2.5",
    strong && !total && "mb-1 border-b pb-3",
    href && "-mx-2 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60"
  )
  return (
    <div className={cls}>
      <dt className={muted ? "pl-3 text-muted-foreground" : undefined}>
        {href ? (
          <Link href={href} className="after:absolute after:inset-0 after:rounded-lg">
            {label}
          </Link>
        ) : (
          label
        )}
      </dt>
      <dd className={cn("flex items-center gap-1 tabular-nums", muted && "text-muted-foreground", negative && "text-destructive")}>
        {value}
        {href && <ChevronRightIcon className="size-4 text-muted-foreground/60" />}
      </dd>
    </div>
  )
}
