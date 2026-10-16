"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/auth"
import { formatDate, formatMoney } from "@/lib/format"
import { PAYMENT_METHOD_LABEL } from "@/lib/labels"
import { fieldErrorsOf, optDate, optText, type ActionResult } from "@/lib/validators/common"
import { salePaymentSchema } from "@/lib/validators/phone"
import { findOrCreateCustomer } from "@/server/customers"
import { logEvent } from "@/server/history"

// Продажи в долг: покупатель возвращает деньги частями, каждая оплата сохраняется отдельно.
// paidAmount у продажи всегда равен сумме её оплат.

function refresh() {
  revalidatePath("/", "layout")
}

function findOwnSale(id: string, ownerId: string) {
  return prisma.sale.findFirst({ where: { id, phone: { ownerId } }, include: { phone: { select: { model: true } } } })
}

/** Покупатель принёс деньги */
export async function addSalePaymentAction(saleId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = salePaymentSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Проверьте поля формы", fieldErrors: fieldErrorsOf(parsed.error) }
  const d = parsed.data

  const sale = await findOwnSale(saleId, user.id)
  if (!sale) return { ok: false, error: "Продажа не найдена" }
  if (sale.cancelledAt) return { ok: false, error: "Продажа отменена" }
  const debt = sale.salePrice - sale.paidAmount
  if (debt <= 0) return { ok: false, error: "Долга нет — продажа уже оплачена" }
  if (d.amount > debt) {
    return { ok: false, error: "Больше, чем долг", fieldErrors: { amount: `Долг всего ${formatMoney(debt)}` } }
  }

  const left = debt - d.amount
  await prisma.$transaction(async (tx) => {
    await tx.salePayment.create({ data: { saleId, amount: d.amount, paidAt: d.paidAt, method: d.method, note: d.note } })
    await tx.sale.update({
      where: { id: saleId },
      data: { paidAmount: { increment: d.amount }, ...(left > 0 && d.dueDate ? { dueDate: d.dueDate } : {}) },
    })
    await logEvent(
      tx,
      sale.phoneId,
      "SALE_PAYMENT",
      `Оплата долга ${formatMoney(d.amount)} (${PAYMENT_METHOD_LABEL[d.method]}) ${formatDate(d.paidAt)}. ` +
        (left > 0 ? `Осталось ${formatMoney(left)}` : "Долг закрыт"),
      user.id
    )
  })
  refresh()
  return { ok: true, data: undefined }
}

/** Удалить ошибочно внесённую оплату — долг вернётся */
export async function deleteSalePaymentAction(paymentId: string): Promise<ActionResult> {
  const user = await requireUser()
  const payment = await prisma.salePayment.findFirst({
    where: { id: paymentId, sale: { phone: { ownerId: user.id } } },
    include: { sale: true },
  })
  if (!payment) return { ok: false, error: "Оплата не найдена" }

  await prisma.$transaction(async (tx) => {
    await tx.salePayment.delete({ where: { id: paymentId } })
    await tx.sale.update({ where: { id: payment.saleId }, data: { paidAmount: { decrement: payment.amount } } })
    await logEvent(
      tx,
      payment.sale.phoneId,
      "SALE_PAYMENT",
      `Удалена оплата ${formatMoney(payment.amount)} от ${formatDate(payment.paidAt)}`,
      user.id
    )
  })
  refresh()
  return { ok: true, data: undefined }
}

const saleInfoSchema = z.object({
  buyerName: optText(100),
  buyerPhone: optText(50),
  dueDate: optDate(),
  note: optText(1000),
})

/** Покупатель, срок возврата долга, заметка */
export async function updateSaleInfoAction(saleId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = saleInfoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Проверьте поля формы", fieldErrors: fieldErrorsOf(parsed.error) }
  const d = parsed.data

  const sale = await findOwnSale(saleId, user.id)
  if (!sale) return { ok: false, error: "Продажа не найдена" }
  const hasDebt = sale.paidAmount < sale.salePrice && !sale.cancelledAt
  if (hasDebt && !d.buyerName && !d.buyerPhone) {
    return { ok: false, error: "У продажи есть долг", fieldErrors: { buyerName: "Укажите имя или телефон должника" } }
  }

  await prisma.$transaction(async (tx) => {
    // номер поменяли — продажа переходит к клиенту с этим номером
    const customerId = await findOrCreateCustomer(tx, user.id, d.buyerName, d.buyerPhone)
    await tx.sale.update({ where: { id: saleId }, data: { ...d, customerId } })
    if (+(d.dueDate ?? 0) !== +(sale.dueDate ?? 0) && hasDebt) {
      await logEvent(
        tx,
        sale.phoneId,
        "SALE_PAYMENT",
        d.dueDate ? `Срок возврата долга: ${formatDate(d.dueDate)}` : "Срок возврата долга снят",
        user.id
      )
    }
  })
  refresh()
  return { ok: true, data: undefined }
}
