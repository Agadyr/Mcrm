import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ChevronLeftIcon, PhoneIcon } from "lucide-react"
import { requireUser } from "@/lib/auth"
import { todayDate } from "@/lib/dates"
import { formatDate, formatMoney, phoneTitle } from "@/lib/format"
import { formatCustomerPhone } from "@/lib/customers"
import { PAYMENT_METHOD_LABEL } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/page-header"
import { WhatsAppLink } from "@/components/whatsapp-link"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getCustomer } from "@/server/customers"
import { CustomerForm } from "./customer-form"

export const metadata: Metadata = { title: "Клиент" }

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  if (user.role === "VERIFIER") redirect("/")
  const customer = await getCustomer(id, user.id)
  if (!customer) notFound()

  const { totals } = customer
  const today = todayDate()
  const debtText = totals.debt > 0 ? `Здравствуйте, ${customer.name}! Напоминаем об оплате: осталось ${formatMoney(totals.debt)}.` : undefined

  return (
    <>
      <PageHeader
        back={
          <Link href="/customers" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ChevronLeftIcon className="size-4" /> Клиенты
          </Link>
        }
        title={customer.name}
        description={customer.phone ? formatCustomerPhone(customer.phone) : "номер не указан"}
        actions={
          customer.phone && (
            <>
              <a href={`tel:${customer.phone}`} className={buttonVariants({ variant: "outline" })}>
                <PhoneIcon /> Позвонить
              </a>
              <WhatsAppLink phone={customer.phone} text={debtText} label={debtText ? "Напомнить о долге" : "WhatsApp"} className="h-9 px-3 text-sm" />
            </>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
            <Money label="Покупок" value={String(totals.purchaseCount)} />
            <Money label="На сумму" value={formatMoney(totals.purchaseSum)} />
            <Money
              label="Долг"
              value={formatMoney(totals.debt)}
              className={totals.debt > 0 ? "text-amber-700 dark:text-amber-400" : undefined}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Покупки</CardTitle>
            </CardHeader>
            <CardContent>
              {customer.sales.length === 0 ? (
                <p className="text-sm text-muted-foreground">Покупок пока нет</p>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {customer.sales.map((s) => {
                    const debt = s.cancelledAt ? 0 : Math.max(0, s.salePrice - s.paidAmount)
                    const late = debt > 0 && !!s.dueDate && s.dueDate < today
                    return (
                      <li key={s.id} className={cn("flex items-start justify-between gap-3 px-3 py-2.5 text-sm", s.cancelledAt && "opacity-60")}>
                        <Link href={`/sales/${s.id}`} className="min-w-0 hover:text-primary">
                          <div className="font-medium">{phoneTitle(s.phone)}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(s.soldAt)}
                            {s.cancelledAt ? " · отменена" : ` · ${PAYMENT_METHOD_LABEL[s.paymentMethod]}`}
                          </div>
                        </Link>
                        <div className="text-right tabular-nums">
                          <div className="font-semibold">{formatMoney(s.salePrice)}</div>
                          {debt > 0 ? (
                            <div className={cn("text-xs font-medium", late ? "text-destructive" : "text-amber-700 dark:text-amber-400")}>
                              долг {formatMoney(debt)}
                              {s.dueDate ? ` · ${late ? "просрочен с" : "до"} ${formatDate(s.dueDate)}` : ""}
                            </div>
                          ) : (
                            !s.cancelledAt && <div className="text-xs text-emerald-700 dark:text-emerald-400">оплачено</div>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Клиент</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="text-sm text-muted-foreground">
              В базе с {formatDate(customer.createdAt)}
              {totals.lastPurchaseAt ? ` · последняя покупка ${formatDate(totals.lastPurchaseAt)}` : ""}
            </div>
            <CustomerForm id={customer.id} defaults={{ name: customer.name, note: customer.note ?? "" }} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function Money({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-xl border bg-card py-2.5 shadow-xs">
      <div className={cn("text-base font-semibold text-foreground tabular-nums sm:text-lg", className)}>{value}</div>
      {label}
    </div>
  )
}
