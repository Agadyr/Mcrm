"use client"

import { useEffect, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { SearchIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/native-select"
import { StatusTabs, type StatusTab } from "@/components/status-tabs"

export function SalesFiltersBar({ tabs, periods }: { tabs: StatusTab[]; periods: Record<string, string> }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [q, setQ] = useState(searchParams.get("q") ?? "")

  function update(patch: Record<string, string>) {
    const sp = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v) sp.set(k, v)
      else sp.delete(k)
    }
    sp.delete("page")
    const qs = sp.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  useEffect(() => {
    if (q === (searchParams.get("q") ?? "")) return
    const t = setTimeout(() => update({ q: q.trim() }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  return (
    <div className="mb-4 flex flex-col gap-3">
      <StatusTabs param="state" tabs={tabs} />
      <div className="flex flex-col gap-2 rounded-2xl border bg-card p-3 shadow-xs sm:flex-row">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Покупатель, его телефон, модель, IMEI"
            className="pl-9"
          />
        </div>
        <NativeSelect
          value={searchParams.get("period") ?? ""}
          onChange={(e) => update({ period: e.target.value })}
          aria-label="Период"
          className="sm:w-48"
        >
          <option value="">За всё время</option>
          {Object.entries(periods).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  )
}
