"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"
import type { Prisma, VerificationStatus } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireUser, type CurrentUser } from "@/lib/auth"
import { todayDate } from "@/lib/dates"
import { formatDate, formatMoney } from "@/lib/format"
import {
  BLOCKING_VERIFICATION_STATUSES,
  FINAL_VERIFICATION_STATUSES,
  VERIFICATION_STATUS_LABEL,
  VERIFICATION_STATUSES,
} from "@/lib/labels"
import { fieldErrorsOf, type ActionResult } from "@/lib/validators/common"
import {
  agentWorkSchema,
  batchHandoverSchema,
  missingForVerification,
  verificationSchema,
  type VerificationData,
} from "@/lib/validators/verification"
import { displayName, handlerOf, verificationAccessWhere } from "@/server/access"
import { conflictMessage, findImeiConflicts } from "@/server/imei-conflicts"
import { logEvent } from "@/server/history"
import { syncPhoneWithVerifications } from "@/server/verification-sync"
import { notifyAgentAssigned, notifyAgentAssignedBatch, notifyAgentStatusChanged, notifyStatusFinal } from "@/server/notify"

// Права:
//  • владелец телефона (компания) — создаёт верификацию, выбирает верификатора и его сумму, отмечает «оплачено
//    верификатору», может отменить передачу;
//  • ведущий (верификатор, если передано ему, иначе владелец) — выбирает человека, меняет статус, платит человеку.
// Компания не видит человека, которого нашёл верификатор: в истории телефона пишем только верификатора и статус.

const FINAL = FINAL_VERIFICATION_STATUSES

/** Верификатор ведёт телефон компании: о результате («Верифицирован», «Не зарегистрирован», «Отказ») сообщаем компании в Telegram */
function notifyIfFinished(id: string, prev: VerificationStatus, next: VerificationStatus) {
  if (prev !== next && FINAL.includes(next)) after(() => notifyStatusFinal(id))
}

function refresh() {
  revalidatePath("/", "layout")
}

class UserError extends Error {
  constructor(
    message: string,
    public fieldErrors?: Record<string, string>
  ) {
    super(message)
  }
}

function failure(e: unknown): ActionResult<never> {
  if (e instanceof UserError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors }
  console.error(e)
  return { ok: false, error: "Не удалось сохранить. Попробуйте ещё раз." }
}

/** Телефон и снимок его данных: проданный из товаров или клиентский, введённый вручную */
type PhoneInput = Pick<VerificationData, "phoneMode" | "phoneId" | "phoneModel" | "imei1" | "imei2" | "serialNumber">

/**
 * На верификацию идёт только проданный телефон: до продажи — нельзя.
 * Повторно — только если прошлая верификация закончилась «Отказ» или «Не зарегистрирован».
 * currentId — редактируемая верификация (её саму не считаем), keepPhoneId — телефон, уже привязанный к ней.
 */
async function resolvePhone(
  tx: Prisma.TransactionClient,
  d: PhoneInput,
  userId: string,
  current?: { id: string; phoneId: string | null }
) {
  if (d.phoneMode === "stock") {
    const phone = await tx.phone.findFirst({
      where: { id: d.phoneId!, ownerId: userId },
    })
    if (!phone)
      throw new UserError("Телефон не найден", {
        phoneId: "Телефон не найден",
      })
    const missing = missingForVerification(phone)
    if (missing.length) {
      const message = `У телефона не заполнено: ${missing.join(", ")}. Дополните карточку товара.`
      throw new UserError(message, { phoneId: message })
    }
    if (phone.id !== current?.phoneId) {
      if (phone.status !== "SOLD") {
        const message = `${phone.model}: на верификацию можно отдать только проданный телефон`
        throw new UserError(message, { phoneId: "Телефон ещё не продан" })
      }
      const busy = await tx.verification.findFirst({
        where: {
          phoneId: phone.id,
          status: { in: BLOCKING_VERIFICATION_STATUSES },
          ...(current ? { NOT: { id: current.id } } : {}),
        },
        select: { status: true },
      })
      if (busy) {
        const message = busy.status === "VERIFIED" ? "Телефон уже верифицирован" : "Телефон уже на верификации"
        throw new UserError(`${phone.model}: ${message.toLowerCase()}`, {
          phoneId: message,
        })
      }
    }
    return {
      phoneId: phone.id,
      phoneModel: phone.model,
      imei1: phone.imei1,
      imei2: phone.imei2,
      serialNumber: phone.serialNumber,
    }
  }

  // телефон, который есть в товарах, вручную не вводим — его выбирают из списка проданных
  const conflicts = await findImeiConflicts([d.imei1, d.imei2], userId, null, tx)
  if (conflicts.length) {
    const fieldErrors: Record<string, string> = {}
    for (const c of conflicts) fieldErrors[c.imei === d.imei1 ? "imei1" : "imei2"] = conflictMessage(c)
    throw new UserError("Этот телефон есть в товарах — выберите его из списка проданных", fieldErrors)
  }
  return {
    phoneId: null,
    phoneModel: d.phoneModel!,
    imei1: d.imei1,
    imei2: d.imei2,
    serialNumber: d.serialNumber,
  }
}

