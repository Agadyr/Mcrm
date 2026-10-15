import type { Prisma } from "@prisma/client"

// Кто что видит.
// Телефон: владелец + верификатор, которому телефон передан на верификацию.
// Верификация: владелец телефона + верификатор (agentId).
// «Ведущий» верификации — тот, кто работает с человеком: верификатор, если передано ему, иначе владелец.

export function phoneAccessWhere(userId: string): Prisma.PhoneWhereInput {
  return { OR: [{ ownerId: userId }, { verifications: { some: { agentId: userId } } }] }
}

export function verificationAccessWhere(userId: string): Prisma.VerificationWhereInput {
  return { OR: [{ ownerId: userId }, { agentId: userId }] }
}

export function handlerOf(v: { ownerId: string; agentId: string | null }) {
  return v.agentId ?? v.ownerId
}

/** Видит ли пользователь человека (ФИО, телефон, страну, оплату ему) */
export function canSeeTraveler(v: { ownerId: string; agentId: string | null }, userId: string) {
  return handlerOf(v) === userId
}

export function displayName(u: { name: string | null; login: string; companyName?: string | null }) {
  return u.name || u.login
}
