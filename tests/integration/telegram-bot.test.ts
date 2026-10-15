import { after } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db"
import { handleUpdate } from "@/server/telegram-bot"
import { createPhone, createUser, makeImei } from "../support/factories"

// Бот целиком: сообщения и нажатия кнопок → записи в базе. Telegram подменён: запоминаем, что бот отправил.

const CHAT = 100
type Sent = { method: string; body: Record<string, unknown> }
let sent: Sent[] = []
let seq = 0

beforeEach(() => {
  sent = []
  vi.mocked(after).mockClear()
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token")
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      const method = url.split("/").pop()!
      sent.push({ method, body: JSON.parse(init.body) })
      return new Response(JSON.stringify({ ok: true, result: method === "getUpdates" ? [] : true }))
    })
  )
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const say = (text: string, chat = CHAT) => handleUpdate({ update_id: ++seq, message: { message_id: seq, text, chat: { id: chat, type: "private" } } })
const press = (data: string, chat = CHAT) =>
  handleUpdate({ update_id: ++seq, callback_query: { id: String(seq), data, message: { message_id: seq, text: "вопрос", chat: { id: chat, type: "private" } } } })

/** Текст последнего сообщения бота */
const last = () => String([...sent].reverse().find((s) => s.method === "sendMessage")?.body.text ?? "")
/** Все кнопки последнего сообщения: [текст, data] */
const buttons = () => {
  const markup = [...sent].reverse().find((s) => s.method === "sendMessage")?.body.reply_markup as
    | { inline_keyboard?: { text: string; callback_data?: string }[][] }
    | undefined
  return (markup?.inline_keyboard ?? []).flat().map((b) => [b.text, b.callback_data] as const)
}

const company = () => createUser({ telegramChatId: String(CHAT), telegramLinkedAt: new Date(), companyName: "Gold Service" })

