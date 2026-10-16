"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/form-field"
import { updateCustomerAction } from "@/server/actions/customers"

/** Имя и заметка клиента */
export function CustomerForm({ id, defaults }: { id: string; defaults: { name: string; note: string } }) {
  const router = useRouter()
  const [v, setV] = useState(defaults)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const changed = v.name !== defaults.name || v.note !== defaults.note

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    const r = await updateCustomerAction(id, v)
    setPending(false)
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {})
      toast.error(r.error)
      return
    }
    setErrors({})
    toast.success("Сохранено")
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <FormField label="Имя" htmlFor="customerName" required error={errors.name}>
        <Input id="customerName" value={v.name} onChange={(e) => setV((p) => ({ ...p, name: e.target.value }))} />
      </FormField>
      <FormField label="Заметка" htmlFor="customerNote" error={errors.note}>
        <Textarea
          id="customerNote"
          rows={3}
          value={v.note}
          onChange={(e) => setV((p) => ({ ...p, note: e.target.value }))}
          placeholder="Например: постоянный клиент, берёт для семьи"
        />
      </FormField>
      {changed && (
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Сохранение…" : "Сохранить"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setV(defaults)} disabled={pending}>
            Отменить
          </Button>
        </div>
      )}
    </form>
  )
}
