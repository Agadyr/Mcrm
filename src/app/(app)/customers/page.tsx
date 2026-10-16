import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ContactRoundIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/auth"
import { formatDate, formatMoney } from "@/lib/format"
import { formatCustomerPhone } from "@/lib/customers"
import { getListLayout, listClasses } from "@/lib/list-layout"
import { EmptyState, PageHeader } from "@/components/page-header"
import { Pagination } from "@/components/pagination"
import { WhatsAppLink } from "@/components/whatsapp-link"
import { listCustomers, type CustomerListItem } from "@/server/customers"
import type { SearchParams } from "@/server/phone-filters"
import { CustomerSearch } from "./customer-search"

export const metadata: Metadata = { title: "Клиенты" }

const PAGE_SIZE = 50

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const lc = listClasses(await getListLayout())
  const user = await requireUser()
  if (user.role === "VERIFIER") redirect("/")
  const sp = await searchParams
  const q = one(sp.q).trim()
  const page = Math.max(1, Number.parseInt(one(sp.page)) || 1)

  const [{ items, total }, all] = await Promise.all([
    listCustomers(user.id, { q, page, pageSize: PAGE_SIZE }),
    prisma.customer.count({ where: { ownerId: user.id } }),
  ])

  return (
    <>
      <PageHeader
        title="Клиенты"
        description={`Покупатели с номером телефона попадают сюда автоматически при продаже · всего ${all}`}
      />
      <CustomerSearch />

      {items.length === 0 ? (
        <EmptyState icon={<ContactRoundIcon className="size-6" />}>
          {q ? "Никого не нашли. Попробуйте часть имени или номера." : "Клиентов пока нет. Укажите телефон покупателя при продаже — он появится здесь."}
        </EmptyState>
      ) : (
        <>
          {lc.showTable && (
            <div className={lc.table}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Клиент</th>
                    <th className="px-4 py-3 font-medium">Телефон</th>
                    <th className="px-4 py-3 text-right font-medium">Покупки</th>
                    <th className="px-4 py-3 text-right font-medium">Долг</th>
                    <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Последняя покупка</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((c) => (
                    <tr key={c.id} className="align-top transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link href={`/customers/${c.id}`} className="font-semibold hover:text-primary">
                          {c.name}
                        </Link>
                        {c.note && <div className="line-clamp-1 text-xs text-muted-foreground">{c.note}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <Phone c={c} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <div className="font-medium">{formatMoney(c.purchaseSum)}</div>
                        <div className="text-xs text-muted-foreground">шт.: {c.purchaseCount}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Debt debt={c.debt} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{c.lastPurchaseAt ? formatDate(c.lastPurchaseAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {lc.showCards && (
            <div className={lc.cards}>
              {items.map((c) => (
                <div key={c.id} className="rounded-2xl border bg-card shadow-xs">
                  <div className="flex items-start justify-between gap-3 p-4 pb-3">
                    <Link href={`/customers/${c.id}`} className="min-w-0">
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.lastPurchaseAt ? `последняя покупка ${formatDate(c.lastPurchaseAt)}` : "покупок нет"}
                      </div>
                    </Link>
                    <div className="text-right tabular-nums">
                      <div className="font-semibold">{formatMoney(c.purchaseSum)}</div>
                      <div className="text-xs text-muted-foreground">шт.: {c.purchaseCount}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3 text-sm">
                    <Phone c={c} />
                    <Debt debt={c.debt} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <Pagination page={page} pageCount={Math.ceil(total / PAGE_SIZE)} basePath="/customers" params={{ q: q || undefined }} />
        </>
      )}
    </>
  )
}

function Phone({ c }: { c: CustomerListItem }) {
  if (!c.phone) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex items-center gap-1">
      <a href={`tel:${c.phone}`} className="whitespace-nowrap text-muted-foreground tabular-nums hover:text-primary">
        {formatCustomerPhone(c.phone)}
      </a>
      <WhatsAppLink phone={c.phone} />
    </div>
  )
}

function Debt({ debt }: { debt: number }) {
  return debt > 0 ? (
    <span className="font-semibold text-amber-700 tabular-nums dark:text-amber-400">{formatMoney(debt)}</span>
  ) : (
    <span className="text-xs text-muted-foreground">нет долга</span>
  )
}
