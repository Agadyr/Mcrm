import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db"
import { addDays, todayDate } from "@/lib/dates"
import { sendTelegram } from "@/lib/telegram"
import { GET } from "@/app/api/reminders/morning/route"
import { setMorningReminderAction } from "@/server/actions/telegram"
import { sendMorningReminders } from "@/server/reminders"
import { createPhone, createUser, loginAs, makeImei } from "../support/factories"

// Утреннее напоминание: sendTelegram подменён (integration-setup), проверяем, кому и что «отправили».

const send = vi.mocked(sendTelegram)

beforeEach(() => {
  send.mockReset()
  send.mockResolvedValue(true)
  vi.stubEnv("APP_URL", "https://crm.example.kz")
  vi.stubEnv("CRON_SECRET", "cron-secret")
})
afterEach(() => vi.unstubAllEnvs())

const linked = (data: Parameters<typeof createUser>[0] = {}) =>
  createUser({ telegramChatId: String(Math.floor(Math.random() * 1e9)), telegramLinkedAt: new Date(), ...data })

/** Продажа в долг: цена 500 000, оплачено paid, срок — due дней от сегодня */
async function debtSale(ownerId: string, paid: number, dueInDays: number) {
  const phone = await createPhone(ownerId, { status: "SOLD" })
  return prisma.sale.create({
    data: {
      phoneId: phone.id,
      salePrice: 500_000,
      paidAmount: paid,
      soldAt: addDays(todayDate(), -30),
      paymentMethod: "DEBT",
      buyerName: "Ержан",
      dueDate: addDays(todayDate(), dueInDays),
    },
  })
}

/** Верификация, переданная days дней назад */
function verification(ownerId: string, days: number, status: "HANDED" | "IN_PROGRESS" | "VERIFIED" = "HANDED") {
  return prisma.verification.create({
    data: { ownerId, phoneModel: "iPhone 13", imei1: makeImei(), handedAt: addDays(todayDate(), -days), status },
  })
}

describe("утреннее напоминание", () => {
  it("просроченные долги и долгие верификации — одно сообщение с кнопками", async () => {
    const user = await linked()
    await debtSale(user.id, 100_000, -3) // просрочен: долг 400 000
    await debtSale(user.id, 450_000, -1) // просрочен: долг 50 000
    await debtSale(user.id, 0, 5) // срок не наступил
    await verification(user.id, 20)
    await verification(user.id, 14, "IN_PROGRESS")
    await verification(user.id, 13) // ещё не долго
    await verification(user.id, 30, "VERIFIED") // уже закончена

    const results = await sendMorningReminders()
    expect(results).toEqual([{ userId: user.id, sent: true }])
    expect(send).toHaveBeenCalledTimes(1)
    const [chatId, html, links] = send.mock.calls[0]
    expect(chatId).toBe(user.telegramChatId)
    expect(html).toContain("Просроченные долги: <b>2</b> на <b>450 000 ₸</b>")
    expect(html).toContain("дольше 14 дней: <b>2</b>")
    expect(links).toEqual([
      { url: "https://crm.example.kz/sales?state=overdue", text: "Просроченные долги" },
      { url: "https://crm.example.kz/verifications?status=active", text: "Верификации в работе" },
    ])
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(fresh.lastReminderAt).not.toBeNull()
  })

  it("не о чем напоминать — не пишем", async () => {
    const user = await linked()
    await debtSale(user.id, 0, 2)
    await verification(user.id, 3)
    expect(await sendMorningReminders()).toEqual([{ userId: user.id, sent: false, reason: "nothing" }])
    expect(send).not.toHaveBeenCalled()
  })

  it("второй запуск в тот же день ничего не отправляет, на следующий день — снова", async () => {
    const user = await linked()
    await debtSale(user.id, 0, -1)
    await sendMorningReminders()
    await sendMorningReminders()
    expect(send).toHaveBeenCalledTimes(1)

    // вчерашнее напоминание не мешает сегодняшнему
    await prisma.user.update({ where: { id: user.id }, data: { lastReminderAt: addDays(new Date(), -1) } })
    await sendMorningReminders()
    expect(send).toHaveBeenCalledTimes(2)
  })

  it("одновременные запуски не отправляют дважды", async () => {
    const user = await linked()
    await debtSale(user.id, 0, -1)
    await Promise.all([sendMorningReminders(), sendMorningReminders()])
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("не дошло — день не засчитан, следующий запуск попробует снова", async () => {
    const user = await linked()
    await debtSale(user.id, 0, -1)
    send.mockResolvedValueOnce(false)
    expect((await sendMorningReminders())[0]).toMatchObject({ sent: false, reason: "failed" })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).lastReminderAt).toBeNull()
    expect((await sendMorningReminders())[0]).toMatchObject({ sent: true })
  })

  it("без Telegram, выключенное, верификаторам и заблокированным — не отправляем", async () => {
    const noTelegram = await createUser()
    const off = await linked({ morningReminder: false })
    const verifier = await linked({ role: "VERIFIER" })
    const blocked = await linked({ isActive: false })
    for (const u of [noTelegram, off, verifier, blocked]) {
      await debtSale(u.id, 0, -1)
      await verification(u.id, 20)
    }
    expect(await sendMorningReminders()).toEqual([])
    expect(send).not.toHaveBeenCalled()
  })

  it("переключатель в профиле выключает напоминание", async () => {
    const user = await linked()
    await loginAs(user)
    expect((await setMorningReminderAction(false)).ok).toBe(true)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).morningReminder).toBe(false)
    expect((await setMorningReminderAction(true)).ok).toBe(true)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).morningReminder).toBe(true)
  })
})

describe("GET /api/reminders/morning", () => {
  const req = (auth?: string) =>
    new NextRequest("http://localhost/api/reminders/morning", { headers: auth ? { authorization: auth } : {} })

  it("без верного секрета — 401 и ничего не отправляет", async () => {
    const user = await linked()
    await debtSale(user.id, 0, -1)
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req("Bearer wrong"))).status).toBe(401)
    vi.stubEnv("CRON_SECRET", "")
    expect((await GET(req("Bearer "))).status).toBe(401)
    expect(send).not.toHaveBeenCalled()
  })

  it("с секретом — рассылает и возвращает итог", async () => {
    const user = await linked()
    await debtSale(user.id, 0, -1)
    const res = await GET(req("Bearer cron-secret"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, users: 1, sent: 1, failed: 0 })
  })
})
