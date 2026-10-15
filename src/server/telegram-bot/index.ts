import "server-only"
import { createHash } from "node:crypto"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { getCurrentUser, runAsUser } from "@/lib/auth"
import { appUrl, isTelegramConfigured, telegramApi } from "@/lib/telegram"
import { handleAdd, startAdd } from "./flow-add"
import { handleSell, startSell } from "./flow-sell"
import { handleVerify, startVerify } from "./flow-verify"
import { looksLikeImei } from "./parse"
import { phoneButton, phoneCard, searchPhones } from "./phones"
import { sendSummary } from "./summary"
import { MENU, answerCallback, closeButtons, esc, getState, send, setState } from "./ui"
import type { Ctx, Input } from "./types"

// Telegram-бот компании: принимает обновления (вебхук или getUpdates) и ведёт диалоги.
// Все записи идут через те же server actions, что и сайт, от имени пользователя, чей чат привязан.

type Message = { message_id: number; text?: string; chat: { id: number; type?: string } }
export type TelegramUpdate = {
  update_id: number
  message?: Message
  callback_query?: {
    id: string
    data?: string
    message?: Message & { reply_markup?: { inline_keyboard: { text: string; callback_data?: string }[][] } }
  }
}

/** Секрет вебхука: Telegram присылает его в заголовке X-Telegram-Bot-Api-Secret-Token */
export function webhookSecret() {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? ""
  return process.env.TELEGRAM_WEBHOOK_SECRET || createHash("sha256").update(`mcrm-webhook:${token}`).digest("hex").slice(0, 48)
}


const WELCOME = (name: string) =>
  [
    `👋 <b>${esc(name)}</b>, это бот вашей CRM.`,
    "",
    "Прямо здесь можно:",
    "➕ добавить телефон на склад",
    "💰 продать телефон",
    "🛡 отдать на верификацию",
    "🔎 найти телефон — просто пришлите IMEI",
    "📊 посмотреть сводку за сегодня и месяц",
    "",
    "Уведомления о верификациях тоже приходят сюда. Выберите действие в меню внизу 👇",
  ].join("\n")

/** Чат привязан к аккаунту? Если к нескольким — берём привязанный последним */
function userByChat(chatId: number) {
  return prisma.user.findFirst({
    where: { telegramChatId: String(chatId), isActive: true },
    orderBy: { telegramLinkedAt: { sort: "desc", nulls: "last" } },
    select: { id: true, role: true, name: true, login: true, companyName: true },
  })
}

/** «/start КОД» из профиля CRM — привязать чат к аккаунту */
async function linkChat(chatId: number, code: string) {
  const user = await prisma.user.findUnique({ where: { telegramLinkCode: code }, select: { id: true } })
  if (!user) return false
  await prisma.user.update({
    where: { id: user.id },
    data: { telegramChatId: String(chatId), telegramLinkCode: null, telegramLinkedAt: new Date() },
  })
  return true
}

async function notLinked(chatId: number) {
  const url = appUrl("/profile")
  await send(
    chatId,
    "🔒 <b>Этот чат не подключён к CRM</b>\n\nОткройте CRM → Профиль → Telegram → «Подключить». Бот откроется по ссылке и сам привяжет аккаунт.",
    url ? [[{ text: "Открыть профиль", url }]] : undefined
  )
}

export async function handleUpdate(update: TelegramUpdate) {
  const msg = update.message ?? update.callback_query?.message
  if (!msg) return
  const chatId = msg.chat.id
  // в группах не работаем: там видят все участники
  if (msg.chat.type && msg.chat.type !== "private") return

  const cb = update.callback_query
  if (cb) await answerCallback(cb.id)

  const text = update.message?.text?.trim() ?? ""
  const start = text.match(/^\/start(?:\s+([A-Za-z0-9_-]{8,64}))?$/)
  if (start?.[1]) {
    const linked = await linkChat(chatId, start[1])
    if (!linked) return send(chatId, "Ссылка устарела. Нажмите «Подключить» в профиле CRM ещё раз.")
    revalidatePath("/", "layout")
  }

  const user = await userByChat(chatId)
  if (!user) return notLinked(chatId)
  if (user.role === "VERIFIER") {
    return send(chatId, "✅ Telegram подключён. Сюда будут приходить новые телефоны на верификацию.\n\nПродажа и склад в боте — для компаний.")
  }

  if (cb?.message) {
    const label = cb.message.reply_markup?.inline_keyboard.flat().find((b) => b.callback_data === cb.data)?.text
    await closeButtons(chatId, cb.message.message_id, cb.message.text, label)
  }

  const input: Input | null = cb?.data ? { kind: "button", data: cb.data } : text ? { kind: "text", text } : null
  if (!input) return

  try {
    const done = await runAsUser(user.id, async () => {
      const me = (await getCurrentUser())!
      await route({ chatId, user: me }, input, !!start)
      return true
    })
    if (!done) await notLinked(chatId)
  } catch (e) {
    console.error("[telegram-bot]", e)
    await setState(user.id, null).catch(() => {})
    await send(chatId, "⚠️ Что-то пошло не так. Попробуйте ещё раз.", "menu")
  }
}

