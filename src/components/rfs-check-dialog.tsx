"use client"

import { useOpenedOnce } from "@/lib/use-opened-once"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckIcon, CopyIcon, ExternalLinkIcon, SearchCheckIcon, XCircleIcon, CheckCircle2Icon } from "lucide-react"
import type { RfsStatus } from "@prisma/client"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatDateTime } from "@/lib/format"
import { RFS_STATUS_LABEL, RFS_URL } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { setRfsResultAction } from "@/server/actions/phones"

export type RfsTarget = {
  phoneId: string | null // null — телефона нет в товарах, результат сохранить некуда
  title: string
  imei1: string
  imei2: string | null
  rfsStatus?: RfsStatus | null
  rfsCheckedAt?: Date | null
}

/** Кнопка «Проверить в РФС» + окно проверки */
export function RfsCheckButton({
  target,
  variant = "outline",
  size = "default",
  label = "Проверить в РФС",
  className,
}: {
  target: RfsTarget
  variant?: "outline" | "secondary" | "ghost"
  size?: "default" | "sm" | "icon-sm"
  label?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)} title="Проверить IMEI в РФС" aria-label={size === "icon-sm" ? "Проверить IMEI в РФС" : undefined}>
        <SearchCheckIcon />
        {size !== "icon-sm" && label}
      </Button>
      <RfsCheckDialog target={target} open={open} onOpenChange={setOpen} />
    </>
  )
}

function RfsCheckDialogInner({
  target,
  open,
  onOpenChange,
}: {
  target: RfsTarget
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const imeis = [
    { label: "IMEI1", value: target.imei1 },
    ...(target.imei2 ? [{ label: "IMEI2", value: target.imei2 }] : []),
  ]

  function save(result: RfsStatus) {
    if (!target.phoneId) return
    startTransition(async () => {
      const r = await setRfsResultAction(target.phoneId!, result)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(`Сохранено: ${RFS_STATUS_LABEL[result]}`)
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Проверка IMEI в РФС</DialogTitle>
          <DialogDescription>{target.title}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {imeis.map((i) => (
            <ImeiRow key={i.label} label={i.label} value={i.value} />
          ))}
        </div>

        <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
          «Проверить» копирует IMEI и открывает imei.rfs.gov.kz. Там вставьте номер, нажмите «Я не робот» и вернитесь
          сюда, чтобы отметить результат.
        </p>

        {target.phoneId ? (
          <div className="flex flex-col gap-2 border-t pt-4">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">Результат проверки</span>
              {target.rfsStatus && (
                <span className="text-xs text-muted-foreground">
                  было: {RFS_STATUS_LABEL[target.rfsStatus].toLowerCase()}, {formatDateTime(target.rfsCheckedAt)}
                </span>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                size="lg"
                disabled={pending}
                onClick={() => save("REGISTERED")}
                className="bg-emerald-600 text-white shadow-emerald-600/20 hover:bg-emerald-600/90"
              >
                <CheckCircle2Icon /> Зарегистрирован
              </Button>
              <Button size="lg" variant="destructive" disabled={pending} onClick={() => save("NOT_REGISTERED")}>
                <XCircleIcon /> Не зарегистрирован
              </Button>
            </div>
          </div>
        ) : (
          <p className="border-t pt-4 text-xs text-muted-foreground">
            Этого телефона нет в товарах, поэтому результат проверки сохранить негде.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ImeiRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      return true
    } catch {
      return false
    }
  }

  function copyAndOpen() {
    // окно открываем сразу в обработчике клика, иначе браузер посчитает его всплывающим и заблокирует
    void copy().then((ok) => (ok ? toast.success(`${label} скопирован — вставьте его на сайте РФС`) : null))
    window.open(RFS_URL, "_blank", "noopener,noreferrer")
  }

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 flex flex-col gap-2.5">
        <span className="font-mono text-[1.35rem] font-semibold tracking-wider whitespace-nowrap tabular-nums sm:text-2xl">
          {value}
        </span>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => void copy()} aria-label={`Копировать ${label}`}>
            {copied ? <CheckIcon className="text-emerald-700 dark:text-emerald-400" /> : <CopyIcon />}
            <span className={cn(copied && "text-emerald-700 dark:text-emerald-400")}>{copied ? "Скопировано" : "Копировать"}</span>
          </Button>
          <Button onClick={copyAndOpen}>
            <ExternalLinkIcon /> Проверить
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Значок последнего результата проверки в РФС */
export function RfsBadge({ status, checkedAt }: { status: RfsStatus | null; checkedAt: Date | null }) {
  // «не зарегистрирован» в списках не показываем — только подтверждённую регистрацию
  if (status !== "REGISTERED") return null
  const ok = status === "REGISTERED"
  const date = checkedAt
    ? new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Almaty", day: "2-digit", month: "2-digit" }).format(checkedAt)
    : ""
  return (
    <span
      title={`РФС: ${RFS_STATUS_LABEL[status]}${checkedAt ? `, ${formatDateTime(checkedAt)}` : ""}`}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset ring-current/10",
        ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
      )}
    >
      {ok ? <CheckIcon className="size-3.5" /> : <XCircleIcon className="size-3.5" />}
      РФС {ok ? "есть" : "нет"} {date && <span className="font-normal">· {date}</span>}
    </span>
  )
}

/** Окно создаётся только при первом открытии (см. useOpenedOnce) */
export function RfsCheckDialog(props: React.ComponentProps<typeof RfsCheckDialogInner>) {
  return useOpenedOnce(props.open) ? <RfsCheckDialogInner {...props} /> : null
}
