"use client"

import { useOpenedOnce } from "@/lib/use-opened-once"
import { useState, useTransition } from "react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

/** Подтверждение действия внутри интерфейса (вместо window.confirm) */
function ConfirmDialogInner({
  trigger,
  open: controlledOpen,
  onOpenChange,
  title,
  description,
  confirmLabel = "Подтвердить",
  destructive,
  onConfirm,
}: {
  /** Кнопка-триггер; можно не передавать и управлять через open/onOpenChange */
  trigger?: (open: () => void) => React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  destructive?: boolean
  /** Вернуть false, чтобы не закрывать диалог */
  onConfirm: () => Promise<boolean | void> | boolean | void
}) {
  const [innerOpen, setInnerOpen] = useState(false)
  const open = controlledOpen ?? innerOpen
  const setOpen = (o: boolean) => (onOpenChange ? onOpenChange(o) : setInnerOpen(o))
  const [pending, startTransition] = useTransition()

  return (
    <>
      {trigger?.(() => setOpen(true))}
      <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
            <Button
              variant={destructive ? "destructive" : "default"}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await onConfirm()
                  if (result !== false) setOpen(false)
                })
              }
            >
              {pending ? "Подождите…" : confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** Управляемое окно (open/onOpenChange без trigger) создаётся только при первом открытии */
export function ConfirmDialog(props: React.ComponentProps<typeof ConfirmDialogInner>) {
  const opened = useOpenedOnce(!!props.open)
  if (!props.trigger && props.open !== undefined && !opened) return null
  return <ConfirmDialogInner {...props} />
}
