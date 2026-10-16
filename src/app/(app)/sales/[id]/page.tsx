import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeftIcon, ContactRoundIcon, SmartphoneIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/auth"
import { dateToYmd, todayDate } from "@/lib/dates"
import { formatDate, formatDateTime, formatMoney, phoneTitle } from "@/lib/format"
import { PAYMENT_METHOD_LABEL } from "@/lib/labels"
import { debtReminder } from "@/lib/sales"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/page-header"
import { CopyText } from "@/components/copy-text"
import { WhatsAppLink } from "@/components/whatsapp-link"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SalePaymentButton } from "../sale-payment-dialog"
import { DeletePaymentButton, SaleInfoForm } from "../sale-detail-client"

export const metadata: Metadata = { title: "Продажа" }

function loadSale(id: string, ownerId: string) {
  return prisma.sale.findFirst({
    where: { id, phone: { ownerId } },
    include: {
      phone: { select: { id: true, model: true, memoryGb: true, color: true, imei1: true, imei2: true, purchasePrice: true } },
      payments: { orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }] },
      customer: { select: { id: true, name: true } },
    },
  })
}

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const sale = await loadSale(id, user.id)
  if (!sale) notFound()

  const debt = sale.salePrice - sale.paidAmount
  const hasDebt = debt > 0 && !sale.cancelledAt
  const late = hasDebt && !!sale.dueDate && sale.dueDate < todayDate()
  const profit = sale.salePrice - sale.phone.purchasePrice
  const paidPct = sale.salePrice ? Math.min(100, Math.round((sale.paidAmount / sale.salePrice) * 100)) : 100

  return (
    <>
      <PageHeader
        back={
          <Link href="/sales" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ChevronLeftIcon className="size-4" /> Продажи
          </Link>
        }
        title={phoneTitle(sale.phone)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            Продан {formatDate(sale.soldAt)}
            {sale.cancelledAt ? (
              <Badge className="bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">продажа отменена</Badge>
            ) : hasDebt ? (
              <Badge className={late ? "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}>
                {late ? "долг просрочен" : "в долг"}
              </Badge>
            ) : (
              <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">оплачено</Badge>
            )}
          </span>
        }
        actions={
          <>
            <Link href={`/phones/${sale.phone.id}`} className={buttonVariants({ variant: "outline" })}>
              <SmartphoneIcon /> Карточка телефона
            </Link>
            {hasDebt && <SalePaymentButton saleId={sale.id} title={sale.phone.model} debt={debt} size="default" />}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {/* ── Деньги ── */}
          <Card>
            <CardHeader>
              <CardTitle>Оплата</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
                <Money label="Цена" value={formatMoney(sale.salePrice)} />
                <Money label="Оплачено" value={formatMoney(sale.paidAmount)} className="text-emerald-700 dark:text-emerald-400" />
                <Money
                  label="Долг"
                  value={hasDebt ? formatMoney(debt) : "0 ₸"}
                  className={hasDebt ? "text-amber-700 dark:text-amber-400" : undefined}
                />
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted" aria-label={`Оплачено ${paidPct}%`}>
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${paidPct}%` }} />
              </div>
              {hasDebt && (
                <div className={cn("text-sm", late ? "font-medium text-destructive" : "text-muted-foreground")}>
                  {sale.dueDate ? `${late ? "Срок прошёл:" : "Вернёт до"} ${formatDate(sale.dueDate)}` : "Срок возврата не указан"}
                </div>
              )}

              <div>
                <h3 className="mb-1 text-sm font-medium">История оплат</h3>
                {sale.payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Оплат пока не было — всё в долг</p>
                ) : (
                  <ul className="divide-y rounded-xl border">
                    {sale.payments.map((p, i) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <div className="font-medium tabular-nums">{formatMoney(p.amount)}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(p.paidAt)} · {PAYMENT_METHOD_LABEL[p.method]}
                            {i === 0 && +p.paidAt === +sale.soldAt ? " · при продаже" : ""}
                            {p.note ? ` · ${p.note}` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="hidden text-xs text-muted-foreground sm:inline">внесено {formatDateTime(p.createdAt)}</span>
                          <DeletePaymentButton id={p.id} amount={p.amount} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Покупатель ── */}
          <Card>
            <CardHeader>
              <CardTitle>Покупатель</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {sale.customer && (
                <Link href={`/customers/${sale.customer.id}`} className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                  <ContactRoundIcon className="size-4" /> Карточка клиента: {sale.customer.name}
                </Link>
              )}
              {sale.buyerPhone && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <a href={`tel:${sale.buyerPhone}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Позвонить
                  </a>
                  <WhatsAppLink
                    phone={sale.buyerPhone}
                    text={hasDebt ? debtReminder(sale, sale.phone.model) : undefined}
                    label={hasDebt ? "Напомнить о долге" : "WhatsApp"}
                  />
                </div>
              )}
              <SaleInfoForm
                saleId={sale.id}
                hasDebt={hasDebt}
                defaults={{
                  buyerName: sale.buyerName ?? "",
                  buyerPhone: sale.buyerPhone ?? "",
                  dueDate: dateToYmd(sale.dueDate),
                  note: sale.note ?? "",
                }}
              />
            </CardContent>
          </Card>
        </div>

        {/* ── Телефон ── */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Телефон</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <Row label="Модель">{phoneTitle(sale.phone)}</Row>
            <Row label="IMEI1">
              <CopyText value={sale.phone.imei1} />
            </Row>
            {sale.phone.imei2 && (
              <Row label="IMEI2">
                <CopyText value={sale.phone.imei2} />
              </Row>
            )}
            <Row label="Закупка">{formatMoney(sale.phone.purchasePrice)}</Row>
            <Row label="Прибыль">
              <span className={cn("font-semibold", profit < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400")}>
                {formatMoney(profit)}
              </span>
            </Row>
            <Row label="Способ оплаты">{PAYMENT_METHOD_LABEL[sale.paymentMethod]}</Row>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", className)}>{children}</span>
}

function Money({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-xl bg-muted/60 py-2.5">
      <div className={cn("text-base font-semibold text-foreground tabular-nums sm:text-lg", className)}>{value}</div>
      {label}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}
