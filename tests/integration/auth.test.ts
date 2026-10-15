import { describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { SESSION_COOKIE } from "@/lib/session"
import { changePasswordAction, loginAction, registerVerifierAction } from "@/server/actions/auth"
import { createUser, loginAs } from "../support/factories"
import { cookieJar } from "../support/next-mocks"

describe("loginAction", () => {
  it("верный пароль — сессия в cookie, логин без учёта регистра", async () => {
    const user = await createUser({ login: "shop", password: "secret123" })
    expect(await loginAction({ login: " SHOP ", password: "secret123" })).toEqual({ ok: true, data: undefined })
    expect(cookieJar.get(SESSION_COOKIE)).toBeTruthy()
    expect((await getCurrentUser())?.id).toBe(user.id)
  })

  it("после 5 неверных паролей вход закрыт, даже с верным", async () => {
    await createUser({ login: "shop", password: "secret123" })
    for (let i = 1; i <= 4; i++) {
      expect((await loginAction({ login: "shop", password: "wrong" })).ok).toBe(false)
    }
    expect(await loginAction({ login: "shop", password: "wrong" })).toMatchObject({ error: expect.stringContaining("закрыт на 15 мин") })
    expect(await loginAction({ login: "shop", password: "secret123" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("Слишком много неверных попыток"),
    })
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false)
  })

  it("заблокированный и ожидающий одобрения не входят", async () => {
    await createUser({ login: "blocked", isActive: false })
    await createUser({ login: "pending", pendingApproval: true, isActive: false, role: "VERIFIER" })
    expect(await loginAction({ login: "blocked", password: "secret123" })).toMatchObject({ error: expect.stringContaining("заблокирован") })
    expect(await loginAction({ login: "pending", password: "secret123" })).toMatchObject({ error: expect.stringContaining("рассмотрении") })
  })

  it("неизвестный логин — общая ошибка", async () => {
    expect(await loginAction({ login: "nobody", password: "x" })).toEqual({ ok: false, error: "Неверный логин или пароль" })
  })
})

describe("сессии", () => {
  it("смена пароля выкидывает старые сессии", async () => {
    const user = await createUser({ password: "secret123" })
    await loginAs(user)
    const oldToken = cookieJar.get(SESSION_COOKIE)!
    const r = await changePasswordAction({ currentPassword: "secret123", newPassword: "newpass1", confirmPassword: "newpass1" })
    expect(r.ok).toBe(true)
    expect((await getCurrentUser())?.id).toBe(user.id) // новый токен у текущего устройства

    cookieJar.set(SESSION_COOKIE, oldToken)
    expect(await getCurrentUser()).toBeNull()
  })

  it("блокировка пользователя сразу закрывает доступ", async () => {
    const user = await createUser()
    await loginAs(user)
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } })
    expect(await getCurrentUser()).toBeNull()
  })

  it("поддельный токен не принимается", async () => {
    cookieJar.set(SESSION_COOKIE, "eyJhbGciOiJIUzI1NiJ9.e30.invalid")
    expect(await getCurrentUser()).toBeNull()
  })
})

describe("registerVerifierAction", () => {
  const form = { name: "Айдос", phone: "+7 701 111 22 33", login: "aidos", password: "secret123", confirmPassword: "secret123" }

  it("создаёт неактивного верификатора, ждущего одобрения", async () => {
    expect((await registerVerifierAction(form)).ok).toBe(true)
    const u = await prisma.user.findUniqueOrThrow({ where: { login: "aidos" } })
    expect(u).toMatchObject({ role: "VERIFIER", isActive: false, pendingApproval: true })
  })

  it("занятый логин", async () => {
    await createUser({ login: "aidos" })
    expect(await registerVerifierAction(form)).toMatchObject({ ok: false, fieldErrors: { login: expect.any(String) } })
  })

  it("бот (заполнил скрытое поле) молча игнорируется", async () => {
    expect((await registerVerifierAction({ ...form, website: "spam" })).ok).toBe(true)
    expect(await prisma.user.count()).toBe(0)
  })
})
