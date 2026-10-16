"use server"

import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { hashPassword, requireAdmin } from "@/lib/auth"
import { fieldErrorsOf, type ActionResult } from "@/lib/validators/common"
import { createUserSchema, newPasswordSchema } from "@/lib/validators/user"

// Управление пользователями — только для администратора.

function refresh() {
  revalidatePath("/users")
}

export async function createUserAction(input: unknown): Promise<ActionResult<{ login: string }>> {
  await requireAdmin()
  const parsed = createUserSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Проверьте поля", fieldErrors: fieldErrorsOf(parsed.error) }
  const { login, password, role } = parsed.data

  if (await prisma.user.findUnique({ where: { login }, select: { id: true } })) {
    return { ok: false, error: "Такой логин уже занят", fieldErrors: { login: "Логин уже занят" } }
  }
  await prisma.user.create({ data: { login, role, passwordHash: await hashPassword(password) } })
  refresh()
  return { ok: true, data: { login } }
}

export async function resetUserPasswordAction(userId: string, password: unknown): Promise<ActionResult> {
  await requireAdmin()
  const parsed = newPasswordSchema.safeParse(password)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  // новая версия сессии — пользователя выкинет со всех устройств; Telegram тоже отвязываем,
  // чтобы бот не продолжал действовать от его имени
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(parsed.data),
      sessionVersion: { increment: 1 },
      telegramChatId: null,
      telegramLinkedAt: null,
      telegramState: Prisma.DbNull,
    },
  })
  refresh()
  return { ok: true, data: undefined }
}

export async function setUserActiveAction(userId: string, isActive: boolean): Promise<ActionResult> {
  const admin = await requireAdmin()
  if (userId === admin.id) return { ok: false, error: "Нельзя заблокировать самого себя" }
  const { count } = await prisma.user.updateMany({
    where: { id: userId, pendingApproval: false },
    data: { isActive, ...(isActive ? {} : { sessionVersion: { increment: 1 } }) },
  })
  if (count === 0) return { ok: false, error: "Сначала одобрите или отклоните заявку" }
  refresh()
  return { ok: true, data: undefined }
}

/** Удалить можно только пользователя без данных — иначе блокировка */
export async function deleteUserAction(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin()
  if (userId === admin.id) return { ok: false, error: "Нельзя удалить самого себя" }
  const [phones, verifications] = await Promise.all([
    prisma.phone.count({ where: { ownerId: userId } }),
    // и свои верификации, и телефоны, переданные ему как верификатору
    prisma.verification.count({ where: { OR: [{ ownerId: userId }, { agentId: userId }] } }),
  ])
  if (phones + verifications > 0) {
    return {
      ok: false,
      error: `У пользователя есть данные (телефонов: ${phones}, верификаций: ${verifications}). Заблокируйте его вместо удаления.`,
    }
  }
  await prisma.user.delete({ where: { id: userId } })
  refresh()
  return { ok: true, data: undefined }
}

/** Одобрить заявку верификатора — после этого он может войти и виден компаниям */
export async function approveUserAction(userId: string): Promise<ActionResult> {
  await requireAdmin()
  const { count } = await prisma.user.updateMany({
    where: { id: userId, pendingApproval: true },
    data: { pendingApproval: false, isActive: true },
  })
  if (count === 0) return { ok: false, error: "Заявка не найдена" }
  refresh()
  return { ok: true, data: undefined }
}

/** Отклонить заявку — аккаунт удаляется (данных у него ещё нет) */
export async function rejectUserAction(userId: string): Promise<ActionResult> {
  await requireAdmin()
  const { count } = await prisma.user.deleteMany({ where: { id: userId, pendingApproval: true } })
  if (count === 0) return { ok: false, error: "Заявка не найдена" }
  refresh()
  return { ok: true, data: undefined }
}
