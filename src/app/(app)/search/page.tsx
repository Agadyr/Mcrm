import type { Metadata } from "next"
import Link from "next/link"
import { BriefcaseIcon, ContactRoundIcon, SearchIcon, ShieldCheckIcon, SmartphoneIcon, UserIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/auth"
import { formatDate, phoneTitle } from "@/lib/format"
import { formatCustomerPhone } from "@/lib/customers"
import { PageHeader, EmptyState } from "@/components/page-header"
import { PhoneStatusBadge, VerificationStatusBadge } from "@/components/status-badge"
import { SearchBox } from "@/components/search-box"
import { SearchScan } from "@/components/search-scan"
import { CopyText } from "@/components/copy-text"
import { displayName } from "@/server/access"
import { customerSearchWhere } from "@/server/customers"
import { buildPhoneWhere, parsePhoneFilters } from "@/server/phone-filters"
import { buildVerificationWhere, parseVerificationFilters } from "@/server/verification-filters"

export const metadata: Metadata = { title: "Поиск" }

const LIMIT = 20

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser()
  const q = ((await searchParams).q ?? "").trim()
  const isVerifier = user.role === "VERIFIER"

  if (!q) {
    return (
      <>
        <PageHeader title="Поиск" description="По IMEI, модели, серийному номеру, поставщику, дате (например 07.10.2026), человеку, верификатору, покупателю или клиенту" />
        <div className="flex max-w-xl gap-2">
          <SearchBox autoFocus className="flex-1" />
          <SearchScan />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Можно отсканировать штрихкод IMEI с коробки — кнопка справа.</p>
      </>
    )
  }

  const [phones, verifications, people, agents, customers] = await Promise.all([
    // у верификатора нет склада — его телефоны ищем среди верификаций
    isVerifier
      ? Promise.resolve([])
      : prisma.phone.findMany({
          where: buildPhoneWhere(parsePhoneFilters({ q }), user.id),
          orderBy: { updatedAt: "desc" },
          take: LIMIT,
        }),
    prisma.verification.findMany({
      where: buildVerificationWhere({ ...parseVerificationFilters({}), q }, user.id),
      include: {
        verifier: { select: { fullName: true, ownerId: true } },
        agent: { select: { name: true, login: true } },
        owner: { select: { name: true, login: true, companyName: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: LIMIT,
    }),
    prisma.verifier.findMany({
      where: {
        ownerId: user.id,
        OR: [{ fullName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }],
      },
      take: 10,
    }),
    // верификаторы-аккаунты — их ищет компания (у самого верификатора такого справочника нет)
    isVerifier
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: {
            role: "VERIFIER",
            isActive: true,
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { login: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
            ],
          },
          select: { id: true, name: true, login: true, phone: true },
          take: 10,
        }),
    // клиенты-покупатели — только у компании
    isVerifier
      ? Promise.resolve([])
      : prisma.customer.findMany({
          where: { ownerId: user.id, ...customerSearchWhere(q) },
          select: { id: true, name: true, phone: true },
          orderBy: { updatedAt: "desc" },
          take: 10,
        }),
  ])

  const total = phones.length + verifications.length + people.length + agents.length + customers.length

  return (
    <>
      <PageHeader title="Поиск" description={`По запросу «${q}» найдено: ${total}`} />
      <div className="mb-5 flex max-w-xl gap-2">
        <SearchBox defaultValue={q} className="flex-1" />
        <SearchScan />
      </div>

      {total === 0 ? (
        <EmptyState icon={<SearchIcon className="size-6" />}>Ничего не найдено. Проверьте IMEI или попробуйте часть номера.</EmptyState>
      ) : (
        <div className="flex flex-col gap-5">
          {agents.length > 0 && (
            <Section title="Верификаторы" icon={<BriefcaseIcon />}>
              {agents.map((a) => (
                <Link key={a.id} href={`/verifications?verifier=${a.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
                  <span className="font-medium">{displayName(a)}</span>
                  {a.phone && <CopyText value={a.phone} />}
                </Link>
              ))}
            </Section>
          )}

          {customers.length > 0 && (
            <Section title="Клиенты" icon={<ContactRoundIcon />}>
              {customers.map((c) => (
                <Link key={c.id} href={`/customers/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
                  <span className="font-medium">{c.name}</span>
                  {c.phone && <span className="text-sm text-muted-foreground tabular-nums">{formatCustomerPhone(c.phone)}</span>}
                </Link>
              ))}
            </Section>
          )}

          {phones.length > 0 && (
            <Section title={isVerifier ? "Телефоны" : "Товары"} icon={<SmartphoneIcon />}>
              {phones.map((p) => (
                <Link key={p.id} href={`/phones/${p.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-medium">{phoneTitle(p)}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {p.imei1}
                      {p.imei2 ? ` · ${p.imei2}` : ""}
                    </div>
                  </div>
                  <PhoneStatusBadge status={p.status} />
                </Link>
              ))}
            </Section>
          )}

          {verifications.length > 0 && (
            <Section title="Верификации" icon={<ShieldCheckIcon />}>
              {verifications.map((v) => {
                const handler = (v.agentId ?? v.ownerId) === user.id
                const who =
                  v.agentId && v.agentId !== v.ownerId && !handler
                    ? `верификатор ${v.agent ? displayName(v.agent) : "—"}`
                    : (v.verifier?.fullName ?? "человек не выбран")
                return (
                  <Link key={v.id} href={`/verifications/${v.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-medium">{v.phoneModel}</div>
                      <div className="text-xs text-muted-foreground">
                        {v.ownerId !== user.id ? `от ${v.owner.companyName || displayName(v.owner)} · ` : ""}
                        {who} · {formatDate(v.handedAt)}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">{v.imei1}</div>
                    </div>
                    <VerificationStatusBadge status={v.status} />
                  </Link>
                )
              })}
            </Section>
          )}

          {people.length > 0 && (
            <Section title={isVerifier ? "Мои люди" : "Люди"} icon={<UserIcon />}>
              {people.map((p) => (
                <Link key={p.id} href={`/verifications?verifier=${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
                  <span className="font-medium">{p.fullName}</span>
                  {p.phone && <CopyText value={p.phone} />}
                </Link>
              ))}
            </Section>
          )}
        </div>
      )}
    </>
  )
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <h2 className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5 text-sm font-semibold [&_svg]:size-4 [&_svg]:text-muted-foreground">
        {icon}
        {title}
      </h2>
      <div className="divide-y">{children}</div>
    </section>
  )
}
