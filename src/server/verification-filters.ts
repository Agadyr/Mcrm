import type { Prisma, VerificationStatus } from "@prisma/client"
import { ACTIVE_VERIFICATION_STATUSES, UNPAID_VERIFICATION_STATUSES } from "@/lib/labels"
import { normalizeImei } from "@/lib/imei"
import { VERIFICATION_STATUSES } from "@/lib/labels"
import type { SearchParams } from "./phone-filters"
import { verificationAccessWhere } from "./access"

export type VerificationFilters = {
  q: string
  status: VerificationStatus | "active" | ""
  verifierId: string
  paid: "yes" | "no" | ""
  page: number
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""

export function parseVerificationFilters(sp: SearchParams): VerificationFilters {
  const status = one(sp.status)
  const paid = one(sp.paid)
  return {
    q: one(sp.q).trim(),
    status:
      status === "active" || (VERIFICATION_STATUSES as string[]).includes(status)
        ? (status as VerificationFilters["status"])
        : "",
    verifierId: one(sp.verifier),
    paid: paid === "yes" || paid === "no" ? paid : "",
    page: Math.max(1, Number.parseInt(one(sp.page)) || 1),
  }
}

export function verificationFiltersToParams(f: VerificationFilters): Record<string, string | undefined> {
  return {
    q: f.q || undefined,
    status: f.status || undefined,
    verifier: f.verifierId || undefined,
    paid: f.paid || undefined,
  }
}

/** Условие выборки верификаций: свои + переданные пользователю (как верификатору), плюс фильтры */
export function buildVerificationWhere(f: VerificationFilters, userId: string): Prisma.VerificationWhereInput {
  const and: Prisma.VerificationWhereInput[] = [verificationAccessWhere(userId)]
  if (f.q) {
    const imei = normalizeImei(f.q)
    // по человеку ищем только среди «своих» людей — чужих контактов компания не видит
    const or: Prisma.VerificationWhereInput[] = [
      { verifier: { ownerId: userId, fullName: { contains: f.q, mode: "insensitive" } } },
      { verifier: { ownerId: userId, phone: { contains: f.q } } },
      { verifier: { ownerId: userId }, country: { contains: f.q, mode: "insensitive" } },
      { agent: { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { login: { contains: f.q, mode: "insensitive" } }] } },
      { owner: { companyName: { contains: f.q, mode: "insensitive" } } },
      { phoneModel: { contains: f.q, mode: "insensitive" } },
      { serialNumber: { contains: f.q, mode: "insensitive" } },
    ]
    if (/^\d+$/.test(imei)) or.push({ imei1: { contains: imei } }, { imei2: { contains: imei } })
    and.push({ OR: or })
  }
  if (f.status === "active") and.push({ status: { in: ACTIVE_VERIFICATION_STATUSES } })
  else if (f.status) and.push({ status: f.status })
  // «verifier» в адресе — человек из своего справочника или верификатор-аккаунт
  if (f.verifierId) and.push({ OR: [{ verifierId: f.verifierId, verifier: { ownerId: userId } }, { agentId: f.verifierId }] })
  // оплата: для компании — что она должна (человеку или верификатору); для верификатора — что он должен людям
  if (f.paid === "yes") and.push({ OR: [{ ...handledBy(userId), isPaid: true }, { ownerId: userId, ...viaAgent(userId), agentPaid: true }] })
  if (f.paid === "no")
    and.push({
      OR: [
        { ...handledBy(userId), isPaid: false, payment: { gt: 0 } },
        { ownerId: userId, ...viaAgent(userId), agentPaid: false, agentFee: { gt: 0 } },
      ],
    })
  return { AND: and }
}

export const verificationListInclude = {
  verifier: { select: { id: true, fullName: true, phone: true, ownerId: true } },
  agent: { select: { id: true, name: true, login: true, phone: true } },
  owner: { select: { id: true, name: true, login: true, companyName: true, phone: true } },
  phone: { select: { id: true, status: true, rfsStatus: true, rfsCheckedAt: true } },
} satisfies Prisma.VerificationInclude

export type VerificationListItem = Prisma.VerificationGetPayload<{ include: typeof verificationListInclude }>

/** Работу с человеком ведёт пользователь: передано ему как верификатору или это его верификация без верификатора */
export function handledBy(userId: string): Prisma.VerificationWhereInput {
  return { OR: [{ agentId: userId }, { ownerId: userId, agentId: null }] }
}

/** Передано другому верификатору (не себе) */
export function viaAgent(ownerId: string): Prisma.VerificationWhereInput {
  return { agentId: { not: null }, NOT: { agentId: ownerId } }
}

const notRejected = { status: { notIn: UNPAID_VERIFICATION_STATUSES } }

/** Долг людям, с которыми пользователь работает сам: payment не оплачен */
export function travelerDebtWhere(userId: string): Prisma.VerificationWhereInput {
  return { AND: [handledBy(userId), { isPaid: false, payment: { gt: 0 }, ...notRejected }] }
}

/** Долг компании верификаторам: agentFee не оплачен */
export function agentDebtWhere(ownerId: string): Prisma.VerificationWhereInput {
  return { ownerId, ...viaAgent(ownerId), agentPaid: false, agentFee: { gt: 0 }, ...notRejected }
}

/** Сколько должны верификатору (компании и его клиенты) */
export function owedToAgentWhere(agentId: string): Prisma.VerificationWhereInput {
  return { agentId, agentPaid: false, agentFee: { gt: 0 }, ...notRejected }
}
