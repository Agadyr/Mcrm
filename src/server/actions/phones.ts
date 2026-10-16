"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import type { Phone } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireUser, type CurrentUser } from "@/lib/auth"
import { formatDate, formatMemory, formatMoney } from "@/lib/format"
import { normalizeImei } from "@/lib/imei"
import { PAYMENT_METHOD_LABEL, PHONE_CONDITION_LABEL, PHONE_STATUS_LABEL, RFS_STATUS_LABEL } from "@/lib/labels"
import { fieldErrorsOf, type ActionResult } from "@/lib/validators/common"
import { phoneSchema, saleSchema, type PhoneData } from "@/lib/validators/phone"
import { phoneAccessWhere } from "@/server/access"
import { logEvent } from "@/server/history"
import { conflictMessage, findImeiConflicts, type ImeiConflict } from "@/server/imei-conflicts"
import { findOrCreateCustomer } from "@/server/customers"
import { saleCreateData } from "@/server/sale-data"
import { syncPhoneWithVerifications } from "@/server/verification-sync"

// Товары: склад компании. У верификатора склада нет — его телефоны живут в «Верификациях».

function refresh() {
  revalidatePath("/", "layout")
}

const NO_STOCK: ActionResult<never> = { ok: false, error: "У верификатора нет склада" }

function findOwnPhone(id: string, ownerId: string) {
  return prisma.phone.findFirst({ where: { id, ownerId } })
}

/** Дубли IMEI → ошибки по полям формы */
async function imeiErrors(d: PhoneData, ownerId: string, excludeId?: string) {
  const conflicts = await findImeiConflicts([d.imei1, d.imei2], ownerId, excludeId)
  if (!conflicts.length) return null
  const fieldErrors: Record<string, string> = {}
  for (const c of conflicts) fieldErrors[c.imei === d.imei1 ? "imei1" : "imei2"] = conflictMessage(c)
  return fieldErrors
}

/** Подсказка в форме: этот IMEI уже есть у другого телефона */
export async function checkImeiAction(imei: string, excludeId?: string): Promise<ImeiConflict | null> {
  const user = await requireUser()
  const value = normalizeImei(imei)
  if (!/^\d{1,20}$/.test(value)) return null
  const [conflict] = await findImeiConflicts([value], user.id, excludeId)
  return conflict ?? null
}

export async function createPhoneAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  if (user.role === "VERIFIER") return NO_STOCK
  const parsed = phoneSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Проверьте поля формы", fieldErrors: fieldErrorsOf(parsed.error) }
  const d = parsed.data
  if (d.status === "SOLD") {
    return { ok: false, error: "«Продан» ставится кнопкой «Продать»", fieldErrors: { status: "Выберите другой статус" } }
  }

  const fieldErrors = await imeiErrors(d, user.id)
  if (fieldErrors) return { ok: false, error: "Такой IMEI уже записан", fieldErrors }

  try {
    const phone = await prisma.phone.create({
      data: {
        ...d,
        ownerId: user.id,
        events: {
          create: {
            type: "CREATED",
            message: `Поступил на склад${d.supplier ? ` от «${d.supplier}»` : ""}, закупка ${formatMoney(d.purchasePrice)}`,
            userId: user.id,
          },
        },
      },
      select: { id: true },
    })
    refresh()
    return { ok: true, data: phone }
  } catch (e) {
    return writeFailure(e)
  }
}

/** Что поменялось — для истории телефона */
function describeChanges(before: Phone, after: PhoneData): string[] {
  const text = (v: string | null | undefined) => v || "—"
  const fields: [string, unknown, unknown, (v: never) => string][] = [
    ["модель", before.model, after.model, text],
    ["память", before.memoryGb, after.memoryGb, (v: number | null) => formatMemory(v) || "—"],
    ["цвет", before.color, after.color, text],
    ["IMEI1", before.imei1, after.imei1, text],
    ["IMEI2", before.imei2, after.imei2, text],
    ["S/N", before.serialNumber, after.serialNumber, text],
    ["состояние", before.condition, after.condition, (v: Phone["condition"]) => PHONE_CONDITION_LABEL[v]],
    ["закупка", before.purchasePrice, after.purchasePrice, (v: number) => formatMoney(v)],
    ["дата поступления", +before.receivedAt, +after.receivedAt, (v: number) => formatDate(new Date(v))],
    ["поставщик", before.supplier, after.supplier, text],
  ]
  const out: string[] = []
  for (const [label, a, b, fmt] of fields) {
    if ((a ?? null) !== (b ?? null)) out.push(`${label}: ${fmt(a as never)} → ${fmt(b as never)}`)
  }
  if ((before.note ?? null) !== (after.note ?? null)) out.push("заметка")
  return out
}

export async function updatePhoneAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  if (user.role === "VERIFIER") return NO_STOCK
  const parsed = phoneSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Проверьте поля формы", fieldErrors: fieldErrorsOf(parsed.error) }
  const d = parsed.data

  const phone = await findOwnPhone(id, user.id)
  if (!phone) return { ok: false, error: "Телефон не найден" }
  // статус проданного меняется только отменой продажи, а «Продан» — только кнопкой «Продать»
  if (phone.status === "SOLD") d.status = "SOLD"
  else if (d.status === "SOLD") {
    return { ok: false, error: "«Продан» ставится кнопкой «Продать»", fieldErrors: { status: "Выберите другой статус" } }
  }

  const fieldErrors = await imeiErrors(d, user.id, id)
  if (fieldErrors) return { ok: false, error: "Такой IMEI уже записан", fieldErrors }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.phone.update({ where: { id }, data: d })
      const changes = describeChanges(phone, d)
      if (changes.length) await logEvent(tx, id, "UPDATED", `Изменено: ${changes.join("; ")}`, user.id)
      if (d.status !== phone.status) {
        await logEvent(
          tx,
          id,
          "STATUS_CHANGED",
          `Статус: ${PHONE_STATUS_LABEL[phone.status]} → ${PHONE_STATUS_LABEL[d.status]}`,
          user.id
        )
      }
      await syncPhoneWithVerifications(tx, id, user.id)
    })
    refresh()
    return { ok: true, data: { id } }
  } catch (e) {
    return writeFailure(e)
  }
}

