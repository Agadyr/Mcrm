"use client"

import { useOpenedOnce } from "@/lib/use-opened-once"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/form-field"
import { CustomerAutocomplete } from "@/components/customer-autocomplete"
import { MoneyInput } from "@/components/money-input"
import { NativeSelect } from "@/components/native-select"
import { isYmd, todayYmd } from "@/lib/dates"
import { formatMoney } from "@/lib/format"
import { PAYMENT_METHOD_LABEL, PAYMENT_METHODS, SALE_METHODS } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { formatCustomerPhone } from "@/lib/customers"
import { saleSchema, type SaleData, type SaleInput } from "@/lib/validators/phone"
import { sellPhoneAction } from "@/server/actions/phones"

export type SellTarget = {
  id: string
  title: string
  purchasePrice: number
  onVerification: boolean
}

function SellDialogInner({
  phone,
  open,
  onOpenChange,
}: {
  phone: SellTarget
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const form = useForm<SaleInput, unknown, SaleData>({
    resolver: zodResolver(saleSchema),
    defaultValues: emptyValues(),
  })
  const { errors, isSubmitting } = form.formState

  useEffect(() => {
    if (open) form.reset(emptyValues())
  }, [open, form])

  const salePrice = Number(String(form.watch("salePrice") ?? "").replace(/\D/g, "")) || 0
  const profit = salePrice - phone.purchasePrice
  const onDebt = form.watch("paymentMethod") === "DEBT"
  const paidNow = Number(String(form.watch("paidNow") ?? "").replace(/\D/g, "")) || 0
  const debt = Math.max(0, salePrice - paidNow)
  const soldAt = form.watch("soldAt")
  /** быстрый выбор срока: через N дней от даты продажи */
  const dueIn = (days: number) => {
    const d = new Date(`${isYmd(soldAt ?? "") ? soldAt : todayYmd()}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    form.setValue("dueDate", d.toISOString().slice(0, 10), { shouldValidate: true })
  }

  /** клиент из базы: имя и номер сразу в оба поля */
  const pickCustomer = (c: { name: string; phone: string | null }) => {
    form.setValue("buyerName", c.name, { shouldValidate: true })
    form.setValue("buyerPhone", formatCustomerPhone(c.phone), { shouldValidate: true })
  }

  async function onSubmit() {
    const result = await sellPhoneAction(phone.id, form.getValues())
    if (!result.ok) {
      for (const [k, v] of Object.entries(result.fieldErrors ?? {})) form.setError(k as keyof SaleInput, { message: v })
      toast.error(result.error)
      return
    }
    // после продажи телефон можно сразу отдать на верификацию
    toast.success(!onDebt ? "Продажа сохранена" : `Продажа сохранена, долг ${formatMoney(debt)}`, {
      duration: 10_000,
      action: phone.onVerification
        ? undefined
        : { label: "На верификацию", onClick: () => router.push(`/verifications/new?phoneId=${phone.id}`) },
    })
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Продажа</DialogTitle>
          <DialogDescription>{phone.title}</DialogDescription>
        </DialogHeader>
        <form id="sell-form" onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
          {phone.onVerification && (
            <div className="flex gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              <TriangleAlertIcon className="size-4 shrink-0" />
              Телефон сейчас на верификации. Продать его всё равно можно.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Цена продажи" htmlFor="salePrice" required error={errors.salePrice?.message}>
              <Controller
                control={form.control}
                name="salePrice"
                render={({ field }) => (
                  <MoneyInput id="salePrice" autoFocus value={field.value as string} onChange={field.onChange} />
                )}
              />
            </FormField>
            <FormField label="Дата продажи" htmlFor="soldAt" required error={errors.soldAt?.message}>
              <Input id="soldAt" type="date" {...form.register("soldAt")} />
            </FormField>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              Закупка {formatMoney(phone.purchasePrice)} · Прибыль
            </span>
            <span className={cn("font-semibold tabular-nums", profit < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400")}>
              {salePrice ? formatMoney(profit) : "—"}
            </span>
          </div>
          <FormField label="Способ оплаты" htmlFor="paymentMethod" required error={errors.paymentMethod?.message}>
            <NativeSelect id="paymentMethod" {...form.register("paymentMethod")}>
              {SALE_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABEL[m]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {onDebt && (
            <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/40">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Предоплата" htmlFor="paidNow" error={errors.paidNow?.message} hint="Пусто — всё в долг">
                  <Controller
                    control={form.control}
                    name="paidNow"
                    render={({ field }) => <MoneyInput id="paidNow" value={field.value as string} onChange={field.onChange} />}
                  />
                </FormField>
                {paidNow > 0 ? (
                  <FormField label="Чем внёс" htmlFor="prepayMethod">
                    <NativeSelect id="prepayMethod" {...form.register("prepayMethod")}>
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {PAYMENT_METHOD_LABEL[m]}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                ) : (
                  <div />
                )}
              </div>
              <FormField label="Вернёт до" htmlFor="dueDate" error={errors.dueDate?.message}>
                <Input id="dueDate" type="date" {...form.register("dueDate")} />
              </FormField>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  [1, "Завтра"],
                  [2, "Через 2 дня"],
                  [7, "Через неделю"],
                  [30, "Через месяц"],
                ].map(([days, label]) => (
                  <Button key={days} type="button" size="xs" variant="outline" onClick={() => dueIn(days as number)}>
                    {label}
                  </Button>
                ))}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-amber-900 dark:text-amber-200">Долг покупателя</span>
                <span className="font-semibold text-amber-700 tabular-nums dark:text-amber-300">
                  {salePrice ? formatMoney(debt) : "—"}
                </span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Покупатель" htmlFor="buyerName" required={onDebt} error={errors.buyerName?.message}>
              <Controller
                control={form.control}
                name="buyerName"
                render={({ field }) => (
                  <CustomerAutocomplete id="buyerName" placeholder="Имя" value={field.value ?? ""} onChange={field.onChange} onPick={pickCustomer} />
                )}
              />
            </FormField>
            <FormField label="Телефон" htmlFor="buyerPhone" error={errors.buyerPhone?.message}>
              <Controller
                control={form.control}
                name="buyerPhone"
                render={({ field }) => (
                  <CustomerAutocomplete
                    id="buyerPhone"
                    type="tel"
                    placeholder="+7 7__ ___ __ __"
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onPick={pickCustomer}
                  />
                )}
              />
            </FormField>
          </div>
          <FormField label="Заметка" htmlFor="saleNote" error={errors.note?.message}>
            <Textarea id="saleNote" rows={2} {...form.register("note")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Отмена
          </Button>
          <Button type="submit" form="sell-form" disabled={isSubmitting}>
            {isSubmitting ? "Сохранение…" : "Сохранить продажу"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function emptyValues(): SaleInput {
  return {
    salePrice: "",
    soldAt: todayYmd(),
    buyerName: "",
    buyerPhone: "",
    paymentMethod: "CASH",
    paidNow: "",
    prepayMethod: "CASH",
    dueDate: "",
    note: "",
  }
}

/** Окно создаётся только при первом открытии (см. useOpenedOnce) */
export function SellDialog(props: React.ComponentProps<typeof SellDialogInner>) {
  return useOpenedOnce(props.open) ? <SellDialogInner {...props} /> : null
}