/** Человек из справочника пользователя или новый */
async function resolveTraveler(
  tx: Prisma.TransactionClient,
  d: {
    verifierMode: string
    verifierId?: string | null
    verifierName?: string | null
    verifierPhone?: string | null
  },
  userId: string
) {
  if (d.verifierMode === "existing") {
    const v = await tx.verifier.findFirst({
      where: { id: d.verifierId!, ownerId: userId },
      select: { id: true, fullName: true },
    })
    if (!v) throw new UserError("Человек не найден", { verifierId: "Не найден" })
    return v
  }
  if (d.verifierMode === "new") {
    return tx.verifier.create({
      data: {
        ownerId: userId,
        fullName: d.verifierName!,
        phone: d.verifierPhone ?? null,
      },
      select: { id: true, fullName: true },
    })
  }
  return null
}

/** Верификатор-аккаунт, которому компания передаёт телефон */
async function resolveAgent(tx: Prisma.TransactionClient, agentId: string) {
  const agent = await tx.user.findFirst({
    where: { id: agentId, role: "VERIFIER", isActive: true },
    select: { id: true, name: true, login: true },
  })
  if (!agent)
    throw new UserError("Верификатор не найден", {
      agentId: "Не найден или заблокирован",
    })
  return agent
}

/** Дата завершения ставится сама: при «Верифицирован»/«Отказ» — сегодня (или прежняя), иначе пусто */
function completionDate(status: VerificationStatus, previous: Date | null) {
  return FINAL.includes(status) ? (previous ?? todayDate()) : null
}

function travelerText(name: string, country: string | null) {
  return `${name}${country ? ` (${country})` : ""}`
}

/** Создание: компания/верификатор оформляют верификацию своего телефона */
export async function createVerificationAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  const parsed = verificationSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      error: "Проверьте поля формы",
      fieldErrors: fieldErrorsOf(parsed.error),
    }
  const d = parsed.data
  if (d.verifierMode === "agent" && user.role === "VERIFIER") {
    return {
      ok: false,
      error: "Верификатор не может передать телефон другому верификатору",
    }
  }
  // у верификатора нет склада: телефон вводится вручную прямо в верификацию
  if (user.role === "VERIFIER") Object.assign(d, { phoneMode: "manual" })

  try {
    const id = await prisma.$transaction(async (tx) => {
      const phone = await resolvePhone(tx, d, user.id)

      // ── Компания передаёт телефон верификатору: человека он найдёт сам
      if (d.verifierMode === "agent") {
        const agent = await resolveAgent(tx, d.agentId!)
        const v = await tx.verification.create({
          data: {
            ...phone,
            ownerId: user.id,
            agentId: agent.id,
            agentFee: d.agentFee,
            agentPaid: d.agentPaid,
            agentPaidAt: d.agentPaid ? new Date() : null,
            handedAt: d.handedAt,
            imeiGiven: "BOTH",
            status: "HANDED",
            note: d.note,
          },
        })
        if (phone.phoneId) {
          await logEvent(
            tx,
            phone.phoneId,
            "VERIFICATION_CREATED",
            `Передан верификатору ${displayName(agent)} за ${formatMoney(d.agentFee)}`,
            user.id
          )
          await syncPhoneWithVerifications(tx, phone.phoneId, user.id)
        }
        after(() => notifyAgentAssigned(v.id))
        return v.id
      }

      // ── Сам отдаёт IMEI человеку (компания напрямую или верификатор со своим телефоном)
      const traveler = (await resolveTraveler(tx, d, user.id))!
      const isAgent = user.role === "VERIFIER"
      const v = await tx.verification.create({
        data: {
          ...phone,
          ownerId: user.id,
          // у верификатора свои телефоны тоже «его»: agentFee = сколько ему заплатит клиент
          agentId: isAgent ? user.id : null,
          agentFee: isAgent ? d.agentFee : 0,
          agentPaid: isAgent ? d.agentPaid : false,
          agentPaidAt: isAgent && d.agentPaid ? new Date() : null,
          verifierId: traveler.id,
          country: d.country,
          handedAt: d.handedAt,
          imeiGiven: "BOTH",
          payment: d.payment,
          isPaid: d.isPaid,
          paidAt: d.isPaid ? new Date() : null,
          status: d.status,
          completedAt: completionDate(d.status, null),
          note: d.note,
        },
      })
      if (phone.phoneId) {
        await logEvent(
          tx,
          phone.phoneId,
          "VERIFICATION_CREATED",
          `Отдан на верификацию: ${travelerText(traveler.fullName, d.country)}, статус «${VERIFICATION_STATUS_LABEL[d.status]}»`,
          user.id
        )
        await syncPhoneWithVerifications(tx, phone.phoneId, user.id)
      }
      return v.id
    })
    refresh()
    return { ok: true, data: { id } }
  } catch (e) {
    return failure(e)
  }
}

