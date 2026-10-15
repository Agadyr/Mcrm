"use server"

import { redirect } from "next/navigation"
import { after } from "next/server"
import { notifyNewSignup } from "@/server/notify"
import { prisma } from "@/lib/db"
import {
  endSession,
  hashPassword,
  requireUser,
  startSession,
  verifyPassword,
} from "@/lib/auth"
import { changePasswordSchema, loginSchema } from "@/lib/validators/auth"
import { verifierSignupSchema } from "@/lib/validators/user"
import { fieldErrorsOf, type ActionResult } from "@/lib/validators/common"

const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 15

export async function loginAction(input: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Проверьте поля", fieldErrors: fieldErrorsOf(parsed.error) }

  const user = await prisma.user.findUnique({ where: { login: parsed.data.login } })

  // защита от подбора пароля: после MAX_ATTEMPTS ошибок подряд вход закрыт на LOCK_MINUTES
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000)
    return { ok: false, error: `Слишком много неверных попыток. Попробуйте через ${minutes} мин.` }
  }

  const valid = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false
  if (!user || !valid) {
    if (user) {
      const failed = user.failedLogins + 1
      const lock = failed >= MAX_ATTEMPTS
      await prisma.user.update({
        where: { id: user.id },
        data: lock
          ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
          : { failedLogins: failed },
      })
      if (lock) return { ok: false, error: `Слишком много неверных попыток. Вход закрыт на ${LOCK_MINUTES} мин.` }
      const left = MAX_ATTEMPTS - failed
      if (left <= 2) return { ok: false, error: `Неверный логин или пароль. Осталось попыток: ${left}` }
    }
    return { ok: false, error: "Неверный логин или пароль" }
  }
  if (user.pendingApproval) {
    return { ok: false, error: "Заявка ещё на рассмотрении. Войти можно будет после одобрения администратором." }
  }
  if (!user.isActive) return { ok: false, error: "Доступ заблокирован. Обратитесь к администратору." }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null },
  })
  await startSession(user)
  return { ok: true, data: undefined }
}

export async function logoutAction() {
  await endSession()
  redirect("/login")
}

export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  const current = await requireUser()
  const parsed = changePasswordSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Проверьте поля", fieldErrors: fieldErrorsOf(parsed.error) }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: current.id } })
  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return { ok: false, error: "Текущий пароль неверный", fieldErrors: { currentPassword: "Неверный пароль" } }
  }

  // Новая версия сессии выкидывает все остальные устройства; текущему выдаём новый токен.
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.newPassword),
      sessionVersion: { increment: 1 },
    },
  })
  await startSession(updated)
  return { ok: true, data: undefined }
}

/** Верификатор регистрируется сам. Аккаунт неактивен, пока администратор не одобрит заявку. */
export async function registerVerifierAction(input: unknown): Promise<ActionResult> {
  const parsed = verifierSignupSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Проверьте поля", fieldErrors: fieldErrorsOf(parsed.error) }
  const { name, phone, login, password, website } = parsed.data
  if (website) return { ok: true, data: undefined } // бот заполнил скрытое поле — молча игнорируем

  if (await prisma.user.findUnique({ where: { login }, select: { id: true } })) {
    return { ok: false, error: "Такой логин уже занят", fieldErrors: { login: "Логин уже занят — придумайте другой" } }
  }
  const created = await prisma.user.create({
    data: {
      login,
      name,
      phone,
      role: "VERIFIER",
      isActive: false,
      pendingApproval: true,
      passwordHash: await hashPassword(password),
    },
  })
  after(() => notifyNewSignup(created.id))
  return { ok: true, data: undefined }
}
