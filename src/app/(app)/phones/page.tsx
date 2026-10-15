import { redirect } from "next/navigation"
import type { Metadata } from "next"
import Link from "next/link"
import { DownloadIcon, PlusIcon, SmartphoneIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/auth"
import { formatMoney } from "@/lib/format"
import { BRANDS, OTHER_BRAND, brandByKey, detectBrand, shortModelName } from "@/lib/brands"
import { PHONE_STATUS_DOT, PHONE_STATUS_LABEL, PHONE_STATUSES } from "@/lib/labels"
import { buttonVariants } from "@/components/ui/button"
import { EmptyState, PageHeader } from "@/components/page-header"
import { Pagination } from "@/components/pagination"
import type { StatusTab } from "@/components/status-tabs"
import {
  buildPhoneOrderBy,
  buildPhoneWhere,
  onVerificationWhere,
  parsePhoneFilters,
  phoneFiltersToParams,
  phoneListInclude,
  type SearchParams,
} from "@/server/phone-filters"
import { PhoneFiltersBar } from "./phone-filters-bar"
import { PhoneList } from "./phone-list"
import { getListLayout } from "@/lib/list-layout"

export const metadata: Metadata = { title: "Товары" }

const PAGE_SIZE = 50

export default async function PhonesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser()
  // у верификатора нет склада — его телефоны живут в «Верификациях»
  if (user.role === "VERIFIER") redirect("/verifications")
  const filters = parsePhoneFilters(await searchParams)
  const where = buildPhoneWhere(filters, user.id)

  const withoutStatus = buildPhoneWhere({ ...filters, status: "" }, user.id)
  const [rawPhones, total, sum, byStatus, byModel, onVerification] = await Promise.all([
    prisma.phone.findMany({
      where,
      orderBy: buildPhoneOrderBy(filters.sort),
      include: phoneListInclude,
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.phone.count({ where }),
    // сумма закупки — только по своим телефонам (цены компаний верификатору не показываем)
    prisma.phone.aggregate({ where: { AND: [where, { ownerId: user.id }] }, _sum: { purchasePrice: true } }),
    // счётчики для вкладок: статусы — без учёта выбранного статуса, марки/модели — без учёта марки и модели
    prisma.phone.groupBy({ by: ["status"], where: withoutStatus, _count: true }),
    prisma.phone.groupBy({ by: ["model"], where: buildPhoneWhere({ ...filters, brand: "", model: "" }, user.id), _count: true }),
    // проданные телефоны у верификатора тоже считаются «На верификации»
    prisma.phone.count({ where: { AND: [withoutStatus, onVerificationWhere] } }),
  ])

  // Телефоны компаний, переданные верификатору: без цен, поставщика, заметки и продаж — даже в коде страницы
  const phones = rawPhones.map((p) =>
    p.ownerId === user.id ? p : { ...p, purchasePrice: 0, supplier: null, note: null, sales: [] }
  )

  // ── вкладки статусов
  const statusTabs: StatusTab[] = [
    { value: "", label: "Все", count: byStatus.reduce((a, r) => a + r._count, 0) },
    ...PHONE_STATUSES.map((s) => ({
      value: s,
      label: PHONE_STATUS_LABEL[s],
      dot: PHONE_STATUS_DOT[s],
      count: s === "ON_VERIFICATION" ? onVerification : (byStatus.find((r) => r.status === s)?._count ?? 0),
    })),
  ]

  // ── марки и модели
  const brandCounts = new Map<string, number>()
  for (const r of byModel) {
    const key = detectBrand(r.model).key
    brandCounts.set(key, (brandCounts.get(key) ?? 0) + r._count)
  }
  const brandTabs: StatusTab[] = [
    { value: "", label: "Все", count: byModel.reduce((a, r) => a + r._count, 0) },
    ...[...BRANDS, OTHER_BRAND]
      .filter((b) => brandCounts.has(b.key) || b.key === filters.brand)
      .map((b) => ({ value: b.key, label: b.label, count: brandCounts.get(b.key) ?? 0 })),
  ]
  const brand = filters.brand ? brandByKey(filters.brand) : undefined
  const modelTabs: StatusTab[] | null = brand
    ? [
        { value: "", label: `Все ${brand.label}`, count: brandCounts.get(brand.key) ?? 0 },
        ...byModel
          .filter((r) => detectBrand(r.model).key === brand.key)
          .sort((a, b) => a.model.localeCompare(b.model, "ru", { numeric: true }))
          .map((r) => ({ value: r.model, label: shortModelName(r.model), count: r._count })),
      ]
    : null

  const params = phoneFiltersToParams(filters)
  const exportQs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString()
  const anyFilter = Object.values(params).some(Boolean)

  return (
    <>
      <PageHeader
        title="Товары"
        description={
          <>
            Найдено <b className="text-foreground">{total}</b> · по закупке{" "}
            <b className="text-foreground">{formatMoney(sum._sum.purchasePrice ?? 0)}</b>
          </>
        }
        actions={
          <>
            <a
              href={`/api/export/phones${exportQs ? `?${exportQs}` : ""}`}
              className={buttonVariants({ variant: "outline" })}
            >
              <DownloadIcon /> Excel
            </a>
            <Link href="/phones/new" className={buttonVariants()}>
              <PlusIcon /> Добавить телефон
            </Link>
          </>
        }
      />
      <PhoneFiltersBar statusTabs={statusTabs} brandTabs={brandTabs} modelTabs={modelTabs} />
      {phones.length === 0 ? (
        <EmptyState icon={<SmartphoneIcon className="size-6" />}>
          {!anyFilter ? (
            <>
              Телефонов пока нет.{" "}
              <Link href="/phones/new" className="font-medium text-primary underline">
                Добавьте первый
              </Link>{" "}
              или{" "}
              <Link href="/phones/import" className="font-medium text-primary underline">
                импортируйте из Excel
              </Link>
              .
            </>
          ) : (
            "Ничего не найдено. Попробуйте изменить фильтры."
          )}
        </EmptyState>
      ) : (
        <PhoneList phones={phones} viewerId={user.id} layout={await getListLayout()} />
      )}
      <Pagination page={filters.page} pageCount={Math.ceil(total / PAGE_SIZE)} basePath="/phones" params={params} />
    </>
  )
}
