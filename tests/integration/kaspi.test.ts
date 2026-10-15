import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db"
import { decryptSecret } from "@/lib/secret-box"
import { connectKaspiAction, disconnectKaspiAction, recheckKaspiAction } from "@/server/actions/kaspi"
import { createUser, loginAs } from "../support/factories"

// Kaspi подменён: «правильный» токен — GOOD, на остальные Kaspi отвечает 401
const GOOD = "kaspi-good-token-0123456789abcdef"
let kaspiDown = false
let lastHeaders: Record<string, string> = {}

beforeEach(() => {
  kaspiDown = false
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
      lastHeaders = init.headers
      if (kaspiDown) throw new Error("network")
      expect(url).toContain("/orders?")
      return new Response("{}", { status: init.headers["X-Auth-Token"] === GOOD ? 200 : 401 })
    })
  )
})
afterEach(() => vi.unstubAllGlobals())

describe("Kaspi магазин", () => {
  it("подключение: токен проверяется у Kaspi и хранится зашифрованным", async () => {
    const user = await createUser()
    await loginAs(user)
    expect(await connectKaspiAction({ token: `  ${GOOD}\n`, shopName: "Gold Service" })).toEqual({ ok: true, data: undefined })
    expect(lastHeaders["X-Auth-Token"]).toBe(GOOD) // пробелы и перенос строки убраны

    const shop = await prisma.kaspiShop.findUniqueOrThrow({ where: { ownerId: user.id } })
    expect(shop).toMatchObject({ shopName: "Gold Service", tokenHint: "cdef", status: "ACTIVE" })
    expect(shop.tokenEnc).not.toContain(GOOD)
    expect(decryptSecret(shop.tokenEnc)).toBe(GOOD)
  })

  it("неверный токен не сохраняется, ошибка — у поля", async () => {
    const user = await createUser()
    await loginAs(user)
    const r = await connectKaspiAction({ token: "wrong-token-0123456789abcdef" })
    expect(r).toMatchObject({ ok: false, fieldErrors: { token: expect.stringContaining("не принял") } })
    expect(await connectKaspiAction({ token: "short" })).toMatchObject({ ok: false, fieldErrors: { token: expect.any(String) } })
    expect(await prisma.kaspiShop.count()).toBe(0)
  })

  it("проверка связи: Kaspi недоступен — статус не портим; отключение удаляет токен", async () => {
    const user = await createUser()
    await loginAs(user)
    await connectKaspiAction({ token: GOOD })
    kaspiDown = true
    expect(await recheckKaspiAction()).toMatchObject({ ok: true, data: { ok: false } })
    expect((await prisma.kaspiShop.findUniqueOrThrow({ where: { ownerId: user.id } })).status).toBe("ACTIVE")

    await disconnectKaspiAction()
    expect(await prisma.kaspiShop.count()).toBe(0)
  })

  it("верификатору подключение недоступно", async () => {
    await loginAs(await createUser({ role: "VERIFIER" }))
    expect(await connectKaspiAction({ token: GOOD })).toMatchObject({ ok: false })
  })
})
