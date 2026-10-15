"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckIcon, ChevronDownIcon, FileTextIcon, Loader2Icon, MoreHorizontalIcon, SearchCheckIcon, SmartphoneIcon, Trash2Icon } from "lucide-react"
import type { VerificationStatus } from "@prisma/client"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { RfsCheckDialog, type RfsTarget } from "@/components/rfs-check-dialog"
import { useOpenedOnce } from "@/lib/use-opened-once"
import { STATUS_PILL } from "@/components/status-badge"
import { VERIFICATION_STATUS_COLOR, VERIFICATION_STATUS_DOT, VERIFICATION_STATUS_LABEL, VERIFICATION_STATUSES } from "@/lib/labels"
import { cn } from "@/lib/utils"
import {
  deleteVerificationAction,
  setAgentPaidAction,
  setVerificationPaidAction,
  setVerificationStatusAction,
} from "@/server/actions/verifications"

/** Быстрая смена статуса прямо из списка */
export function QuickStatus({ id, status, className }: { id: string; status: VerificationStatus; className?: string }) {
  const router = useRouter()
  const [value, setValue] = useState(status)
  const [pending, startTransition] = useTransition()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuOpened = useOpenedOnce(menuOpen)

  function choose(next: VerificationStatus) {
    if (next === value) return
    const prev = value
    setValue(next)
    startTransition(async () => {
      const r = await setVerificationStatusAction(id, next)
      if (!r.ok) {
        setValue(prev)
        toast.error(r.error)
        return
      }
      toast.success(`Статус: ${VERIFICATION_STATUS_LABEL[next]}`)
      router.refresh()
    })
  }

  const label = (
    <>
      <span className={cn("size-1.5 rounded-full", VERIFICATION_STATUS_DOT[value])} />
      {VERIFICATION_STATUS_LABEL[value]}
      {pending ? <Loader2Icon className="size-3 animate-spin" /> : <ChevronDownIcon className="size-3 opacity-70" />}
    </>
  )
  const pill = cn(
    STATUS_PILL,
    "cursor-pointer transition-shadow outline-none hover:ring-current/40 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
    VERIFICATION_STATUS_COLOR[value],
    className
  )

  // до первого нажатия — обычная кнопка: меню в каждой строке списка ни к чему при загрузке
  if (!menuOpened) {
    return (
      <button type="button" aria-label="Статус верификации" title="Изменить статус" className={pill} onClick={() => setMenuOpen(true)}>
        {label}
      </button>
    )
  }
  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger
        aria-label="Статус верификации"
        title="Изменить статус"
        disabled={pending}
        render={<button type="button" className={pill} />}
      >
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {VERIFICATION_STATUSES.map((s) => (
          <DropdownMenuItem key={s} onClick={() => choose(s)} className="gap-2">
            <span className={cn("size-2 rounded-full", VERIFICATION_STATUS_DOT[s])} />
            {VERIFICATION_STATUS_LABEL[s]}
            {s === value && <CheckIcon className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PaidToggle({ id, isPaid, disabled }: { id: string; isPaid: boolean; disabled?: boolean }) {
  const router = useRouter()
  const [value, setValue] = useState(isPaid)
  const [pending, startTransition] = useTransition()
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-[13px]">
      <Checkbox
        checked={value}
        disabled={pending || disabled}
        onCheckedChange={(c) => {
          const next = !!c
          setValue(next)
          startTransition(async () => {
            const r = await setVerificationPaidAction(id, next)
            if (!r.ok) {
              setValue(!next)
              toast.error(r.error)
              return
            }
            router.refresh()
          })
        }}
      />
      <span className={value ? "font-medium text-emerald-700 dark:text-emerald-400" : "font-semibold text-orange-700 dark:text-orange-400"}>
        {value ? "оплачено" : "не оплачено"}
      </span>
    </label>
  )
}

export function DeleteVerificationButton({ id }: { id: string }) {
  const router = useRouter()
  return (
    <ConfirmDialog
      trigger={(open) => (
        <Button variant="destructive" onClick={open}>
          <Trash2Icon /> Удалить
        </Button>
      )}
      title="Удалить верификацию?"
      description="Запись будет удалена. Статус связанного товара пересчитается автоматически."
      confirmLabel="Удалить"
      destructive
      onConfirm={async () => {
        const r = await deleteVerificationAction(id)
        if (!r.ok) {
          toast.error(r.error)
          return false
        }
        toast.success("Верификация удалена")
        router.push("/verifications")
        router.refresh()
      }}
    />
  )
}

/** «Оплачено верификатору» — отмечает владелец телефона */
export function AgentPaidToggle({ id, paid, label = "оплачено" }: { id: string; paid: boolean; label?: string }) {
  const router = useRouter()
  const [value, setValue] = useState(paid)
  const [pending, startTransition] = useTransition()
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-[13px]">
      <Checkbox
        checked={value}
        disabled={pending}
        onCheckedChange={(c) => {
          const next = !!c
          setValue(next)
          startTransition(async () => {
            const r = await setAgentPaidAction(id, next)
            if (!r.ok) {
              setValue(!next)
              toast.error(r.error)
              return
            }
            router.refresh()
          })
        }}
      />
      <span className={value ? "font-medium text-emerald-700 dark:text-emerald-400" : "font-semibold text-orange-700 dark:text-orange-400"}>
        {value ? label : `не ${label}`}
      </span>
    </label>
  )
}

/** Меню «⋯» строки: открыть верификацию, карточку телефона, проверить в РФС. Меню и окно создаются по первому нажатию */
export function VerificationRowMenu({ id, phoneId, rfs }: { id: string; phoneId: string | null; rfs: RfsTarget }) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuOpened = useOpenedOnce(menuOpen)
  const [rfsOpen, setRfsOpen] = useState(false)
  const trigger = <Button size="icon-sm" variant="ghost" aria-label="Действия" />
  return (
    <>
      {!menuOpened ? (
        <Button size="icon-sm" variant="ghost" aria-label="Действия" onClick={() => setMenuOpen(true)}>
          <MoreHorizontalIcon />
        </Button>
      ) : (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger aria-label="Действия" render={trigger}>
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => router.push(`/verifications/${id}`)}>
              <FileTextIcon /> Детали верификации
            </DropdownMenuItem>
            {phoneId && (
              <DropdownMenuItem onClick={() => router.push(`/phones/${phoneId}`)}>
                <SmartphoneIcon /> Карточка телефона
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setRfsOpen(true)}>
              <SearchCheckIcon /> Проверить в РФС
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <RfsCheckDialog target={rfs} open={rfsOpen} onOpenChange={setRfsOpen} />
    </>
  )
}
