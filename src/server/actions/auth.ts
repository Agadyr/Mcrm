"use server"

import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
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
import { blockedMinutes, getClientIp, hitLimit, resetLimit, type Limit } from "@/server/rate-limit"
import { changePasswordSchema, loginSchema } from "@/lib/validators/auth"
import { verifierSignupSchema } from "@/lib/validators/user"
import { fieldErrorsOf, type ActionResult } from "@/lib/validators/common"

// Подбор пароля: 5 неверных попыток с одного IP для одного логина — пара закрыта на 15 минут.
// Блокируем пару, а не весь аккаунт: иначе кто угодно мог бы закрыть вход владельцу.
const LOGIN_LIMIT: Limit = { max: 5, windowMs: 15 * 60_000, blockMs: 15 * 60_000 }
// Самостоятельная регистрация верификатора: не больше 3 заявок в час с одного IP
const SIGNUP_LIMIT: Limit = { max: 3, windowMs: 60 * 60_000, blockMs: 60 * 60_000 }

// Хэш случайного пароля: для неизвестного логина тоже сверяем пароль, чтобы по времени ответа
// нельзя было понять, существует ли логин
const DUMMY_HASH = "$2b$10$1Ksh1S9i4qB5EAV/pk8ziOKm/0qMg64BOm/Did9YVFIuEPfwA.LFe"
const INVALID_CREDENTIALS = "Неверный логин или пароль"

export async function loginAction(input: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Проверьте поля", fieldErrors: fieldErrorsOf(parsed.error) }

  const key = `login:${await getClientIp()}:${parsed.data.login}`
  const minutes = await blockedMinutes(key)
  if (minutes > 0) return { ok: false, error: `Слишком много неверных попыток. Попробуйте через ${minutes} мин.` }

  // ответы одинаковые для несуществующего логина и неверного пароля
  const user = await prisma.user.findUnique({ where: { login: parsed.data.login } })
  const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH)
  if (!user || !valid) {
    if (await hitLimit(key, LOGIN_LIMIT)) {
      return { ok: false, error: `Слишком много неверных попыток. Вход закрыт на ${LOGIN_LIMIT.blockMs / 60_000} мин.` }
    }
    return { ok: false, error: INVALID_CREDENTIALS }
  }
  await resetLimit(key)
  if (user.pendingApproval) {
    return { ok: false, error: "Заявка ещё на рассмотрении. Войти можно будет после одобрения администратором." }
  }
  if (!user.isActive) return { ok: false, error: "Доступ заблокирован. Обратитесь к администратору." }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await startSession(user)
  return { ok: true, data: undefined }
}

export async function logoutAction() {
  await endSession()
  redirect("/login")
}

/** Выйти на всех устройствах: новая версия сессии делает недействительными все токены, включая текущий */
export async function logoutEverywhereAction() {
  const user = await requireUser()
  await prisma.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } })
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
  // Telegram тоже отвязываем: чат мог остаться у того, от кого меняют пароль.
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.newPassword),
      sessionVersion: { increment: 1 },
      telegramChatId: null,
      telegramLinkedAt: null,
      telegramState: Prisma.DbNull,
    },
  })
  await startSession(updated)
  revalidatePath("/", "layout") // отвязанный Telegram
  return { ok: true, data: undefined }
}

/** Верификатор регистрируется сам. Аккаунт неактивен, пока администратор не одобрит заявку. */
export async function registerVerifierAction(input: unknown): Promise<ActionResult> {
  const parsed = verifierSignupSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Проверьте поля", fieldErrors: fieldErrorsOf(parsed.error) }
  const { name, phone, login, password, website } = parsed.data
  if (website) return { ok: true, data: undefined } // бот заполнил скрытое поле — молча игнорируем

  const limitKey = `signup:${await getClientIp()}`
  const minutes = await blockedMinutes(limitKey)
  if (minutes > 0) return { ok: false, error: `Слишком много заявок. Попробуйте через ${minutes} мин.` }

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
  await hitLimit(limitKey, SIGNUP_LIMIT)
  after(() => notifyNewSignup(created.id))
  return { ok: true, data: undefined }
}
