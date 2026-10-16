"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/form-field"
import { CustomerAutocomplete } from "@/components/customer-autocomplete"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { formatMoney } from "@/lib/format"
import { formatCustomerPhone } from "@/lib/customers"
import { deleteSalePaymentAction, updateSaleInfoAction } from "@/server/actions/sales"

/** Покупатель, срок возврата долга и заметка */
export function SaleInfoForm({
  saleId,
  hasDebt,
  defaults,
}: {
  saleId: string
  hasDebt: boolean
  defaults: { buyerName: string; buyerPhone: string; dueDate: string; note: string }
}) {
  const router = useRouter()
  const [v, setV] = useState(defaults)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const changed = (Object.keys(v) as (keyof typeof v)[]).some((k) => v[k] !== defaults[k])
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }))
  const pickCustomer = (c: { name: string; phone: string | null }) =>
    setV((p) => ({ ...p, buyerName: c.name, buyerPhone: formatCustomerPhone(c.phone) }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    const r = await updateSaleInfoAction(saleId, v)
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
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <FormField label="Покупатель" htmlFor="buyerName" required={hasDebt} error={errors.buyerName}>
        <CustomerAutocomplete
          id="buyerName"
          value={v.buyerName}
          onChange={(buyerName) => setV((p) => ({ ...p, buyerName }))}
          onPick={pickCustomer}
          placeholder="Имя"
        />
      </FormField>
      <FormField label="Телефон покупателя" htmlFor="buyerPhone" error={errors.buyerPhone}>
        <CustomerAutocomplete
          id="buyerPhone"
          type="tel"
          value={v.buyerPhone}
          onChange={(buyerPhone) => setV((p) => ({ ...p, buyerPhone }))}
          onPick={pickCustomer}
          placeholder="+7 7__ ___ __ __"
        />
      </FormField>
      {hasDebt && (
        <FormField label="Вернёт долг до" htmlFor="dueDate" error={errors.dueDate}>
          <Input id="dueDate" type="date" value={v.dueDate} onChange={set("dueDate")} />
        </FormField>
      )}
      <FormField label="Заметка" htmlFor="saleNote" error={errors.note} className="sm:col-span-2">
        <Textarea id="saleNote" rows={2} value={v.note} onChange={set("note")} />
      </FormField>
      {changed && (
        <div className="flex gap-2 sm:col-span-2">
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

/** Удалить ошибочную оплату */
export function DeletePaymentButton({ id, amount }: { id: string; amount: number }) {
  const router = useRouter()
  return (
    <ConfirmDialog
      trigger={(open) => (
        <Button variant="ghost" size="icon-sm" onClick={open} aria-label="Удалить оплату" title="Удалить оплату">
          <Trash2Icon />
        </Button>
      )}
      title={`Удалить оплату ${formatMoney(amount)}?`}
      description="Если оплату внесли по ошибке. Сумма вернётся в долг покупателя."
      confirmLabel="Удалить"
      destructive
      onConfirm={async () => {
        const r = await deleteSalePaymentAction(id)
        if (!r.ok) {
          toast.error(r.error)
          return false
        }
        toast.success("Оплата удалена")
        router.refresh()
      }}
    />
  )
}
