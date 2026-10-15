import "server-only"
import { AsyncLocalStorage } from "node:async_hooks"
import type { Prisma } from "@prisma/client"
import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession } from "@/lib/session"

export const hashPassword = (password: string) => bcrypt.hash(password, 10)
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash)

const USER_SELECT = {
  id: true,
  login: true,
  role: true,
  isActive: true,
  name: true,
  companyName: true,
  phone: true,
  telegramChatId: true,
  sessionVersion: true,
} as const

type SessionUser = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>

/** Пользователь по cookie: проверяет подпись токена и версию сессии в базе */
const getCookieUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies()
  const session = await verifySession(store.get(SESSION_COOKIE)?.value)
  if (!session) return null
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: USER_SELECT })
  if (!user || !user.isActive || user.sessionVersion !== session.v) return null
  return user
})

// Telegram-бот действует от имени пользователя, чей чат привязан: те же server actions, те же проверки,
// только пользователь берётся не из cookie, а из привязки чата. Задаётся только на сервере (runAsUser).
const actingUser = new AsyncLocalStorage<SessionUser>()

/** Выполнить fn от имени пользователя (для Telegram-бота). Заблокированный — не выполняется. */
export async function runAsUser<T>(userId: string, fn: () => Promise<T>): Promise<T | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT })
  if (!user || !user.isActive) return null
  return actingUser.run(user, fn)
}

/** Текущий пользователь или null */
export async function getCurrentUser(): Promise<SessionUser | null> {
  return actingUser.getStore() ?? getCookieUser()
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>

/** Профиль заполнен: имя, телефон и (кроме верификатора) компания */
export function isProfileComplete(u: Pick<CurrentUser, "name" | "companyName" | "phone" | "role">) {
  return !!(u.name && u.phone && (u.companyName || u.role === "VERIFIER"))
}

/** Для страниц и server actions: без входа — на страницу логина. */
export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return user
}

/** Только для администратора (управление пользователями) */
export async function requireAdmin() {
  const user = await requireUser()
  if (user.role !== "ADMIN") redirect("/")
  return user
}

export async function startSession(user: { id: string; login: string; sessionVersion: number }) {
  const token = await signSession({ sub: user.id, login: user.login, v: user.sessionVersion })
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  })
}

export async function endSession() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}