/** Компания передаёт одному верификатору сразу несколько телефонов — одна запись на каждый телефон */
export async function createBatchHandoverAction(input: unknown): Promise<ActionResult<{ ids: string[] }>> {
  const user = await requireUser()
  if (user.role === "VERIFIER")
    return {
      ok: false,
      error: "Верификатор не может передать телефон другому верификатору",
    }
  const parsed = batchHandoverSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      error: "Проверьте телефоны в списке",
      fieldErrors: fieldErrorsOf(parsed.error),
    }
  const d = parsed.data

  try {
    const ids = await prisma.$transaction(
      async (tx) => {
        const agent = await resolveAgent(tx, d.agentId)
        const ids: string[] = []
        for (const [i, it] of d.items.entries()) {
          const n = i + 1
          let phone: Awaited<ReturnType<typeof resolvePhone>>
          try {
            phone = await resolvePhone(tx, { ...it, phoneMode: it.phoneId ? "stock" : "manual" }, user.id)
          } catch (e) {
            // ошибка конкретного телефона — показываем у его строки
            if (e instanceof UserError) {
              const fieldErrors = Object.fromEntries(Object.entries(e.fieldErrors ?? {}).map(([k, v]) => [`items.${i}.${k}`, v]))
              throw new UserError(`Телефон №${n}: ${e.message}`, fieldErrors)
            }
            throw e
          }
          const v = await tx.verification.create({
            data: {
              ...phone,
              ownerId: user.id,
              agentId: agent.id,
              agentFee: it.agentFee,
              agentPaid: d.agentPaid,
              agentPaidAt: d.agentPaid ? new Date() : null,
              handedAt: d.handedAt,
              imeiGiven: "BOTH",
              status: "HANDED",
              note: d.note,
            },
          })
          if (phone.phoneId) {
            await logEvent(
              tx,
              phone.phoneId,
              "VERIFICATION_CREATED",
              `Передан верификатору ${displayName(agent)} за ${formatMoney(it.agentFee)}` +
                (d.items.length > 1 ? ` (вместе с ещё ${d.items.length - 1} шт.)` : ""),
              user.id
            )
            await syncPhoneWithVerifications(tx, phone.phoneId, user.id)
          }
          ids.push(v.id)
        }
        return ids
      },
      { timeout: 60_000 }
    )
    after(() => notifyAgentAssignedBatch(ids))
    refresh()
    return { ok: true, data: { ids } }
  } catch (e) {
    return failure(e)
  }
}

