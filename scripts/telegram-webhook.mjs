// Подключить бота к сайту на сервере: Telegram будет присылать сообщения на APP_URL/api/telegram/webhook.
// Запуск: npm run bot:webhook          — поставить вебхук
//         npm run bot:webhook -- off   — снять (например, чтобы запустить бота на компьютере)
import { createHash } from "node:crypto"
import { BOT_COMMANDS } from "./telegram-commands.mjs"

const token = process.env.TELEGRAM_BOT_TOKEN
const base = (process.env.APP_URL || "").replace(/\/$/, "")
if (!token) {
  console.error("Задайте TELEGRAM_BOT_TOKEN")
  process.exit(1)
}
const API = `${process.env.TELEGRAM_API_URL || "https://api.telegram.org"}/bot${token}`
const secret = process.env.TELEGRAM_WEBHOOK_SECRET || createHash("sha256").update(`mcrm-webhook:${token}`).digest("hex").slice(0, 48)

async function tg(method, body = {}) {
  const res = await fetch(`${API}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const json = await res.json()
  if (!json.ok) throw new Error(`${method}: ${json.description}`)
  return json.result
}

if (process.argv[2] === "off") {
  await tg("deleteWebhook")
  console.log("Вебхук снят.")
  process.exit(0)
}
if (!base.startsWith("https://")) {
  console.error("Нужен публичный адрес сайта с https в APP_URL (например https://crm.example.kz)")
  process.exit(1)
}
await tg("setWebhook", { url: `${base}/api/telegram/webhook`, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: false })
await tg("setMyCommands", { commands: BOT_COMMANDS })
const me = await tg("getMe")
console.log(`Готово: @${me.username} → ${base}/api/telegram/webhook`)
