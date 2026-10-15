import Link from "next/link"
import { cn } from "@/lib/utils"

const TONES = {
  emerald: "bg-emerald-50 text-emerald-700",
  indigo: "bg-secondary text-primary",
  amber: "bg-amber-50 text-amber-700",
  rose: "bg-rose-50 text-rose-600",
}

export function Stat({
  href,
  icon,
  tone,
  label,
  value,
  sub,
  accent,
  className,
}: {
  className?: string
  /** подсветить подпись — требует внимания */
  accent?: boolean
  href: string
  icon: React.ReactNode
  tone: keyof typeof TONES
  label: string
  value: string
  sub: string
}) {
  return (
    <Link
      href={href}
      className={cn("group rounded-2xl border bg-card p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md", className)}
    >
      <span className={cn("flex size-10 items-center justify-center rounded-xl [&_svg]:size-5", TONES[tone])}>{icon}</span>
      <div className="mt-3 text-sm text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{value}</div>
      <div className={cn("mt-0.5 truncate text-xs", accent ? "font-medium text-amber-700" : "text-muted-foreground")}>{sub}</div>
    </Link>
  )
}

export function ListCard({
  title,
  href,
  empty,
  children,
}: {
  title: string
  href: string
  empty: string
  children: React.ReactNode[]
}) {
  return (
    <section className="min-w-0 rounded-2xl border bg-card shadow-xs">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <h2 className="font-semibold">{title}</h2>
        <Link href={href} className="text-sm font-medium text-primary hover:underline">
          Все
        </Link>
      </div>
      {children.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y px-2 pb-2">{children}</ul>
      )}
    </section>
  )
}

export function ListRow({
  href,
  icon,
  title,
  sub,
  right,
}: {
  href: string
  icon: React.ReactNode
  title: string
  sub: string
  right: React.ReactNode
}) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-muted/50">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground [&_svg]:size-[18px]">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{title}</div>
          <div className="truncate text-xs text-muted-foreground">{sub}</div>
        </div>
        <div className="shrink-0 text-right">{right}</div>
      </Link>
    </li>
  )
}