const startFlow: Record<string, (ctx: Ctx) => Promise<unknown>> = {
  add: (ctx) => startAdd(ctx),
  sell: (ctx) => startSell(ctx),
  verify: (ctx) => startVerify(ctx),
  find: async (ctx) => {
    await setState(ctx.user.id, { flow: "find" })
    await send(ctx.chatId, "🔎 Пришлите IMEI, последние 4 цифры или модель.\n\n<i>Подсказка: IMEI можно присылать в любой момент, без этой кнопки.</i>", [[{ text: "✖️ Отмена", data: "x" }]])
  },
  stats: (ctx) => sendSummary(ctx),
}

const TEXT_TO_FLOW: Record<string, string> = {
  [MENU.add]: "add",
  [MENU.sell]: "sell",
  [MENU.verify]: "verify",
  [MENU.find]: "find",
  [MENU.stats]: "stats",
  "/new": "add",
  "/sell": "sell",
  "/verify": "verify",
  "/find": "find",
  "/stats": "stats",
}

async function route(ctx: Ctx, input: Input, isStart: boolean) {
  const uid = ctx.user.id

  if (input.kind === "text") {
    const t = input.text
    if (isStart || t === "/menu") {
      await setState(uid, null)
      return send(ctx.chatId, WELCOME(ctx.user.companyName || ctx.user.name || ctx.user.login), "menu")
    }
    if (t === "/cancel" || /^отмена$/i.test(t)) {
      await setState(uid, null)
      return send(ctx.chatId, "Отменено.", "menu")
    }
    // кнопка меню посреди формы — начинаем заново то, что выбрали
    const flow = TEXT_TO_FLOW[t]
    if (flow) {
      await setState(uid, null)
      return startFlow[flow](ctx)
    }
  } else {
    const data = input.data
    if (data === "x") {
      await setState(uid, null)
      return send(ctx.chatId, "Отменено.", "menu")
    }
    if (data.startsWith("m:")) {
      await setState(uid, null)
      return startFlow[data.slice(2)]?.(ctx)
    }
    if (data.startsWith("sp:")) {
      await setState(uid, null)
      return startSell(ctx, data.slice(3))
    }
    if (data.startsWith("vp:")) {
      await setState(uid, null)
      return startVerify(ctx, data.slice(3))
    }
    if (data.startsWith("ph:")) return showPhone(ctx, data.slice(3))
  }

  const state = await getState(uid)
  if (state?.flow === "add") return handleAdd(ctx, state, input)
  if (state?.flow === "sell") return handleSell(ctx, state, input)
  if (state?.flow === "verify") return handleVerify(ctx, state, input)

  // без формы: текст — это поиск телефона
  if (input.kind === "text") {
    if (state?.flow === "find" || looksLikeImei(input.text) || /^\d{4,}$/.test(input.text)) {
      await setState(uid, null)
      return find(ctx, input.text)
    }
    return send(ctx.chatId, "Выберите действие в меню внизу или пришлите IMEI телефона.", "menu")
  }
  // старая кнопка от завершённой формы
  return send(ctx.chatId, "Эта форма уже закрыта. Выберите действие в меню.", "menu")
}

async function find(ctx: Ctx, query: string) {
  const found = await searchPhones(ctx.user.id, query, "any")
  if (found.length === 0) {
    return send(ctx.chatId, `Не нашёл телефон «${esc(query)}».`, [[{ text: "➕ Добавить на склад", data: "m:add" }]])
  }
  if (found.length === 1) return showPhone(ctx, found[0].id)
  return send(ctx.chatId, `Нашёл ${found.length}:`, found.map((f) => [phoneButton(f, "ph")]))
}

async function showPhone(ctx: Ctx, phoneId: string) {
  const card = await phoneCard(ctx.user.id, phoneId)
  if (!card) return send(ctx.chatId, "Телефон не найден.")
  await send(ctx.chatId, card.html, card.kb)
}

/**
 * Забрать обновления через getUpdates и обработать (когда вебхук не настроен: компьютер, проверка привязки в профиле).
 * Если вебхук настроен, Telegram вернёт ошибку — обновления и так приходят на /api/telegram/webhook.
 */
export async function pullTelegramUpdates() {
  if (!isTelegramConfigured()) return
  const updates = await telegramApi<TelegramUpdate[]>("getUpdates", { timeout: 0, allowed_updates: ["message", "callback_query"] })
  if (updates.length === 0) return
  for (const u of updates) {
    try {
      await handleUpdate(u)
    } catch (e) {
      console.error("[telegram-bot]", e)
    }
  }
  // подтверждаем обработанные, чтобы не получать их снова
  await telegramApi("getUpdates", { offset: updates[updates.length - 1].update_id + 1, timeout: 0 })
}
