"use server"

import { randomBytes } from "node:crypto"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/auth"
import { escapeHtml, getBotUsername, isTelegramConfigured, sendTelegram } from "@/lib/telegram"
import { pullTelegramUpdates } from "@/server/telegram-bot"
import type { ActionResult } from "@/lib/validators/common"

/** Ссылка на бота с одноразовым кодом привязки */
export async function startTelegramLinkAction(): Promise<ActionResult<{ url: string }>> {
  const user = await requireUser()
  if (!isTelegramConfigured()) return { ok: false, error: "Бот Telegram ещё не настроен" }
  try {
    const username = await getBotUsername()
    const code = randomBytes(12).toString("base64url")
    await prisma.user.update({ where: { id: user.id }, data: { telegramLinkCode: code } })
    return { ok: true, data: { url: `https://t.me/${username}?start=${code}` } }
  } catch (e) {
    console.error(e)
    return { ok: false, error: "Не удалось связаться с Telegram. Проверьте токен бота." }
  }
}

/** Проверить, нажал ли пользователь Start в боте */
export async function checkTelegramLinkAction(): Promise<ActionResult<{ linked: boolean }>> {
  const user = await requireUser()
  try {
    await pullTelegramUpdates()
  } catch (e) {
    console.error(e)
  }
  const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { telegramChatId: true } })
  const linked = !!fresh?.telegramChatId
  if (linked) revalidatePath("/", "layout")
  return { ok: true, data: { linked } }
}

export async function unlinkTelegramAction(): Promise<ActionResult> {
  const user = await requireUser()
  await prisma.user.update({
    where: { id: user.id },
    data: { telegramChatId: null, telegramLinkCode: null, telegramLinkedAt: null },
  })
  revalidatePath("/", "layout")
  return { ok: true, data: undefined }
}

export async function sendTestTelegramAction(): Promise<ActionResult> {
  const user = await requireUser()
  const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { telegramChatId: true } })
  const sent = await sendTelegram(
    fresh?.telegramChatId,
    `🔔 <b>Проверка уведомлений</b>\nВсё работает, ${escapeHtml(user.name || user.login)}!`
  )
  return sent ? { ok: true, data: undefined } : { ok: false, error: "Не удалось отправить. Подключите Telegram заново." }
}
