import "server-only"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { appUrl, escapeHtml, telegramApi } from "@/lib/telegram"
import type { BotState } from "./types"

// Отправка сообщений, кнопки и хранение шага диалога

export const esc = escapeHtml

/** Кнопка под сообщением: data — действие для бота, url — ссылка */
export type Button = { text: string; data?: string; url?: string | null }
export type Keyboard = Button[][]

/** Постоянное меню внизу чата */
export const MENU = {
  add: "➕ Новый телефон",
  sell: "💰 Продать",
  verify: "🛡 Верификация",
  find: "🔎 Найти по IMEI",
  stats: "📊 Сводка",
} as const

const menuKeyboard = {
  keyboard: [[{ text: MENU.add }, { text: MENU.sell }], [{ text: MENU.verify }, { text: MENU.find }], [{ text: MENU.stats }]],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "IMEI или выберите действие",
}

export const CANCEL: Button = { text: "✖️ Отмена", data: "x" }
export const SKIP: Button = { text: "Пропустить →", data: "skip" }

function inline(kb: Keyboard) {
  return {
    inline_keyboard: kb
      .map((row) => row.filter((b) => b.data || b.url).map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data })))
      .filter((row) => row.length),
  }
}

/** Сообщение с кнопками под ним (или с меню внизу, если menu=true) */
export async function send(chatId: number | string, html: string, kb?: Keyboard | "menu") {
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(kb === "menu" ? { reply_markup: menuKeyboard } : kb ? { reply_markup: inline(kb) } : {}),
  })
}

/** После нажатия кнопки: убрать кнопки у сообщения и дописать выбор, чтобы по старому сообщению не нажали ещё раз */
export async function closeButtons(chatId: number | string, messageId: number, text: string | undefined, choice?: string) {
  try {
    if (choice && text) {
      await telegramApi("editMessageText", { chat_id: chatId, message_id: messageId, text: `${text}\n\n✓ ${choice}` })
    } else {
      await telegramApi("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } })
    }
  } catch {
    // сообщение уже изменено или удалено — не важно
  }
}

export async function answerCallback(id: string, text?: string) {
  try {
    await telegramApi("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) })
  } catch {
    // кнопка устарела — не важно
  }
}

/** Кнопка «Открыть в CRM» (только если у сайта есть публичный адрес) */
export function crmButton(path: string, text = "Открыть в CRM"): Button[] {
  const url = appUrl(path)
  return url ? [{ text, url }] : []
}

/** Шаг формы: «Шаг 2 из 6 · Заголовок» */
export function stepTitle(n: number, total: number, title: string) {
  return `<i>Шаг ${n} из ${total}</i>\n<b>${title}</b>`
}

/** Кнопки по 2–3 в ряд */
export function grid(buttons: Button[], perRow = 2): Keyboard {
  const rows: Keyboard = []
  for (let i = 0; i < buttons.length; i += perRow) rows.push(buttons.slice(i, i + perRow))
  return rows
}

export async function getState(userId: string): Promise<BotState | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { telegramState: true } })
  return (u?.telegramState as BotState | null) ?? null
}

export async function setState(userId: string, state: BotState | null) {
  await prisma.user.update({ where: { id: userId }, data: { telegramState: state ? (state as Prisma.InputJsonValue) : Prisma.DbNull } })
}
