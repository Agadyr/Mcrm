import Link from "next/link"
import { ArrowDownRightIcon, ArrowUpRightIcon, CalendarIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, MinusIcon } from "lucide-react"
import { RANGE_PRESETS, type Period } from "@/lib/analytics-period"
import { dateToYmd } from "@/lib/dates"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Выбор периода: одна кнопка с текущим периодом, внутри — пресеты ссылками и свой период формой (GET). Работает без JavaScript */
export function RangeBar({ period }: { period: Period }) {
  const current = RANGE_PRESETS.find((p) => p.key === period.key)?.label ?? "Свой период"
  return (
    <details className="group relative">
      <summary className="flex h-11 cursor-pointer list-none items-center gap-2.5 rounded-xl border bg-card pr-3 pl-3.5 text-sm shadow-xs transition-colors select-none hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
        <CalendarIcon className="size-4 text-muted-foreground" />
        <span className="font-medium">{current}</span>
        <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>

      <div className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-2xl border bg-popover text-sm text-popover-foreground shadow-xl max-sm:right-auto max-sm:left-0">
        <nav aria-label="Период" className="flex flex-col p-1.5">
          {/* обычные ссылки, не <Link>: страница считается на сервере целиком, а клиентский переход здесь иногда обрывался */}
          {RANGE_PRESETS.map((p) => {
            const active = period.key === p.key
            return (
              <a
                key={p.key}
                href={`/analytics?range=${p.key}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2 transition-colors",
                  active ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted",
                )}
              >
                {p.label}
                {active && <CheckIcon className="size-4" />}
              </a>
            )
          })}
        </nav>
        <form action="/analytics" className="flex flex-col gap-3 border-t bg-muted/30 p-3">
          <div className="text-xs font-medium text-muted-foreground">Свой период</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="sr-only">С</span>
              <input type="date" name="from" required defaultValue={dateToYmd(period.from)} aria-label="С" className={dateInput} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="sr-only">По</span>
              <input type="date" name="to" required defaultValue={dateToYmd(period.to)} aria-label="По" className={dateInput} />
            </label>
          </div>
          <button type="submit" className="h-9 rounded-lg bg-primary font-medium text-primary-foreground transition-opacity hover:opacity-90">
            Показать
          </button>
        </form>
      </div>
    </details>
  )
}

const dateInput =
  "h-9 w-full min-w-0 rounded-lg border bg-background px-2 text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"

/** Изменение к предыдущему периоду: стрелка, знак и процент — цвет не единственный признак */
export function Delta({
  now,
  before,
  label,
  good = "up",
}: {
  now: number
  before: number | null | undefined
  label: string
  /** какое направление хорошее; «none» — нейтрально (например, закупки) */
  good?: "up" | "down" | "none"
}) {
  if (before == null) return null
  if (before === 0 && now === 0) return <span className="text-xs text-muted-foreground">без изменений {label}</span>
  if (before === 0) return <span className="text-xs text-muted-foreground">в пред. периоде не было</span>
  const pct = ((now - before) / Math.abs(before)) * 100
  if (Math.abs(pct) < 0.5) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <MinusIcon className="size-3.5" /> без изменений {label}
      </span>
    )
  }
  const up = pct > 0
  const positive = good === "none" ? null : good === "up" ? up : !up
  const Icon = up ? ArrowUpRightIcon : ArrowDownRightIcon
  return (
    <span title={`Раньше: ${formatNumber(before)}`} className="inline-flex flex-wrap items-center gap-1.5 text-xs">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold",
          positive === null
            ? "bg-muted text-muted-foreground"
            : positive
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive",
        )}
      >
        <Icon className="size-3.5" />
        {up ? "+" : "−"}
        {formatNumber(Math.abs(pct))}%
      </span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  )
}

/** Сетка показателей в одной карточке, ячейки разделены тонкими линиями */
export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-px overflow-hidden bg-border lg:grid-cols-4", className)}>{children}</div>
}

export function Stat({
  label,
  value,
  sub,
  delta,
  tone,
  size = "md",
  href,
}: {
  label: string
  value: string
  sub?: React.ReactNode
  delta?: React.ReactNode
  /** «negative» — красное значение (например, чистый убыток), «warning» — долг */
  tone?: "negative" | "warning"
  /** «lg» — главные показатели страницы */
  size?: "sm" | "md" | "lg"
  href?: string
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-[13px] font-medium text-muted-foreground">
        {label}
        {href && <ChevronRightIcon className="size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />}
      </div>
      <div
        className={cn(
          "font-semibold tracking-tight tabular-nums",
          size === "lg" ? "text-xl leading-tight sm:text-[2rem]" : size === "md" ? "text-xl" : "text-base sm:text-lg",
          tone === "negative" && "text-destructive",
          tone === "warning" && "text-amber-700 dark:text-amber-400",
        )}
      >
        {value}
      </div>
      {delta && <div>{delta}</div>}
      {sub && <div className="text-xs leading-relaxed text-muted-foreground">{sub}</div>}
    </>
  )
  const cls = cn("flex min-w-0 flex-col bg-card", size === "lg" ? "gap-2 p-4 sm:p-6" : size === "md" ? "gap-1.5 px-4 py-4 sm:px-6" : "gap-1 p-4 sm:px-5")
  return href ? (
    <Link href={href} className={cn(cls, "group transition-colors hover:bg-[color-mix(in_oklab,var(--muted)_60%,var(--card))]")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

export function Panel({
  title,
  description,
  children,
  className,
  flush,
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** без внутренних отступов у содержимого (для сеток показателей) */
  flush?: boolean
}) {
  return (
    <section className={cn("flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-xs", className)}>
      <header className={cn("px-5 pt-5 sm:px-6", flush ? "pb-4" : "")}>
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      </header>
      <div className={cn("flex-1", flush ? "border-t" : "px-5 pt-4 pb-5 sm:px-6")}>{children}</div>
    </section>
  )
}

/** Доли: подпись, полоска и цифры — вместо широкой таблицы */
export function ShareList({ rows, empty }: { rows: { key: string; label: string; value: string; meta: string; share: number }[]; empty: string }) {
  if (rows.length === 0) return <p className="rounded-xl bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="flex flex-col gap-4">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium">{r.label}</span>
            <span className="whitespace-nowrap tabular-nums">
              {r.value} <span className="ml-1 text-xs text-muted-foreground">{r.meta}</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${Math.max(r.share, 1)}%` }} />
            </div>
            <span className="w-10 text-right text-xs font-medium text-muted-foreground tabular-nums">{formatNumber(Math.round(r.share))}%</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

export type Column<T> = {
  header: string
  align?: "right"
  cell: (row: T) => React.ReactNode
  /** значение в строке «Итого» */
  total?: React.ReactNode
}

/** Таблица данных. Строка «Итого» появляется, если хотя бы у одной колонки есть total. */
export function DataTable<T>({ columns, rows, empty, rowKey }: { columns: Column<T>[]; rows: T[]; empty: string; rowKey: (row: T) => string }) {
  if (rows.length === 0) return <p className="m-5 rounded-xl bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground sm:mx-6">{empty}</p>
  const hasTotal = columns.some((c) => c.total !== undefined)
  const pad = "px-3 first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6"
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="bg-muted/40 text-left text-xs text-muted-foreground">
            {columns.map((c) => (
              <th key={c.header} className={cn(pad, "py-2.5 font-medium whitespace-nowrap", c.align === "right" && "text-right")}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((r) => (
            <tr key={rowKey(r)} className="transition-colors hover:bg-muted/30">
              {columns.map((c) => (
                <td key={c.header} className={cn(pad, "py-3 tabular-nums", c.align === "right" && "text-right")}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {hasTotal && (
          <tfoot>
            <tr className="border-t font-semibold">
              {columns.map((c, i) => (
                <td key={c.header} className={cn(pad, "py-3 tabular-nums", c.align === "right" && "text-right")}>
                  {c.total ?? (i === 0 ? "Итого" : "")}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