export async function sellPhoneAction(id: string, input: unknown): Promise<ActionResult<{ saleId: string }>> {
  const user = await requireUser()
  if (user.role === "VERIFIER") return NO_STOCK
  const parsed = saleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Проверьте поля формы", fieldErrors: fieldErrorsOf(parsed.error) }
  const d = parsed.data

  const phone = await findOwnPhone(id, user.id)
  if (!phone) return { ok: false, error: "Телефон не найден" }
  if (phone.status === "SOLD") return { ok: false, error: "Телефон уже продан" }

  const data = saleCreateData(d)
  const debt = d.salePrice - data.paidAmount
  const message =
    `Продан ${formatDate(d.soldAt)} за ${formatMoney(d.salePrice)} (${PAYMENT_METHOD_LABEL[d.paymentMethod]})` +
    (d.buyerName ? `, покупатель: ${d.buyerName}` : "") +
    `. Прибыль ${formatMoney(d.salePrice - phone.purchasePrice)}` +
    (debt > 0 ? `. В долг: ${formatMoney(debt)}${data.dueDate ? ` до ${formatDate(data.dueDate)}` : ""}` : "")

  const sale = await prisma.$transaction(async (tx) => {
    // покупатель с номером попадает в базу клиентов (или находится там)
    const customerId = await findOrCreateCustomer(tx, user.id, d.buyerName, d.buyerPhone)
    const sale = await tx.sale.create({ data: { ...data, phoneId: id, customerId }, select: { id: true } })
    await tx.phone.update({ where: { id }, data: { status: "SOLD" } })
    await logEvent(tx, id, "SOLD", message, user.id)
    return sale
  })
  refresh()
  return { ok: true, data: { saleId: sale.id } }
}

/** Продажа остаётся в истории как отменённая, телефон возвращается в наличие */
export async function cancelSaleAction(phoneId: string): Promise<ActionResult> {
  const user = await requireUser()
  if (user.role === "VERIFIER") return NO_STOCK
  const phone = await findOwnPhone(phoneId, user.id)
  if (!phone) return { ok: false, error: "Телефон не найден" }
  const sale = await prisma.sale.findFirst({
    where: { phoneId, cancelledAt: null },
    orderBy: { createdAt: "desc" },
  })
  if (!sale) return { ok: false, error: "Активной продажи нет" }

  await prisma.$transaction(async (tx) => {
    await tx.sale.update({ where: { id: sale.id }, data: { cancelledAt: new Date() } })
    await tx.phone.update({ where: { id: phoneId }, data: { status: "IN_STOCK" } })
    await logEvent(
      tx,
      phoneId,
      "SALE_CANCELLED",
      `Продажа от ${formatDate(sale.soldAt)} за ${formatMoney(sale.salePrice)} отменена`,
      user.id
    )
    await syncPhoneWithVerifications(tx, phoneId, user.id)
  })
  refresh()
  return { ok: true, data: undefined }
}

/** Удаляет телефон с историей и продажами. Верификации остаются без связи с товаром. */
export async function deletePhoneAction(id: string): Promise<ActionResult> {
  const user = await requireUser()
  if (user.role === "VERIFIER") return NO_STOCK
  const { count } = await prisma.phone.deleteMany({ where: { id, ownerId: user.id } })
  if (!count) return { ok: false, error: "Телефон не найден" }
  refresh()
  return { ok: true, data: undefined }
}

const rfsResultSchema = z.enum(["REGISTERED", "NOT_REGISTERED"])

/** Результат ручной проверки IMEI на imei.rfs.gov.kz */
export async function setRfsResultAction(phoneId: string, result: unknown): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = rfsResultSchema.safeParse(result)
  if (!parsed.success) return { ok: false, error: "Неверный результат проверки" }
  if (!(await canCheckRfs(phoneId, user))) return { ok: false, error: "Телефон не найден" }

  await prisma.$transaction(async (tx) => {
    await tx.phone.update({ where: { id: phoneId }, data: { rfsStatus: parsed.data, rfsCheckedAt: new Date() } })
    await logEvent(
      tx,
      phoneId,
      "RFS_CHECK",
      `Проверка IMEI в РФС: ${RFS_STATUS_LABEL[parsed.data].toLowerCase()}`,
      user.id
    )
  })
  refresh()
  return { ok: true, data: undefined }
}

/** Проверить в РФС может владелец и верификатор, которому передан телефон */
async function canCheckRfs(phoneId: string, user: CurrentUser) {
  const phone = await prisma.phone.findFirst({ where: { id: phoneId, ...phoneAccessWhere(user.id) }, select: { id: true } })
  return !!phone
}

/** Гонка: два одинаковых IMEI сохранили одновременно — сработал уникальный индекс */
function writeFailure(e: unknown): ActionResult<never> {
  if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
    return { ok: false, error: "Такой IMEI уже записан", fieldErrors: { imei1: "IMEI уже записан у другого телефона" } }
  }
  console.error(e)
  return { ok: false, error: "Не удалось сохранить. Попробуйте ещё раз." }
}