/** Редактирование владельцем (полная форма) */
export async function updateVerificationAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  const parsed = verificationSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      error: "Проверьте поля формы",
      fieldErrors: fieldErrorsOf(parsed.error),
    }
  const d = parsed.data

  const existing = await prisma.verification.findFirst({
    where: { id, ownerId: user.id },
  })
  if (!existing) return { ok: false, error: "Верификация не найдена" }
  if (d.verifierMode === "agent" && user.role === "VERIFIER") {
    return {
      ok: false,
      error: "Верификатор не может передать телефон другому верификатору",
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const phone = await resolvePhone(tx, d, user.id, {
        id,
        phoneId: existing.phoneId,
      })
      let message: string

      if (d.verifierMode === "agent") {
        const agent = await resolveAgent(tx, d.agentId!)
        const sameAgent = existing.agentId === agent.id
        await tx.verification.update({
          where: { id },
          data: {
            ...phone,
            agentId: agent.id,
            agentFee: d.agentFee,
            agentPaid: d.agentPaid,
            agentPaidAt: d.agentPaid ? (existing.agentPaidAt ?? new Date()) : null,
            handedAt: d.handedAt,
            note: d.note,
            // новый верификатор начинает с нуля: человек, оплата и статус — его
            ...(sameAgent
              ? {}
              : {
                  verifierId: null,
                  country: null,
                  payment: 0,
                  isPaid: false,
                  paidAt: null,
                  status: "HANDED",
                  completedAt: null,
                  agentNote: null,
                }),
          },
        })
        message = sameAgent
          ? `Передача верификатору ${displayName(agent)} изменена (${formatMoney(d.agentFee)})`
          : `Передан верификатору ${displayName(agent)} за ${formatMoney(d.agentFee)}`
        if (!sameAgent) after(() => notifyAgentAssigned(id))
      } else {
        const traveler = (await resolveTraveler(tx, d, user.id))!
        const isAgent = user.role === "VERIFIER"
        await tx.verification.update({
          where: { id },
          data: {
            ...phone,
            agentId: isAgent ? user.id : null,
            agentFee: isAgent ? d.agentFee : 0,
            agentPaid: isAgent ? d.agentPaid : false,
            agentPaidAt: isAgent && d.agentPaid ? (existing.agentPaidAt ?? new Date()) : null,
            verifierId: traveler.id,
            country: d.country,
            handedAt: d.handedAt,
            payment: d.payment,
            isPaid: d.isPaid,
            paidAt: d.isPaid ? (existing.paidAt ?? new Date()) : null,
            status: d.status,
            completedAt: completionDate(d.status, existing.completedAt),
            note: d.note,
          },
        })
        message = `Верификация изменена: ${travelerText(traveler.fullName, d.country)}, статус «${VERIFICATION_STATUS_LABEL[d.status]}»`
      }

      if (existing.phoneId && existing.phoneId !== phone.phoneId) {
        await logEvent(tx, existing.phoneId, "VERIFICATION_UPDATED", "Верификация перенесена на другой телефон", user.id)
        await syncPhoneWithVerifications(tx, existing.phoneId, user.id)
      }
      if (phone.phoneId) {
        await logEvent(tx, phone.phoneId, "VERIFICATION_UPDATED", message, user.id)
        await syncPhoneWithVerifications(tx, phone.phoneId, user.id)
      }
    })
    refresh()
    return { ok: true, data: { id } }
  } catch (e) {
    return failure(e)
  }
}

/** Верификатор работает по телефону компании: кого нашёл, статус, оплата человеку, своя заметка */
export async function updateAgentWorkAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  const parsed = agentWorkSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      error: "Проверьте поля формы",
      fieldErrors: fieldErrorsOf(parsed.error),
    }
  const d = parsed.data

  const existing = await prisma.verification.findFirst({
    where: { id, agentId: user.id },
  })
  if (!existing) return { ok: false, error: "Верификация не найдена" }

  try {
    await prisma.$transaction(async (tx) => {
      const traveler = await resolveTraveler(tx, d, user.id)
      await tx.verification.update({
        where: { id },
        data: {
          verifierId: traveler?.id ?? null,
          country: d.country,
          payment: d.payment,
          isPaid: d.isPaid,
          paidAt: d.isPaid ? (existing.paidAt ?? new Date()) : null,
          status: d.status,
          completedAt: completionDate(d.status, existing.completedAt),
          agentNote: d.agentNote,
        },
      })
      if (existing.phoneId && existing.status !== d.status) {
        await logEvent(
          tx,
          existing.phoneId,
          "VERIFICATION_UPDATED",
          `Верификатор ${displayName(user)}: ${VERIFICATION_STATUS_LABEL[existing.status]} → ${VERIFICATION_STATUS_LABEL[d.status]}`,
          user.id
        )
      }
      if (existing.phoneId) await syncPhoneWithVerifications(tx, existing.phoneId, user.id)
    })
    if (existing.ownerId !== user.id) notifyIfFinished(id, existing.status, d.status)
    refresh()
    return { ok: true, data: { id } }
  } catch (e) {
    return failure(e)
  }
}

async function findAccessible(id: string, user: CurrentUser) {
  return prisma.verification.findFirst({
    where: { id, ...verificationAccessWhere(user.id) },
    include: {
      verifier: true,
      agent: { select: { id: true, name: true, login: true } },
    },
  })
}

/**
 * Быстрая смена статуса из списка: ведущий (верификатор, если передано ему) или владелец телефона.
 * Компания может поставить статус и за верификатора (например, он сообщил результат по телефону) —
 * тогда верификатору уходит уведомление, а человека выбирать не нужно: его ищет верификатор.
 */
