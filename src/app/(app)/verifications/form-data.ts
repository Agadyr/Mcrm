import "server-only"
import { prisma } from "@/lib/db"
import { agentDebtWhere } from "@/server/verification-filters"
import { BLOCKING_VERIFICATION_STATUSES, UNPAID_VERIFICATION_STATUSES } from "@/lib/labels"
import type { AgentOption, StockPhoneOption, VerifierOption } from "./verification-form"
import type { BlockedPhone } from "./batch/batch-form"

/**
 * Телефоны для верификации: только проданные, которые ещё не на верификации и не верифицированы
 * (после «Отказ» или «Не зарегистрирован» можно отдать снова) + явно нужные (текущий в редактировании).
 */
export async function getStockPhones(
  ownerId: string,
  includeIds: (string | null | undefined)[] = []
): Promise<StockPhoneOption[]> {
  const ids = includeIds.filter((v): v is string => !!v)
  return prisma.phone.findMany({
    where: {
      ownerId,
      OR: [
        {
          status: "SOLD",
          verifications: {
            none: { status: { in: BLOCKING_VERIFICATION_STATUSES } },
          },
        },
        ...(ids.length ? [{ id: { in: ids } }] : []),
      ],
    },
    select: {
      id: true,
      model: true,
      memoryGb: true,
      color: true,
      imei1: true,
      imei2: true,
      serialNumber: true,
      status: true,
    },
    orderBy: [{ model: "asc" }, { receivedAt: "desc" }],
  })
}

/** Люди из справочника пользователя (у верификатора — те, кто был за границей) и их статистика */
/** Телефоны из товаров, которые сейчас нельзя отдать на верификацию, и почему (для подсказки сканера) */
export async function getBlockedPhones(ownerId: string): Promise<BlockedPhone[]> {
  const phones = await prisma.phone.findMany({
    where: {
      ownerId,
      OR: [
        { status: { not: "SOLD" } },
        {
          verifications: {
            some: { status: { in: BLOCKING_VERIFICATION_STATUSES } },
          },
        },
      ],
    },
    select: {
      model: true,
      imei1: true,
      imei2: true,
      status: true,
      verifications: { select: { status: true } },
    },
  })
  return phones.map((p) => ({
    model: p.model,
    imei1: p.imei1,
    imei2: p.imei2,
    reason:
      p.status !== "SOLD"
        ? "ещё не продан — на верификацию только после продажи"
        : p.verifications.some((v) => v.status === "VERIFIED")
          ? "уже верифицирован"
          : "уже на верификации",
  }))
}

export async function getVerifierStats(ownerId: string) {
  // человек принадлежит справочнику пользователя — значит, работу с ним ведёт этот пользователь
  const mine = { verifier: { ownerId } }
  const [verifiers, byStatus, paid, debt] = await Promise.all([
    prisma.verifier.findMany({
      where: { ownerId },
      orderBy: { fullName: "asc" },
    }),
    prisma.verification.groupBy({
      by: ["verifierId", "status"],
      where: mine,
      _count: { _all: true },
    }),
    prisma.verification.groupBy({
      by: ["verifierId"],
      where: { ...mine, isPaid: true },
      _sum: { payment: true },
    }),
    prisma.verification.groupBy({
      by: ["verifierId"],
      where: {
        ...mine,
        isPaid: false,
        payment: { gt: 0 },
        status: { notIn: UNPAID_VERIFICATION_STATUSES },
      },
      _sum: { payment: true },
    }),
  ])
  return verifiers.map((v) => {
    const rows = byStatus.filter((r) => r.verifierId === v.id)
    const count = (s?: string) => rows.filter((r) => !s || r.status === s).reduce((a, r) => a + r._count._all, 0)
    return {
      ...v,
      totalCount: count(),
      verifiedCount: count("VERIFIED"),
      activeCount: count("HANDED") + count("IN_PROGRESS"),
      rejectedCount: count("REJECTED") + count("NOT_REGISTERED"),
      paidSum: paid.find((p) => p.verifierId === v.id)?._sum.payment ?? 0,
      debtSum: debt.find((p) => p.verifierId === v.id)?._sum.payment ?? 0,
    }
  })
}

export async function getVerifierOptions(ownerId: string): Promise<VerifierOption[]> {
  const stats = await getVerifierStats(ownerId)
  return stats.map((v) => ({
    id: v.id,
    fullName: v.fullName,
    phone: v.phone,
    verifiedCount: v.verifiedCount,
    totalCount: v.totalCount,
    paidSum: v.paidSum,
  }))
}

/** Верификаторы-аккаунты (для выбора компанией) и статистика по ним для этой компании */
export async function getAgentStats(ownerId: string) {
  const via = { ownerId, agentId: { not: null }, NOT: { agentId: ownerId } }
  const [agents, byStatus, paid, debt] = await Promise.all([
    prisma.user.findMany({
      where: { role: "VERIFIER", isActive: true },
      select: {
        id: true,
        name: true,
        login: true,
        phone: true,
        companyName: true,
      },
      orderBy: [{ name: "asc" }, { login: "asc" }],
    }),
    prisma.verification.groupBy({
      by: ["agentId", "status"],
      where: via,
      _count: { _all: true },
    }),
    prisma.verification.groupBy({
      by: ["agentId"],
      where: { ...via, agentPaid: true },
      _sum: { agentFee: true },
    }),
    prisma.verification.groupBy({
      by: ["agentId"],
      where: agentDebtWhere(ownerId),
      _sum: { agentFee: true },
    }),
  ])
  return agents.map((a) => {
    const rows = byStatus.filter((r) => r.agentId === a.id)
    const count = (s?: string) => rows.filter((r) => !s || r.status === s).reduce((acc, r) => acc + r._count._all, 0)
    return {
      ...a,
      totalCount: count(),
      verifiedCount: count("VERIFIED"),
      activeCount: count("HANDED") + count("IN_PROGRESS"),
      paidSum: paid.find((p) => p.agentId === a.id)?._sum.agentFee ?? 0,
      debtSum: debt.find((p) => p.agentId === a.id)?._sum.agentFee ?? 0,
    }
  })
}

export async function getAgentOptions(ownerId: string): Promise<AgentOption[]> {
  const stats = await getAgentStats(ownerId)
  return stats.map((a) => ({
    id: a.id,
    name: a.name || a.login,
    phone: a.phone,
    companyName: a.companyName,
    activeCount: a.activeCount,
    verifiedCount: a.verifiedCount,
    debtSum: a.debtSum,
  }))
}