describe("telegram-бот", () => {
  it("неподключённый чат — подсказка подключить в профиле; /start с кодом — привязка", async () => {
    await say("привет")
    expect(last()).toContain("не подключён")

    const user = await createUser({ telegramLinkCode: "code-1234567890" })
    await say("/start code-1234567890")
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(fresh.telegramChatId).toBe(String(CHAT))
    expect(fresh.telegramLinkCode).toBeNull()
    expect(last()).toContain("это бот вашей CRM")
  })

  it("верификатору — только уведомления", async () => {
    await createUser({ role: "VERIFIER", telegramChatId: String(CHAT) })
    await say("💰 Продать")
    expect(last()).toContain("для компаний")
  })

  it("➕ новый телефон одним сообщением: всё распознано — сразу проверка и сохранение", async () => {
    const user = await company()
    const [i1, i2] = [makeImei(), makeImei()]
    await say("➕ Новый телефон")
    await say(`iPhone 15 Pro 256\n${i1}\n${i2}\nf2lxk1q9p3\n450к`)
    expect(last()).toContain("Распознал: модель, IMEI1, IMEI2, S/N, память, цена")
    expect(last()).toContain("Проверьте и сохраните")
    await press("ok")
    expect(last()).toContain("Телефон добавлен")

    const phone = await prisma.phone.findFirstOrThrow({ where: { ownerId: user.id }, include: { events: true } })
    expect(phone).toMatchObject({ model: "iPhone 15 Pro", imei1: i1, imei2: i2, serialNumber: "F2LXK1Q9P3", memoryGb: 256, purchasePrice: 450_000, condition: "NEW", status: "IN_STOCK" })
    expect(phone.events.map((e) => e.type)).toContain("CREATED")
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).telegramState).toBeNull()
  })

  it("➕ только S/N и IMEI с подписями — бот спрашивает модель и цену; поставщик и исправление на экране проверки", async () => {
    const user = await company()
    const [i1, i2] = [makeImei(), makeImei()]
    await say("➕ Новый телефон")
    await say(`S/N: abc12345xy\nIMEI 2: ${i2}\nIMEI1: ${i1}`)
    expect(last()).toContain("Какая модель?")
    await say("iPhone 14")
    expect(last()).toContain("Цена закупки")
    await say("300000")
    expect(last()).toContain("Проверьте и сохраните")
    await press("e:supplier")
    await say("Алмас")
    expect(last()).toContain("Поставщик: Алмас")
    await say("320к") // исправление цены сообщением
    expect(last()).toContain("320 000 ₸")
    await press("e:cond")
    await press("ok")

    const phone = await prisma.phone.findFirstOrThrow({ where: { ownerId: user.id } })
    expect(phone).toMatchObject({ model: "iPhone 14", imei1: i1, imei2: i2, serialNumber: "ABC12345XY", purchasePrice: 320_000, supplier: "Алмас", condition: "USED" })
  })

  it("➕ по шагам вручную: каждое поле отдельно", async () => {
    const user = await company()
    const [i1, i2] = [makeImei(), makeImei()]
    await say("➕ Новый телефон")
    await say("Samsung Galaxy S24")
    expect(last()).toContain("Шаг 2 из 8")
    await say(i1)
    await say(i2)
    await say("R5CW30ABCDE")
    await press("v:256")
    await press("v:USED")
    await say("450 000")
    await press("skip")
    await press("ok")

    const phone = await prisma.phone.findFirstOrThrow({ where: { ownerId: user.id } })
    expect(phone).toMatchObject({ model: "Samsung Galaxy S24", imei1: i1, imei2: i2, serialNumber: "R5CW30ABCDE", memoryGb: 256, condition: "USED", purchasePrice: 450_000, supplier: null })
  })

  it("дубль IMEI не принимается", async () => {
    const user = await company()
    const existing = await createPhone(user.id)
    await say("➕ Новый телефон")
    await say("iPhone 15")
    await say(existing.imei1)
    expect(last()).toContain("Пришлите другой IMEI")
  })

  it("💰 продажа в долг по IMEI: предоплата, срок, телефон продан", async () => {
    const user = await company()
    const phone = await createPhone(user.id, { purchasePrice: 400_000 })
    await say("💰 Продать")
    await say(phone.imei1.slice(-4))
    expect(last()).toContain("Цена продажи")
    await say("520 000")
    await press("v:DEBT")
    await say("Ержан")
    await press("skip")
    await say("100000")
    await press("v:7")
    expect(last()).toContain("Прибыль: <b>120 000 ₸</b>")
    expect(last()).toContain("Долг: <b>420 000 ₸</b>")
    await press("ok")
    expect(last()).toContain("Продано")

    const sale = await prisma.sale.findFirstOrThrow({ where: { phoneId: phone.id } })
    expect(sale).toMatchObject({ salePrice: 520_000, paidAmount: 100_000, paymentMethod: "DEBT", buyerName: "Ержан" })
    expect(sale.dueDate).not.toBeNull()
    expect((await prisma.phone.findUniqueOrThrow({ where: { id: phone.id } })).status).toBe("SOLD")
    // после продажи — сразу кнопка «На верификацию»
    expect(buttons()).toContainEqual(["🛡 На верификацию", `vp:${phone.id}`])
  })

  it("🛡 верификатору: передача, сумма, уведомление ему", async () => {
    const user = await company()
    const agent = await createUser({ role: "VERIFIER", name: "Мади" })
    const phone = await createPhone(user.id, { imei2: makeImei(), status: "SOLD" })
    await press(`vp:${phone.id}`)
    expect(buttons()).toContainEqual([expect.stringContaining("Мади"), `ag:${agent.id}`])
    await press(`ag:${agent.id}`)
    await press("v:25000")
    await press("ok")
    expect(last()).toContain("Передан верификатору Мади")

    const v = await prisma.verification.findFirstOrThrow({ where: { phoneId: phone.id } })
    expect(v).toMatchObject({ agentId: agent.id, agentFee: 25_000, status: "HANDED" })
    expect(after).toHaveBeenCalledTimes(1)
  })

  it("🛡 своему новому человеку: недостающий IMEI2 дописывается в карточку", async () => {
    const user = await company()
    const phone = await createPhone(user.id, { status: "SOLD" }) // без IMEI2
    const imei2 = makeImei()
    await press(`vp:${phone.id}`)
    expect(last()).toContain("Не хватает IMEI2")
    await say(imei2)
    await press("own")
    await press("pr:new")
    await say("Сейткали Асель")
    await press("skip")
    await press("v:ОАЭ")
    await press("v:20000")
    await press("ok")
    expect(last()).toContain("Сейткали Асель")

    expect((await prisma.phone.findUniqueOrThrow({ where: { id: phone.id } })).imei2).toBe(imei2)
    const v = await prisma.verification.findFirstOrThrow({ where: { phoneId: phone.id }, include: { verifier: true } })
    expect(v).toMatchObject({ country: "ОАЭ", payment: 20_000, status: "HANDED", agentId: null })
    expect(v.verifier?.fullName).toBe("Сейткали Асель")
  })

  it("непроданный телефон на верификацию не отдаётся", async () => {
    const user = await company()
    const phone = await createPhone(user.id, { imei2: makeImei() })
    await press(`vp:${phone.id}`)
    expect(last()).toContain("ещё не продан")
  })

  it("IMEI в любой момент — карточка телефона; чужой телефон не виден", async () => {
    const user = await company()
    const other = await createUser()
    const mine = await createPhone(user.id, { model: "Pixel 8" })
    const foreign = await createPhone(other.id)
    await say(mine.imei1)
    expect(last()).toContain("Pixel 8")
    expect(buttons()).toContainEqual(["💰 Продать", `sp:${mine.id}`])
    await say(foreign.imei1)
    expect(last()).toContain("Не нашёл")
  })

  it("📊 сводка и отмена формы", async () => {
    await company()
    await say("📊 Сводка")
    expect(last()).toContain("Сводка")
    await say("💰 Продать")
    await press("x")
    expect(last()).toBe("Отменено.")
  })
})
