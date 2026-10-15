"use client"

import { useRouter } from "next/navigation"
import { SearchIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/** Быстрый поиск по IMEI, модели, серийнику, людям — ведёт на /search */
export function SearchBox({
  defaultValue,
  autoFocus,
  className,
  onSearched,
}: {
  defaultValue?: string
  autoFocus?: boolean
  className?: string
  onSearched?: () => void
}) {
  const router = useRouter()
  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault()
        const q = String(new FormData(e.currentTarget).get("q") ?? "").trim()
        if (!q) return
        router.push(`/search?q=${encodeURIComponent(q)}`)
        onSearched?.()
      }}
    >
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        name="q"
        type="search"
        inputMode="search"
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        placeholder="IMEI, модель, поставщик…"
        className="h-10 w-full rounded-xl border border-input bg-muted/50 pr-3 pl-9 text-base outline-none transition-colors focus:border-ring focus:bg-card focus:ring-3 focus:ring-ring/30 md:h-9 md:text-sm"
      />
    </form>
  )
}
