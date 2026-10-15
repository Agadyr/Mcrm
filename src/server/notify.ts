import "server-only"
import { prisma } from "@/lib/db"
import type { VerificationStatus } from "@prisma/client"
import { formatMoney } from "@/lib/format"
import { VERIFICATION_STATUS_LABEL } from "@/lib/labels"
import { appUrl, escapeHtml, sendTelegram } from "@/lib/telegram"

// Уведомления в Telegram о событиях верификации. Вызываются после ответа пользователю (next/server after).

const who = (u: { name: string | null; login: string; companyName?: string | null }) =>
  escapeHtml(u.companyName || u.name || u.login)

function phoneLines(v: { phoneModel: string; imei1: string; imei2: string | null; serialNumber: string | null }) {
  return [
    `📱 <b>${escapeHtml(v.phoneModel)}</b>`,
    `IMEI1: <code>${v.imei1}</code>`,
    v.imei2 ? `IMEI2: <code>${v.imei2}</code>` : null,
    v.serialNumber ? `S/N: <code>${escapeHtml(v.serialNumber)}</code>` : null,
  ]
    .filter(Boolean)
    .join("\n")
}

async function load(id: string) {
  return prisma.verification.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true, login: true, companyName: true, telegramChatId: true } },
      agent: { select: { name: true, login: true, telegramChatId: true } },
    },
  })
}

/** Верификатору: компания передала телефон */
export async function notifyAgentAssigned(verificationId: string) {
  const v = await load(verificationId)
  if (!v?.agent || v.agentId === v.ownerId) return
  await sendTelegram(
    v.agent.telegramChatId,
    `🆕 <b>Новый телефон на верификацию</b>\nОт: ${who(v.owner)}\n\n${phoneLines(v)}\n\nСумма вам: <b>${formatMoney(v.agentFee)}</b>`,
    { url: appUrl(`/verifications/${v.id}`), text: "Открыть в CRM" }
  )
}

/** Верификатору: компания передала сразу несколько телефонов — одно сообщение со списком */
export async function notifyAgentAssignedBatch(verificationIds: string[]) {
  if (verificationIds.length === 1) return notifyAgentAssigned(verificationIds[0])
  const list = await prisma.verification.findMany({
    where: { id: { in: verificationIds } },
    include: {
      owner: { select: { name: true, login: true, companyName: true } },
      agent: { select: { name: true, login: true, telegramChatId: true } },
    },
    orderBy: { createdAt: "asc" },
  })
  const first = list[0]
  if (!first?.agent || first.agentId === first.ownerId) return
  const total = list.reduce((a, v) => a + v.agentFee, 0)
  const SHOWN = 15
  const lines = list
    .slice(0, SHOWN)
    .map((v, i) => `${i + 1}. <b>${escapeHtml(v.phoneModel)}</b> — <code>${v.imei1}</code>`)
  if (list.length > SHOWN) lines.push(`…и ещё ${list.length - SHOWN}`)
  await sendTelegram(
    first.agent.telegramChatId,
    `🆕 <b>${list.length} телефонов на верификацию</b>
От: ${who(first.owner)}

${lines.join("\n")}

Сумма вам: <b>${formatMoney(total)}</b>`,
    { url: appUrl(`/verifications?status=HANDED`), text: "Открыть в CRM" }
  )
}

/** Компании: верификатор завершил телефон — «Верифицирован», «Не зарегистрирован» или «Отказ» */
export async function notifyStatusFinal(verificationId: string) {
  const v = await load(verificationId)
  if (!v?.agent || v.agentId === v.ownerId) return
  const title =
    v.status === "VERIFIED"
      ? "✅ <b>Верифицирован</b>"
      : v.status === "NOT_REGISTERED"
        ? "⚠️ <b>Не зарегистрирован в базе</b>"
        : "❌ <b>Отказ</b>"
  await sendTelegram(
    v.owner.telegramChatId,
    `${title}\nВерификатор: ${who(v.agent)}\n\n${phoneLines(v)}`,
    { url: appUrl(v.phoneId ? `/phones/${v.phoneId}` : "/verifications"), text: "Открыть в CRM" }
  )
}

/** Верификатору: компания сама поменяла статус его телефона */
export async function notifyAgentStatusChanged(verificationId: string, prev: VerificationStatus) {
  const v = await load(verificationId)
  if (!v?.agent || v.agentId === v.ownerId) return
  await sendTelegram(
    v.agent.telegramChatId,
    `🔄 <b>Компания изменила статус</b>\nОт: ${who(v.owner)}\n${VERIFICATION_STATUS_LABEL[prev]} → <b>${VERIFICATION_STATUS_LABEL[v.status]}</b>\n\n${phoneLines(v)}`,
    { url: appUrl(`/verifications/${v.id}`), text: "Открыть в CRM" }
  )
}

/** Администраторам: новая заявка верификатора */
export async function notifyNewSignup(userId: string) {
  const [user, admins] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, login: true, phone: true } }),
    prisma.user.findMany({ where: { role: "ADMIN", isActive: true, NOT: { telegramChatId: null } }, select: { telegramChatId: true } }),
  ])
  if (!user) return
  for (const a of admins) {
    await sendTelegram(
      a.telegramChatId,
      `👤 <b>Заявка верификатора</b>\n${escapeHtml(user.name)} (@${escapeHtml(user.login)})\nТелефон: ${escapeHtml(user.phone)}`,
      { url: appUrl("/users"), text: "Одобрить в CRM" }
    )
  }
}