export async function setVerificationStatusAction(id: string, status: string): Promise<ActionResult> {
  const user = await requireUser()
  if (!(VERIFICATION_STATUSES as string[]).includes(status)) return { ok: false, error: "Неизвестный статус" }
  const next = status as VerificationStatus

  const v = await findAccessible(id, user)
  if (!v) return { ok: false, error: "Верификация не найдена" }
  const isHandler = handlerOf(v) === user.id
  const ownerOverAgent = !isHandler && v.ownerId === user.id
  if (!isHandler && !ownerOverAgent) return { ok: false, error: "Статус меняет верификатор" }
  if (isHandler && !v.verifierId && next !== "HANDED")
    return {
      ok: false,
      error: "Сначала выберите человека, которому отдали IMEI",
    }
  if (v.status === next) return { ok: true, data: undefined }

  // в историю телефона компании — без данных человека
  const who = ownerOverAgent
    ? `Компания изменила статус (верификатор ${displayName(v.agent!)})`
    : v.agent && v.agentId !== v.ownerId
      ? `Верификатор ${displayName(v.agent)}`
      : `Верификация (${v.verifier?.fullName ?? "—"})`
  await prisma.$transaction(async (tx) => {
    await tx.verification.update({
      where: { id },
      data: { status: next, completedAt: completionDate(next, v.completedAt) },
    })
    if (v.phoneId) {
      await logEvent(
        tx,
        v.phoneId,
        "VERIFICATION_UPDATED",
        `${who}: ${VERIFICATION_STATUS_LABEL[v.status]} → ${VERIFICATION_STATUS_LABEL[next]}`,
        user.id
      )
      await syncPhoneWithVerifications(tx, v.phoneId, user.id)
    }
  })
  if (ownerOverAgent) after(() => notifyAgentStatusChanged(id, v.status))
  else if (v.agentId && v.agentId !== v.ownerId) notifyIfFinished(id, v.status, next)
  refresh()
  return { ok: true, data: undefined }
}

/** Оплата человеку — отмечает ведущий */
export async function setVerificationPaidAction(id: string, isPaid: boolean): Promise<ActionResult> {
  const user = await requireUser()
  const v = await findAccessible(id, user)
  if (!v) return { ok: false, error: "Верификация не найдена" }
  if (handlerOf(v) !== user.id) return { ok: false, error: "Нет доступа" }
  await prisma.verification.update({
    where: { id },
    data: { isPaid, paidAt: isPaid ? new Date() : null },
  })
  refresh()
  return { ok: true, data: undefined }
}

/** Оплата верификатору — отмечает владелец телефона (у верификатора со своим телефоном — он сам) */
export async function setAgentPaidAction(id: string, agentPaid: boolean): Promise<ActionResult> {
  const user = await requireUser()
  const v = await findAccessible(id, user)
  if (!v || !v.agentId) return { ok: false, error: "Верификация не найдена" }
  if (v.ownerId !== user.id) return { ok: false, error: "Оплату отмечает компания" }
  await prisma.$transaction(async (tx) => {
    await tx.verification.update({
      where: { id },
      data: { agentPaid, agentPaidAt: agentPaid ? new Date() : null },
    })
    if (v.phoneId && v.agent && v.agentId !== v.ownerId && v.agentFee > 0) {
      await logEvent(
        tx,
        v.phoneId,
        "VERIFICATION_UPDATED",
        `Оплата верификатору ${displayName(v.agent)} (${formatMoney(v.agentFee)}): ${agentPaid ? "оплачено" : "отметка снята"}`,
        user.id
      )
    }
  })
  refresh()
  return { ok: true, data: undefined }
}

/** Удалить (отменить передачу) может только владелец телефона */
export async function deleteVerificationAction(id: string): Promise<ActionResult> {
  const user = await requireUser()
  const v = await prisma.verification.findFirst({
    where: { id, ownerId: user.id },
    include: { verifier: true, agent: { select: { name: true, login: true } } },
  })
  if (!v) return { ok: false, error: "Удалить может только владелец телефона" }
  const who = v.agent && v.agentId !== v.ownerId ? `верификатор ${displayName(v.agent)}` : (v.verifier?.fullName ?? "—")
  await prisma.$transaction(async (tx) => {
    await tx.verification.delete({ where: { id } })
    if (v.phoneId) {
      await logEvent(tx, v.phoneId, "VERIFICATION_DELETED", `Удалена верификация от ${formatDate(v.handedAt)} (${who})`, user.id)
      await syncPhoneWithVerifications(tx, v.phoneId, user.id)
    }
  })
  refresh()
  return { ok: true, data: undefined }
}
