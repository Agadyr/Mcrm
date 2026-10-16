import { describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { SESSION_COOKIE } from "@/lib/session"
import { changePasswordAction, loginAction, logoutEverywhereAction, registerVerifierAction } from "@/server/actions/auth"
import { createUser, loginAs } from "../support/factories"
import { cookieJar, headerJar } from "../support/next-mocks"

describe("loginAction", () => {
  it("верный пароль — сессия в cookie, логин без учёта регистра", async () => {
    const user = await createUser({ login: "shop", password: "secret123" })
    expect(await loginAction({ login: " SHOP ", password: "secret123" })).toEqual({ ok: true, data: undefined })
    expect(cookieJar.get(SESSION_COOKIE)).toBeTruthy()
    expect((await getCurrentUser())?.id).toBe(user.id)
  })

  it("после 5 неверных паролей пара IP + логин закрыта, даже с верным паролем", async () => {
    await createUser({ login: "shop", password: "secret123" })
    headerJar.set("x-forwarded-for", "1.1.1.1")
    for (let i = 1; i <= 4; i++) {
      // без подсказки «осталось попыток»: ответ как для несуществующего логина
      expect(await loginAction({ login: "shop", password: "wrong" })).toEqual({ ok: false, error: "Неверный логин или пароль" })
    }
    expect(await loginAction({ login: "shop", password: "wrong" })).toMatchObject({ error: expect.stringContaining("закрыт на 15 мин") })
    expect(await loginAction({ login: "shop", password: "secret123" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("Слишком много неверных попыток"),
    })
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false)

    // владелец с другого адреса входит — злоумышленник не может закрыть ему вход
    headerJar.set("x-forwarded-for", "2.2.2.2")
    expect((await loginAction({ login: "shop", password: "secret123" })).ok).toBe(true)
    // аккаунт целиком не блокируется
    expect(await prisma.user.findUniqueOrThrow({ where: { login: "shop" } })).toMatchObject({ failedLogins: 0, lockedUntil: null })
  })

  it("несуществующий логин: те же ответы и та же блокировка, что и для существующего", async () => {
    headerJar.set("x-real-ip", "3.3.3.3")
    for (let i = 1; i <= 4; i++) {
      expect(await loginAction({ login: "nobody", password: "x" })).toEqual({ ok: false, error: "Неверный логин или пароль" })
    }
    expect(await loginAction({ login: "nobody", password: "x" })).toMatchObject({ error: expect.stringContaining("закрыт на 15 мин") })
  })

  it("успешный вход сбрасывает счётчик, блокировка истекает", async () => {
    await createUser({ login: "shop", password: "secret123" })
    for (let i = 1; i <= 4; i++) await loginAction({ login: "shop", password: "wrong" })
    expect((await loginAction({ login: "shop", password: "secret123" })).ok).toBe(true)
    for (let i = 1; i <= 4; i++) {
      expect(await loginAction({ login: "shop", password: "wrong" })).toEqual({ ok: false, error: "Неверный логин или пароль" })
    }
    await loginAction({ login: "shop", password: "wrong" }) // пятая — блокировка
    await prisma.rateLimit.updateMany({ data: { blockedUntil: new Date(Date.now() - 1000) } })
    expect((await loginAction({ login: "shop", password: "secret123" })).ok).toBe(true)
  })

  it("заблокированный и ожидающий одобрения не входят", async () => {
    await createUser({ login: "blocked", isActive: false })
    await createUser({ login: "pending", pendingApproval: true, isActive: false, role: "VERIFIER" })
    expect(await loginAction({ login: "blocked", password: "secret123" })).toMatchObject({ error: expect.stringContaining("заблокирован") })
    expect(await loginAction({ login: "pending", password: "secret123" })).toMatchObject({ error: expect.stringContaining("рассмотрении") })
  })

  it("неизвестный логин и неверный пароль — одинаковая ошибка", async () => {
    await createUser({ login: "shop", password: "secret123" })
    const unknown = await loginAction({ login: "nobody", password: "x" })
    expect(unknown).toEqual({ ok: false, error: "Неверный логин или пароль" })
    expect(await loginAction({ login: "shop", password: "x" })).toEqual(unknown)
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

  it("смена пароля отвязывает Telegram", async () => {
    const user = await createUser({ password: "secret123", telegramChatId: "777", telegramLinkedAt: new Date(), telegramState: { step: "x" } })
    await loginAs(user)
    expect((await changePasswordAction({ currentPassword: "secret123", newPassword: "newpass12", confirmPassword: "newpass12" })).ok).toBe(true)
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(u).toMatchObject({ telegramChatId: null, telegramLinkedAt: null, telegramState: null })
  })

  it("новый пароль короче 8 символов не принимается", async () => {
    const user = await createUser({ password: "secret123" })
    await loginAs(user)
    expect(await changePasswordAction({ currentPassword: "secret123", newPassword: "short12", confirmPassword: "short12" })).toMatchObject({
      ok: false,
      fieldErrors: { newPassword: expect.any(String) },
    })
  })

  it("выход на всех устройствах: старые токены, включая текущий, недействительны", async () => {
    const user = await createUser()
    await loginAs(user)
    const token = cookieJar.get(SESSION_COOKIE)!
    await expect(logoutEverywhereAction()).rejects.toMatchObject({ url: "/login" })
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false)
    cookieJar.set(SESSION_COOKIE, token)
    expect(await getCurrentUser()).toBeNull()
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion).toBe(user.sessionVersion + 1)
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

  it("не больше 3 заявок в час с одного IP", async () => {
    headerJar.set("x-forwarded-for", "5.5.5.5")
    for (const login of ["aidos1", "aidos2", "aidos3"]) {
      expect((await registerVerifierAction({ ...form, login })).ok).toBe(true)
    }
    expect(await registerVerifierAction({ ...form, login: "aidos4" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("Слишком много заявок"),
    })
    headerJar.set("x-forwarded-for", "6.6.6.6")
    expect((await registerVerifierAction({ ...form, login: "aidos5" })).ok).toBe(true)
    expect(await prisma.user.count()).toBe(4)
  })

  it("бот (заполнил скрытое поле) молча игнорируется", async () => {
    expect((await registerVerifierAction({ ...form, website: "spam" })).ok).toBe(true)
    expect(await prisma.user.count()).toBe(0)
  })
})
