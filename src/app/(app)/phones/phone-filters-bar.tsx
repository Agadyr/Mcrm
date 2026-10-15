"use client"

import { useEffect, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { NativeSelect } from "@/components/native-select"
import { StatusTabs, type StatusTab } from "@/components/status-tabs"
import { PHONE_SORTS } from "@/server/phone-filters"
import { cn } from "@/lib/utils"

export function PhoneFiltersBar({
  statusTabs,
  brandTabs,
  modelTabs,
}: {
  statusTabs: StatusTab[]
  brandTabs: StatusTab[]
  modelTabs: StatusTab[] | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [q, setQ] = useState(searchParams.get("q") ?? "")
  const get = (k: string) => searchParams.get(k) ?? ""
  const advancedCount = ["from", "to", "sort"].filter((k) => searchParams.get(k)).length
  const [showMore, setShowMore] = useState(advancedCount > 0)

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

  // поиск с задержкой, чтобы не дёргать сервер на каждую букву
  useEffect(() => {
    if (q === (searchParams.get("q") ?? "")) return
    const t = setTimeout(() => update({ q: q.trim() }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const hasFilters = ["q", "status", "brand", "model", "from", "to", "period", "sort"].some((k) => searchParams.get(k))

  return (
    <div className="mb-4 flex flex-col gap-3">
      <StatusTabs tabs={statusTabs} />

      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3 shadow-xs">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Модель, IMEI, поставщик, дата, покупатель"
              className="pl-9"
              type="search"
            />
          </div>
          <Button
            variant={showMore ? "secondary" : "outline"}
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
            aria-label="Даты и сортировка"
          >
            <SlidersHorizontalIcon />
            <span className="hidden sm:inline">Даты и сортировка</span>
            {advancedCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{advancedCount}</span>
            )}
          </Button>
        </div>

        <StatusTabs param="brand" clear={["model"]} tabs={brandTabs} label="Марка" size="sm" />
        {modelTabs && <StatusTabs param="model" tabs={modelTabs} label="Модель" size="sm" />}

        <div className={cn("grid-cols-2 gap-2 border-t pt-3 lg:grid-cols-4", showMore ? "grid" : "hidden")}>
          <NativeSelect
            value={get("period") || "received"}
            onChange={(e) => update({ period: e.target.value === "received" ? "" : e.target.value })}
            aria-label="Период по"
          >
            <option value="received">По дате поступления</option>
            <option value="sold">По дате продажи</option>
          </NativeSelect>
          <NativeSelect
            value={get("sort") || "received_desc"}
            onChange={(e) => update({ sort: e.target.value === "received_desc" ? "" : e.target.value })}
            aria-label="Сортировка"
          >
            {Object.entries(PHONE_SORTS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </NativeSelect>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            с
            <Input type="date" value={get("from")} onChange={(e) => update({ from: e.target.value })} aria-label="С даты" />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            по
            <Input type="date" value={get("to")} onChange={(e) => update({ to: e.target.value })} aria-label="По дату" />
          </label>
        </div>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start text-muted-foreground"
            onClick={() => {
              setQ("")
              startTransition(() => router.replace(pathname, { scroll: false }))
            }}
          >
            <XIcon /> Сбросить все фильтры
          </Button>
        )}
      </div>
    </div>
  )
}
