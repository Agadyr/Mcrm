// Бот на компьютере, без вебхука: забирает сообщения у Telegram (long polling) и передаёт их
// запущенному сайту (npm run dev) на /api/telegram/webhook — так работает та же логика, что и на сервере.
// Запуск: npm run bot:dev   (в соседнем терминале должен работать npm run dev)
import { createHash } from "node:crypto"

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) {
  console.error("Задайте TELEGRAM_BOT_TOKEN в .env")
  process.exit(1)
}
const SITE = process.env.BOT_DEV_SITE || "http://localhost:3000"
const API = `${process.env.TELEGRAM_API_URL || "https://api.telegram.org"}/bot${token}`
const secret = process.env.TELEGRAM_WEBHOOK_SECRET || createHash("sha256").update(`mcrm-webhook:${token}`).digest("hex").slice(0, 48)

async function tg(method, body = {}) {
  const res = await fetch(`${API}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const json = await res.json()
  if (!json.ok) throw new Error(`${method}: ${json.description}`)
  return json.result
}

const info = await tg("getWebhookInfo")
if (info.url && !process.argv.includes("--force")) {
  console.error(`У бота настроен вебхук: ${info.url}\nСообщения уходят туда. Чтобы забрать бота на компьютер: npm run bot:dev -- --force (вебхук будет снят).`)
  process.exit(1)
}
if (info.url) await tg("deleteWebhook")
const me = await tg("getMe")
const { BOT_COMMANDS } = await import("./telegram-commands.mjs")
await tg("setMyCommands", { commands: BOT_COMMANDS })
console.log(`Бот @${me.username} слушает сообщения и передаёт их на ${SITE}. Ctrl+C — остановить.`)

let offset = 0
for (;;) {
  try {
    const updates = await tg("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] })
    for (const u of updates) {
      offset = u.update_id + 1
      const res = await fetch(`${SITE}/api/telegram/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret },
        body: JSON.stringify(u),
      })
      if (!res.ok) console.error(`Сайт ответил ${res.status} — запущен ли npm run dev?`)
    }
  } catch (e) {
    console.error(e.message)
    await new Promise((r) => setTimeout(r, 3000))
  }
}
