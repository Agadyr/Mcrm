"use client"

import { useEffect, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { SearchIcon } from "lucide-react"
import { Input } from "@/components/ui/input"

/** Поиск клиента по имени или номеру — обновляет ?q= с задержкой, как в продажах */
export function CustomerSearch() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [q, setQ] = useState(searchParams.get("q") ?? "")

  useEffect(() => {
    if (q === (searchParams.get("q") ?? "")) return
    const t = setTimeout(() => {
      const sp = new URLSearchParams(searchParams.toString())
      if (q.trim()) sp.set("q", q.trim())
      else sp.delete("q")
      sp.delete("page")
      const qs = sp.toString()
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  return (
    <div className="mb-4 rounded-2xl border bg-card p-3 shadow-xs">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя или номер телефона" className="pl-9" />
      </div>
    </div>
  )
}
