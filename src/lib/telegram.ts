import "server-only"

// Telegram: вызовы Bot API и уведомления. Без TELEGRAM_BOT_TOKEN всё работает, просто ничего не отправляется.
// Диалоги бота (продажа, новый телефон, верификация) — в src/server/telegram-bot.

const API = process.env.TELEGRAM_API_URL || "https://api.telegram.org"

export function isTelegramConfigured() {
  return !!process.env.TELEGRAM_BOT_TOKEN
}

export async function telegramApi<T = unknown>(method: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  })
  const json = (await res.json()) as { ok: boolean; result: T; description?: string }
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description ?? res.status}`)
  return json.result
}

let botUsername: string | null = null
export async function getBotUsername(): Promise<string | null> {
  if (!isTelegramConfigured()) return null
  if (!botUsername) botUsername = (await telegramApi<{ username: string }>("getMe")).username
  return botUsername
}

/** Адрес сайта для ссылок в сообщениях (APP_URL или адрес проекта на Vercel) */
export function appUrl(path: string): string | null {
  const base =
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")
  // Telegram не принимает кнопки-ссылки на localhost
  if (!base || /localhost|127\.0\.0\.1/.test(base)) return null
  return base.replace(/\/$/, "") + path
}

export function escapeHtml(s: string | null | undefined) {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Отправить сообщение. Ошибки не пробрасываем — уведомление не должно ломать основное действие. */
export async function sendTelegram(chatId: string | null | undefined, html: string, link?: { url: string | null; text: string }) {
  if (!chatId || !isTelegramConfigured()) return false
  try {
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(link?.url ? { reply_markup: { inline_keyboard: [[{ text: link.text, url: link.url }]] } } : {}),
    })
    return true
  } catch (e) {
    console.error("[telegram]", e)
    return false
  }
}
