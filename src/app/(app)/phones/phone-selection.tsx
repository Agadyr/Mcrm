"use client"

import { createContext, useContext, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { PhoneStatus } from "@prisma/client"
import { ChevronDownIcon, DownloadIcon, ShieldCheckIcon, XIcon } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { PHONE_STATUS_DOT, PHONE_STATUS_LABEL } from "@/lib/labels"
import { BULK_PHONE_STATUSES } from "@/lib/validators/phone"
import { cn } from "@/lib/utils"
import { bulkSetPhoneStatusAction } from "@/server/actions/phones"

// Отметка телефонов в списке товаров и действия сразу над несколькими: смена статуса, выгрузка, передача верификатору.
// Выбор живёт только на текущей странице списка: при смене фильтра или страницы сбрасывается (key в page.tsx).

type Selection = {
  selected: Set<string>
  toggle: (id: string, on: boolean) => void
  /** свои телефоны на странице, которые можно отметить: id → статус */
  selectable: Map<string, PhoneStatus>
  setAll: (on: boolean) => void
  clear: () => void
}

const SelectionContext = createContext<Selection | null>(null)

export function PhoneSelectionProvider({
  phones,
  children,
}: {
  phones: { id: string; status: PhoneStatus }[]
  children: React.ReactNode
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const value = useMemo<Selection>(() => {
    const selectable = new Map(phones.map((p) => [p.id, p.status]))
    return {
      selected,
      selectable,
      toggle: (id, on) =>
        setSelected((prev) => {
          const next = new Set(prev)
          if (on) next.add(id)
          else next.delete(id)
          return next
        }),
      setAll: (on) => setSelected(on ? new Set(selectable.keys()) : new Set()),
      clear: () => setSelected(new Set()),
    }
  }, [phones, selected])
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>
}

function useSelection() {
  return useContext(SelectionContext)
}

/** Отметка одного телефона (строка таблицы или карточка) */
export function PhoneSelectCheckbox({ id, className }: { id: string; className?: string }) {
  const s = useSelection()
  if (!s?.selectable.has(id)) return null
  return (
    <Checkbox
      aria-label="Выбрать телефон"
      className={cn("size-5 sm:size-4", className)}
      checked={s.selected.has(id)}
      onCheckedChange={(c) => s.toggle(id, !!c)}
    />
  )
}

/** «Выбрать все» в шапке таблицы */
export function PhoneSelectAll() {
  const s = useSelection()
  if (!s || !s.selectable.size) return null
  const all = s.selected.size === s.selectable.size
  return (
    <Checkbox
      aria-label="Выбрать все на странице"
      checked={all}
      indeterminate={!all && s.selected.size > 0}
      onCheckedChange={(c) => s.setAll(!!c)}
    />
  )
}

/** Панель действий над отмеченными: прилипает к низу экрана (на телефоне — над панелью вкладок) */
export function PhoneBulkBar() {
  const s = useSelection()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  if (!s || !s.selected.size) return null
  const ids = [...s.selected]
  const soldCount = ids.filter((id) => s.selectable.get(id) === "SOLD").length

  function setStatus(status: (typeof BULK_PHONE_STATUSES)[number]) {
    startTransition(async () => {
      const r = await bulkSetPhoneStatusAction({ ids, status })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      const { changed, skipped } = r.data
      toast.success(
        `Статус «${PHONE_STATUS_LABEL[status]}»: ${changed} шт.` + (skipped ? ` · проданные пропущены: ${skipped}` : "")
      )
      s!.clear()
      router.refresh()
    })
  }

  return (
    <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mt-3 flex flex-wrap items-center gap-2 rounded-2xl border bg-card/95 p-2 shadow-lg backdrop-blur-md lg:bottom-4">
      <span className="px-2 text-sm font-medium">
        Выбрано: <b className="tabular-nums">{ids.length}</b>
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="sm" variant="outline" disabled={pending} />}>
          Сменить статус <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" className="w-48">
          {BULK_PHONE_STATUSES.map((st) => (
            <DropdownMenuItem key={st} onClick={() => setStatus(st)}>
              <span className={cn("size-2 rounded-full", PHONE_STATUS_DOT[st])} />
              {PHONE_STATUS_LABEL[st]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <a href={`/api/export/phones?ids=${ids.join(",")}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
        <DownloadIcon /> Выгрузить в Excel
      </a>
      {/* на верификацию отдают проданные телефоны — страница массовой передачи сама оставит подходящие */}
      {soldCount > 0 && (
        <Link
          href={`/verifications/batch?phones=${ids.filter((id) => s.selectable.get(id) === "SOLD").join(",")}`}
          className={buttonVariants({ size: "sm", variant: "outline" })}
        >
          <ShieldCheckIcon /> Передать верификатору
        </Link>
      )}
      <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" onClick={s.clear}>
        <XIcon /> Снять выбор
      </Button>
    </div>
  )
}
