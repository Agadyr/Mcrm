import "server-only"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { formatDate, formatMemory, formatMoney } from "@/lib/format"
import { normalizeImei } from "@/lib/imei"
import { BLOCKING_VERIFICATION_STATUSES, PAYMENT_METHOD_LABEL, PHONE_STATUS_LABEL, VERIFICATION_STATUS_LABEL } from "@/lib/labels"
import { crmButton, esc, type Button, type Keyboard } from "./ui"

// Поиск телефона по IMEI / модели и карточка телефона в чате

/** Что ищем: для продажи — непроданные, для верификации — проданные и свободные, иначе — любые */
export type PhonePurpose = "sell" | "verify" | "any"

const purposeWhere = (p: PhonePurpose): Prisma.PhoneWhereInput =>
  p === "sell"
    ? { status: { in: ["IN_STOCK", "RESERVED"] } }
    : p === "verify"
      ? { status: "SOLD", verifications: { none: { status: { in: BLOCKING_VERIFICATION_STATUSES } } } }
      : {}

const LIST = { id: true, model: true, memoryGb: true, color: true, imei1: true, purchasePrice: true, status: true } as const
export type PhoneListItem = Prisma.PhoneGetPayload<{ select: typeof LIST }>

/** Поиск: 4+ цифры — по IMEI (полный или хвост), иначе — по модели или серийному номеру */
export async function searchPhones(ownerId: string, query: string, purpose: PhonePurpose, take = 8) {
  const digits = normalizeImei(query)
  const q = query.trim()
  const match: Prisma.PhoneWhereInput = /^\d{4,20}$/.test(digits)
    ? { OR: [{ imei1: { contains: digits } }, { imei2: { contains: digits } }] }
    : { OR: [{ model: { contains: q, mode: "insensitive" } }, { serialNumber: { equals: q.toUpperCase() } }] }
  return prisma.phone.findMany({
    where: { ownerId, ...purposeWhere(purpose), ...match },
    select: LIST,
    orderBy: { receivedAt: "desc" },
    take,
  })
}

/** Последние подходящие телефоны — чтобы выбрать кнопкой, не вводя IMEI */
export function recentPhones(ownerId: string, purpose: PhonePurpose, take = 6) {
  return prisma.phone.findMany({
    where: { ownerId, ...purposeWhere(purpose) },
    select: LIST,
    orderBy: purpose === "verify" ? { updatedAt: "desc" } : { receivedAt: "desc" },
    take,
  })
}

export const phoneName = (p: { model: string; memoryGb: number | null; color?: string | null }) =>
  [p.model, formatMemory(p.memoryGb), p.color].filter(Boolean).join(" · ")

/** Кнопка выбора телефона: модель и последние 4 цифры IMEI */
export const phoneButton = (p: PhoneListItem, prefix: string): Button => ({
  text: `${p.model}${p.memoryGb ? ` ${formatMemory(p.memoryGb)}` : ""} · …${p.imei1.slice(-4)}`,
  data: `${prefix}:${p.id}`,
})

/** Полная карточка телефона и действия по нему */
export async function phoneCard(ownerId: string, phoneId: string): Promise<{ html: string; kb: Keyboard } | null> {
  const p = await prisma.phone.findFirst({
    where: { id: phoneId, ownerId },
    include: {
      sales: { where: { cancelledAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
      verifications: { orderBy: { createdAt: "desc" }, take: 1, include: { agent: { select: { name: true, login: true } }, verifier: { select: { fullName: true } } } },
    },
  })
  if (!p) return null
  const sale = p.sales[0]
  const v = p.verifications[0]
  const lines = [
    `📱 <b>${esc(phoneName(p))}</b>`,
    `IMEI1: <code>${p.imei1}</code>`,
    p.imei2 ? `IMEI2: <code>${p.imei2}</code>` : null,
    p.serialNumber ? `S/N: <code>${esc(p.serialNumber)}</code>` : null,
    "",
    `Статус: <b>${PHONE_STATUS_LABEL[p.status]}</b>${p.isVerified ? " · ✅ верифицирован" : ""}`,
    `Закупка: ${formatMoney(p.purchasePrice)}${p.supplier ? ` · ${esc(p.supplier)}` : ""}`,
  ]
  if (sale) {
    const debt = sale.salePrice - sale.paidAmount
    lines.push(
      `Продан ${formatDate(sale.soldAt)} за <b>${formatMoney(sale.salePrice)}</b> (${PAYMENT_METHOD_LABEL[sale.paymentMethod]})`,
      `Прибыль: <b>${formatMoney(sale.salePrice - p.purchasePrice)}</b>`
    )
    if (sale.buyerName) lines.push(`Покупатель: ${esc(sale.buyerName)}`)
    if (debt > 0) lines.push(`⚠️ Долг покупателя: <b>${formatMoney(debt)}</b>${sale.dueDate ? ` до ${formatDate(sale.dueDate)}` : ""}`)
  }
  if (v) {
    const to = v.agent ? `верификатор ${esc(v.agent.name || v.agent.login)}` : v.verifier ? esc(v.verifier.fullName) : "—"
    lines.push(`Верификация: <b>${VERIFICATION_STATUS_LABEL[v.status]}</b> · ${to}`)
  }

  const canVerify =
    p.status === "SOLD" && !(await prisma.verification.count({ where: { phoneId: p.id, status: { in: BLOCKING_VERIFICATION_STATUSES } } }))
  const kb: Keyboard = [
    [
      ...(p.status === "IN_STOCK" || p.status === "RESERVED" ? [{ text: "💰 Продать", data: `sp:${p.id}` }] : []),
      ...(canVerify ? [{ text: "🛡 На верификацию", data: `vp:${p.id}` }] : []),
    ],
    crmButton(`/phones/${p.id}`),
  ]
  return { html: lines.filter((l) => l !== null).join("\n"), kb }
}
