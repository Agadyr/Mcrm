"use client"

import { useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"

export type StatusTab = { value: string; label: string; count?: number; dot?: string }

/** Вкладки-статусы со счётчиками. Значение хранится в параметре адреса (например ?status=SOLD). */
export function StatusTabs({
  param = "status",
  tabs,
  clear = [],
  label,
  size = "default",
}: {
  param?: string
  tabs: StatusTab[]
  /** какие параметры сбросить при выборе (например, модель при смене марки) */
  clear?: string[]
  label?: string
  size?: "default" | "sm"
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const current = searchParams.get(param) ?? ""

  function select(value: string) {
    const sp = new URLSearchParams(searchParams.toString())
    if (value) sp.set(param, value)
    else sp.delete(param)
    sp.delete("page")
    for (const k of clear) sp.delete(k)
    const qs = sp.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  return (
    <div className={cn("no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", pending && "opacity-70")}>
      <div className="flex w-max items-center gap-1.5">
        {label && <span className="mr-1 text-xs font-medium text-muted-foreground">{label}</span>}
        {tabs.map((t) => {
          const active = current === t.value
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => select(t.value)}
              className={cn(
                "flex items-center gap-2 rounded-full border font-medium whitespace-nowrap transition-colors",
                size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-3.5 text-sm",
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                  : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {t.dot && !active && <span className={cn("size-2 rounded-full", t.dot)} />}
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cn(
                    "min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums",
                    active ? "bg-black/20" : "bg-muted"
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
