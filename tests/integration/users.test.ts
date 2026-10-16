import { describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import {
  approveUserAction,
  createUserAction,
  deleteUserAction,
  rejectUserAction,
  resetUserPasswordAction,
  setUserActiveAction,
} from "@/server/actions/users"
import { loginAction } from "@/server/actions/auth"
import { createPhone, createUser, loginAs } from "../support/factories"
import { RedirectError } from "../support/next-mocks"

async function admin() {
  const a = await createUser({ role: "ADMIN" })
  await loginAs(a)
  return a
}

describe("управление пользователями", () => {
  it("обычный пользователь не может ничего — перенаправление на главную", async () => {
    const user = await createUser()
    await loginAs(user)
    await expect(createUserAction({ login: "hacker", password: "secret12", role: "ADMIN" })).rejects.toMatchObject({ url: "/" })
    await expect(setUserActiveAction(user.id, false)).rejects.toBeInstanceOf(RedirectError)
    expect(await prisma.user.count({ where: { role: "ADMIN" } })).toBe(0)
  })

  it("администратор создаёт пользователя, логин занят — ошибка", async () => {
    await admin()
    expect(await createUserAction({ login: "Shop2", password: "secret12", role: "USER" })).toEqual({ ok: true, data: { login: "shop2" } })
    expect(await createUserAction({ login: "shop2", password: "secret12", role: "USER" })).toMatchObject({ ok: false })
    expect((await loginAction({ login: "shop2", password: "secret12" })).ok).toBe(true)
  })

  it("блокировка сразу выкидывает пользователя, себя заблокировать нельзя", async () => {
    const a = await admin()
    const user = await createUser()
    expect((await setUserActiveAction(user.id, false)).ok).toBe(true)
    expect(await setUserActiveAction(a.id, false)).toMatchObject({ ok: false })

    await loginAs(user) // токен со старой версией сессии
    expect(await getCurrentUser()).toBeNull()
  })

  it("сброс пароля: минимум 8 символов, выкидывает сессии и отвязывает Telegram", async () => {
    await admin()
    const user = await createUser({ login: "reset", telegramChatId: "777", telegramLinkedAt: new Date(), telegramState: { step: "x" } })
    expect(await resetUserPasswordAction(user.id, "1234567")).toMatchObject({ ok: false })
    expect((await resetUserPasswordAction(user.id, "newpass1")).ok).toBe(true)
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(u).toMatchObject({ telegramChatId: null, telegramLinkedAt: null, telegramState: null, sessionVersion: user.sessionVersion + 1 })
    expect((await loginAction({ login: "reset", password: "newpass1" })).ok).toBe(true)
  })

  it("пользователя с данными удалить нельзя", async () => {
    await admin()
    const user = await createUser()
    await createPhone(user.id)
    expect(await deleteUserAction(user.id)).toMatchObject({ ok: false, error: expect.stringContaining("телефонов: 1") })
    const empty = await createUser()
    expect((await deleteUserAction(empty.id)).ok).toBe(true)
  })

  it("заявки верификаторов: одобрить или отклонить", async () => {
    await admin()
    const a = await createUser({ role: "VERIFIER", pendingApproval: true, isActive: false })
    const b = await createUser({ role: "VERIFIER", pendingApproval: true, isActive: false })
    // пока заявка не рассмотрена, блокировка/разблокировка не работает
    expect(await setUserActiveAction(a.id, true)).toMatchObject({ ok: false })

    expect((await approveUserAction(a.id)).ok).toBe(true)
    expect(await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ isActive: true, pendingApproval: false })
    expect(await approveUserAction(a.id)).toMatchObject({ ok: false })

    expect((await rejectUserAction(b.id)).ok).toBe(true)
    expect(await prisma.user.findUnique({ where: { id: b.id } })).toBeNull()
  })
})
