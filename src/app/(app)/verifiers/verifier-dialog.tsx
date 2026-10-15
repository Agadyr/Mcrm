"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { FormField } from "@/components/form-field"
import { verifierSchema, type VerifierInput } from "@/lib/validators/verification"
import { deleteVerifierAction, saveVerifierAction } from "@/server/actions/verifiers"

type Verifier = { id: string; fullName: string; phone: string | null; note: string | null }

export function VerifierDialogButton({ verifier }: { verifier?: Verifier }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const form = useForm<VerifierInput>({ resolver: zodResolver(verifierSchema) })
  const { errors, isSubmitting } = form.formState

  useEffect(() => {
    if (open) form.reset({ fullName: verifier?.fullName ?? "", phone: verifier?.phone ?? "", note: verifier?.note ?? "" })
  }, [open, verifier, form])

  async function onSubmit(values: VerifierInput) {
    const r = await saveVerifierAction(verifier?.id ?? null, values)
    if (!r.ok) {
      for (const [k, v] of Object.entries(r.fieldErrors ?? {})) form.setError(k as keyof VerifierInput, { message: v })
      toast.error(r.error)
      return
    }
    toast.success("Сохранено")
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      {verifier ? (
        <Button size="icon-sm" variant="ghost" onClick={() => setOpen(true)} aria-label="Редактировать">
          <PencilIcon />
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <PlusIcon /> Добавить человека
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{verifier ? "Редактировать" : "Новый верификатор"}</DialogTitle>
          </DialogHeader>
          <form id="verifier-form" onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <FormField label="ФИО" htmlFor="fullName" required error={errors.fullName?.message}>
              <Input id="fullName" autoFocus {...form.register("fullName")} />
            </FormField>
            <FormField label="Номер телефона" htmlFor="vphone" error={errors.phone?.message}>
              <Input id="vphone" type="tel" {...form.register("phone")} />
            </FormField>
            <FormField label="Заметка" htmlFor="vnote" error={errors.note?.message}>
              <Textarea id="vnote" rows={2} {...form.register("note")} />
            </FormField>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" form="verifier-form" disabled={isSubmitting}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function DeleteVerifierButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  return (
    <ConfirmDialog
      trigger={(open) => (
        <Button size="icon-sm" variant="ghost" onClick={open} aria-label="Удалить">
          <Trash2Icon className="text-destructive" />
        </Button>
      )}
      title="Удалить человека?"
      description={`${name} будет удалён из справочника.`}
      confirmLabel="Удалить"
      destructive
      onConfirm={async () => {
        const r = await deleteVerifierAction(id)
        if (!r.ok) {
          toast.error(r.error)
          return false
        }
        toast.success("Удалено")
        router.refresh()
      }}
    />
  )
}
