"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { HandCoinsIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/form-field"
import { MoneyInput } from "@/components/money-input"
import { NativeSelect } from "@/components/native-select"
import { todayYmd } from "@/lib/dates"
import { formatMoney } from "@/lib/format"
import { PAYMENT_METHOD_LABEL, PAYMENT_METHODS } from "@/lib/labels"
import { addSalePaymentAction } from "@/server/actions/sales"

/** «Принять оплату»: покупатель вернул долг целиком или частью */
export function SalePaymentButton({
  saleId,
  title,
  debt,
  size = "sm",
  className,
}: {
  saleId: string
  title: string
  debt: number
  size?: "sm" | "default"
  className?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(String(debt))
  const [paidAt, setPaidAt] = useState(todayYmd())
  const [method, setMethod] = useState("CASH")
  const [dueDate, setDueDate] = useState("")
  const [note, setNote] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  const value = Number(amount.replace(/\D/g, "")) || 0
  const left = Math.max(0, debt - value)

  function openDialog() {
    setAmount(String(debt))
    setPaidAt(todayYmd())
    setMethod("CASH")
    setDueDate("")
    setNote("")
    setErrors({})
    setOpen(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    const r = await addSalePaymentAction(saleId, { amount, paidAt, method, note, dueDate })
    setPending(false)
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {})
      toast.error(r.error)
      return
    }
    toast.success(left > 0 ? `Оплата ${formatMoney(value)} принята, осталось ${formatMoney(left)}` : "Долг закрыт")
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <Button type="button" size={size} className={className} onClick={openDialog}>
        <HandCoinsIcon /> Принять оплату
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Оплата долга</DialogTitle>
            <DialogDescription>
              {title} · долг <b className="text-foreground">{formatMoney(debt)}</b>
            </DialogDescription>
          </DialogHeader>
          <form id={`pay-${saleId}`} onSubmit={submit} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Сколько принесли" htmlFor="pay-amount" required error={errors.amount}>
                <MoneyInput id="pay-amount" autoFocus value={amount} onChange={setAmount} />
              </FormField>
              <FormField label="Дата" htmlFor="pay-date" required error={errors.paidAt}>
                <Input id="pay-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
              </FormField>
            </div>
            <FormField label="Как заплатил" htmlFor="pay-method">
              <NativeSelect id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">После оплаты останется</span>
              <span className={left > 0 ? "font-semibold text-amber-700 tabular-nums" : "font-semibold text-emerald-700 tabular-nums"}>
                {left > 0 ? formatMoney(left) : "долг закрыт"}
              </span>
            </div>
            {left > 0 && (
              <FormField label="Остаток вернёт до" htmlFor="pay-due" error={errors.dueDate} hint="Можно оставить прежний срок">
                <Input id="pay-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </FormField>
            )}
            <FormField label="Заметка" htmlFor="pay-note" error={errors.note}>
              <Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Необязательно" />
            </FormField>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Отмена
            </Button>
            <Button type="submit" form={`pay-${saleId}`} disabled={pending || value <= 0}>
              {pending ? "Сохранение…" : `Принять ${value ? formatMoney(value) : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
