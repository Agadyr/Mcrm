import { timingSafeEqual } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { handleUpdate, webhookSecret, type TelegramUpdate } from "@/server/telegram-bot"

// Сообщения боту от Telegram (вебхук ставится командой npm run bot:webhook).
// Отвечаем 200 даже при ошибке: иначе Telegram будет присылать то же сообщение снова и снова.

function validSecret(header: string | null) {
  const expected = Buffer.from(webhookSecret())
  const got = Buffer.from(header ?? "")
  return got.length === expected.length && timingSafeEqual(got, expected)
}

export async function POST(req: NextRequest) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !validSecret(req.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  try {
    await handleUpdate((await req.json()) as TelegramUpdate)
  } catch (e) {
    console.error("[telegram-webhook]", e)
  }
  return NextResponse.json({ ok: true })
}
