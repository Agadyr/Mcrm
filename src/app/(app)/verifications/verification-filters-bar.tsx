"use client"

import { useEffect, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { SearchIcon, XIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { NativeSelect } from "@/components/native-select"
import { StatusTabs, type StatusTab } from "@/components/status-tabs"

export function VerificationFiltersBar({
  verifiers,
  statusTabs,
}: {
  verifiers: { id: string; fullName: string }[]
  statusTabs: StatusTab[]
}) {
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

  const get = (k: string) => searchParams.get(k) ?? ""
  const hasFilters = ["q", "verifier", "paid"].some((k) => searchParams.get(k))

  return (
    <div className="mb-4 flex flex-col gap-3">
      <StatusTabs tabs={statusTabs} />
    <div className="flex flex-col gap-2 rounded-2xl border bg-card p-3 shadow-xs">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Человек, телефон, IMEI, модель, страна"
          className="pl-9"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NativeSelect value={get("paid")} onChange={(e) => update({ paid: e.target.value })} aria-label="Оплата">
          <option value="">Оплата: все</option>
          <option value="no">Не оплачено</option>
          <option value="yes">Оплачено</option>
        </NativeSelect>
        <NativeSelect
          value={get("verifier")}
          onChange={(e) => update({ verifier: e.target.value })}
          aria-label="Человек"
        >
          <option value="">Кому: все</option>
          {verifiers.map((v) => (
            <option key={v.id} value={v.id}>
              {v.fullName}
            </option>
          ))}
        </NativeSelect>
      </div>
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => {
            setQ("")
            startTransition(() => router.replace(pathname, { scroll: false }))
          }}
        >
          <XIcon /> Сбросить фильтры
        </Button>
      )}
    </div>
    </div>
  )
}
